import { Redis } from "@upstash/redis";

/**
 * Upstash Redis is optional. Without its two env vars the app keeps working
 * locally: rate limiting falls back to memory and feedback falls back to the
 * server log. Server-side only — never import this into a client component.
 */

let client: Redis | null = null;

export function hasUpstash(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

export function getRedis(): Redis | null {
  if (!hasUpstash()) return null;
  if (!client) {
    client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!.trim(),
      token: process.env.UPSTASH_REDIS_REST_TOKEN!.trim(),
    });
  }
  return client;
}
