import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Server-side limits for the hosted LLM path (spec-addendum-3 D1).
 *
 * Counters live in Upstash Redis when `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are set, because serverless instances do not
 * share memory. Without them (local dev) a per-process fixed-window limiter
 * is used and a single warning is printed.
 *
 * BYOK requests never reach this module: the browser talks to the provider
 * directly, with the visitor's own key and cost.
 */

export type RateLimitFailure = {
  ok: false;
  error: "rate_limited" | "daily_cap";
  retryAfterSec: number;
};

export type RateLimitResult = { ok: true } | RateLimitFailure;

const DAY_SECONDS = 24 * 60 * 60;

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function limits() {
  return {
    clientDaily: envInt("RATE_LIMIT_CLIENT_DAILY", 30),
    ipPerMinute: envInt("RATE_LIMIT_IP_PER_MIN", 10),
    ipDaily: envInt("RATE_LIMIT_IP_DAILY", 100),
    globalDailyCap: envInt("GLOBAL_DAILY_ASK_CAP", 500),
    feedbackClientDaily: envInt("RATE_LIMIT_FEEDBACK_CLIENT_DAILY", 60),
  };
}

// ---------- in-memory fallback ----------

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let warnedAboutFallback = false;

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      error: "rate_limited",
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true };
}

// ---------- Upstash ----------

let redis: Redis | null = null;
const limiters = new Map<string, Ratelimit>();

function hasUpstash(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!.trim(),
      token: process.env.UPSTASH_REDIS_REST_TOKEN!.trim(),
    });
  }
  return redis;
}

function getLimiter(name: string, limit: number, windowSeconds: number): Ratelimit {
  const key = `${name}:${limit}:${windowSeconds}`;
  const existing = limiters.get(key);
  if (existing) return existing;
  const limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: `huh:${name}`,
    analytics: false,
  });
  limiters.set(key, limiter);
  return limiter;
}

async function upstashLimit(
  name: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const result = await getLimiter(name, limit, windowSeconds).limit(identifier);
  if (result.success) return { ok: true };
  return {
    ok: false,
    error: "rate_limited",
    retryAfterSec: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
  };
}

/** One shared check, with the in-memory window as a safety net. */
async function limit(
  name: string,
  identifier: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (!hasUpstash()) {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN are not set; using the in-memory limiter. " +
          "This is fine for local dev but does not hold across serverless instances.",
      );
    }
    return memoryLimit(`${name}:${identifier}`, max, windowSeconds * 1000);
  }

  try {
    return await upstashLimit(name, identifier, max, windowSeconds);
  } catch (error) {
    console.warn("[rate-limit] Upstash failed; falling back to the in-memory limiter.", error);
    return memoryLimit(`${name}:${identifier}`, max, windowSeconds * 1000);
  }
}

// ---------- global daily cap ----------

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function secondsUntilTomorrowUtc(): number {
  const now = Date.now();
  const tomorrow = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate() + 1,
  );
  return Math.max(60, Math.ceil((tomorrow - now) / 1000));
}

const memoryGlobal = new Map<string, number>();

/**
 * Counts the request and reports whether it exceeded today's total ask cap.
 * Call only after the per-client/per-IP checks pass, so rejected traffic does
 * not consume the shared budget.
 */
async function takeGlobalSlot(cap: number): Promise<RateLimitResult> {
  const day = utcDay();
  const retryAfterSec = secondsUntilTomorrowUtc();

  if (!hasUpstash()) {
    const next = (memoryGlobal.get(day) ?? 0) + 1;
    memoryGlobal.set(day, next);
    if (next > cap) return { ok: false, error: "daily_cap", retryAfterSec };
    return { ok: true };
  }

  try {
    const key = `huh:ask:global:${day}`;
    const client = getRedis();
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, DAY_SECONDS * 2);
    if (count > cap) return { ok: false, error: "daily_cap", retryAfterSec };
    return { ok: true };
  } catch (error) {
    console.warn("[rate-limit] global counter failed; using memory count.", error);
    const next = (memoryGlobal.get(day) ?? 0) + 1;
    memoryGlobal.set(day, next);
    if (next > cap) return { ok: false, error: "daily_cap", retryAfterSec };
    return { ok: true };
  }
}

// ---------- public checks ----------

/** Per-client daily, per-IP burst + daily, then the shared daily cap. */
export async function checkAskLimits(input: {
  clientId: string;
  ip: string;
}): Promise<RateLimitResult> {
  const config = limits();

  const clientDaily = await limit(
    "ask:client:day",
    input.clientId,
    config.clientDaily,
    DAY_SECONDS,
  );
  if (!clientDaily.ok) return clientDaily;

  const ipMinute = await limit("ask:ip:min", input.ip, config.ipPerMinute, 60);
  if (!ipMinute.ok) return ipMinute;

  const ipDaily = await limit("ask:ip:day", input.ip, config.ipDaily, DAY_SECONDS);
  if (!ipDaily.ok) return ipDaily;

  return takeGlobalSlot(config.globalDailyCap);
}

/** Feedback is cheap to store but still rate-limited (60/day per client id). */
export async function checkFeedbackLimit(clientId: string): Promise<RateLimitResult> {
  return limit(
    "feedback:client:day",
    clientId,
    limits().feedbackClientDaily,
    DAY_SECONDS,
  );
}
