import { randomUUID } from "node:crypto";
import { checkFeedbackLimit } from "@/lib/rateLimit";
import { readClientId } from "@/lib/requestIdentity";
import { getRedis } from "@/lib/upstash";
import { serverModelName } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Feedback storage (spec-addendum-3 D4). Items are pushed to the Upstash list
 * `feedback`; without Upstash they are written as one JSON line to the server
 * log. Images are never accepted or stored here.
 */

const FEEDBACK_LIST = "feedback";
const MAX_BODY_BYTES = 64_000;
const MAX_ANSWER_CHARS = 8000;
const MAX_QUESTION_CHARS = 1000;
const MAX_COMMENT_CHARS = 300;
const QUICK_REASONS = new Set(["Wrong", "Too long", "Didn't help", "Wrong language"]);

function failure(
  code: string,
  message: string,
  status: number,
  retryAfterSec = 0,
  cookie: string | null = null,
): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (cookie) headers["Set-Cookie"] = cookie;
  if (status === 429) headers["Retry-After"] = String(retryAfterSec);
  return Response.json({ error: code, message, retryAfterSec }, { status, headers });
}

type FeedbackBody = {
  messageId: string;
  rating: "up" | "down";
  reason?: string;
  comment?: string;
  answer: string;
  question: string;
  promptVersion: string;
  ts: string;
};

function parseBody(value: unknown): FeedbackBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;

  if (typeof body.messageId !== "string" || !body.messageId.trim()) return null;
  if (body.messageId.length > 200) return null;
  if (body.rating !== "up" && body.rating !== "down") return null;
  if (typeof body.answer !== "string" || body.answer.length > MAX_ANSWER_CHARS) return null;
  if (typeof body.question !== "string" || body.question.length > MAX_QUESTION_CHARS) return null;
  if (typeof body.promptVersion !== "string" || body.promptVersion.length > 40) return null;

  const reason =
    typeof body.reason === "string" && QUICK_REASONS.has(body.reason)
      ? body.reason
      : undefined;
  if (body.reason !== undefined && body.reason !== null && reason === undefined) {
    return null;
  }

  if (
    body.comment !== undefined &&
    body.comment !== null &&
    (typeof body.comment !== "string" || body.comment.length > MAX_COMMENT_CHARS)
  ) {
    return null;
  }

  const ts =
    typeof body.ts === "string" && !Number.isNaN(Date.parse(body.ts))
      ? body.ts
      : new Date().toISOString();

  return {
    messageId: body.messageId,
    rating: body.rating,
    reason,
    comment: typeof body.comment === "string" ? body.comment : undefined,
    answer: body.answer,
    question: body.question,
    promptVersion: body.promptVersion,
    ts,
  };
}

export async function POST(request: Request): Promise<Response> {
  const { clientId, cookie } = readClientId(request);

  const limited = await checkFeedbackLimit(clientId);
  if (!limited.ok) {
    return failure(
      limited.error,
      limited.error === "daily_cap"
        ? "Huh hit its daily limit. Back tomorrow."
        : `Slow down a sec, try again in ~${limited.retryAfterSec}s.`,
      429,
      limited.retryAfterSec,
      cookie,
    );
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return failure("too_large", "That feedback is too long.", 413, 0, cookie);
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return failure("bad_request", "Could not read the request body.", 400, 0, cookie);
  }
  if (text.length > MAX_BODY_BYTES) {
    return failure("too_large", "That feedback is too long.", 413, 0, cookie);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return failure("bad_request", "Invalid JSON body.", 400, 0, cookie);
  }

  const body = parseBody(json);
  if (!body) return failure("bad_request", "Malformed feedback.", 400, 0, cookie);

  const record = {
    id: randomUUID(),
    messageId: body.messageId,
    rating: body.rating,
    reason: body.reason ?? null,
    comment: body.comment?.slice(0, MAX_COMMENT_CHARS) ?? null,
    answer: body.answer,
    question: body.question,
    promptVersion: body.promptVersion,
    model: serverModelName(),
    ts: body.ts,
  };

  const redis = getRedis();
  try {
    if (redis) {
      await redis.lpush(FEEDBACK_LIST, JSON.stringify(record));
      await redis.ltrim(FEEDBACK_LIST, 0, 4999);
    } else {
      // Local fallback: one line, no image and no raw client id.
      console.log(JSON.stringify({ type: "feedback", ...record }));
    }
  } catch (error) {
    console.error("[api/feedback] could not store feedback", error);
    return failure("provider_error", "Could not save feedback right now.", 502, 5, cookie);
  }

  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (cookie) headers["Set-Cookie"] = cookie;
  return Response.json({ ok: true }, { headers });
}

export async function GET(request: Request): Promise<Response> {
  const expected = process.env.ADMIN_TOKEN?.trim();
  const provided = request.headers.get("x-admin-token");

  if (!expected || !provided || provided !== expected) {
    return failure("unauthorized", "Not found.", 401);
  }

  const redis = getRedis();
  if (!redis) {
    console.warn("[api/feedback] Upstash is not configured; feedback is only in the server log.");
    return Response.json([], { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const rows = await redis.lrange(FEEDBACK_LIST, 0, 199);
    const items = rows.flatMap((row) => {
      try {
        return [typeof row === "string" ? JSON.parse(row) : row];
      } catch {
        return [];
      }
    });
    return Response.json(items, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/feedback] could not read feedback", error);
    return failure("provider_error", "Could not read feedback right now.", 502);
  }
}
