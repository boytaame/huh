import { createHash, randomUUID } from "node:crypto";

/**
 * Anonymous identity for rate limiting (spec-addendum-3 D1). Not an account,
 * not personal data: a random id in an httpOnly cookie, plus the request IP
 * as a second dimension.
 */

export const CLIENT_COOKIE = "huh_cid";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies.set(name, decodeURIComponent(value));
  }
  return cookies;
}

/** Existing anonymous id, or a fresh one plus the Set-Cookie value to send. */
export function readClientId(request: Request): {
  clientId: string;
  cookie: string | null;
} {
  const existing = parseCookies(request.headers.get("cookie")).get(CLIENT_COOKIE);
  if (existing && /^[a-zA-Z0-9-]{8,64}$/.test(existing)) {
    return { clientId: existing, cookie: null };
  }

  const clientId = randomUUID();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie =
    `${CLIENT_COOKIE}=${clientId}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; ` +
    `HttpOnly; SameSite=Lax${secure}`;
  return { clientId, cookie };
}

/** First hop of x-forwarded-for, then x-real-ip, then a local bucket. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

/** Stable short id for logs — never log the raw client id. */
export function hashClientId(clientId: string): string {
  return createHash("sha256").update(clientId).digest("hex").slice(0, 12);
}
