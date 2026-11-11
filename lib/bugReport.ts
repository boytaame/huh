import { APP_VERSION } from "@/lib/version";

/**
 * Bug-report destination (spec-addendum-4 E6).
 *
 * Order: `NEXT_PUBLIC_BUG_FORM_URL` (opened as-is, no appended params), then
 * `NEXT_PUBLIC_CONTACT_EMAIL` (prefilled mailto), otherwise no link at all.
 * Only technical lines are placed in the body: no board content, messages,
 * images or snapshot data.
 */

export type BugReportLink = { href: string; external: boolean };

export function bugReportHref(lastErrorCode = "none"): BugReportLink | null {
  const formUrl = process.env.NEXT_PUBLIC_BUG_FORM_URL?.trim();
  if (formUrl) return { href: formUrl, external: true };

  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  if (!email) return null;

  const browser =
    typeof navigator === "undefined" ? "unknown" : navigator.userAgent;
  const body = [
    "What happened:",
    "",
    "What I expected:",
    "",
    "Steps to reproduce:",
    "",
    "---",
    `App version: ${APP_VERSION}`,
    `Browser: ${browser}`,
    `Last error code: ${lastErrorCode || "none"}`,
    `Time: ${new Date().toISOString()}`,
  ].join("\n");

  const href =
    `mailto:${encodeURIComponent(email)}` +
    `?subject=${encodeURIComponent("Huh bug report")}` +
    `&body=${encodeURIComponent(body)}`;

  return { href, external: false };
}
