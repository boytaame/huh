import type { PostHog } from "posthog-js";

/**
 * Anonymous product analytics (spec-addendum-3 D5).
 *
 * - No key → no import, no network, no errors.
 * - Do Not Track → no-op.
 * - Only event names and small enums/numbers are ever sent. Never questions,
 *   answers, board text, image data, emails or names.
 */

type Props = Record<string, string | number | boolean | undefined>;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

let ready: Promise<PostHog | null> | null = null;

function doNotTrack(): boolean {
  if (typeof navigator === "undefined") return true;
  const value =
    navigator.doNotTrack ??
    (window as unknown as { doNotTrack?: string | null }).doNotTrack;
  return value === "1" || value === "yes";
}

function getClient(): Promise<PostHog | null> {
  if (ready) return ready;

  ready = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(KEY!, {
        api_host: HOST,
        person_profiles: "identified_only",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        respect_dnt: true,
        // IP capture is discarded at ingestion when the PostHog project has
        // "Discard client IP data" enabled; the SDK option is deprecated.
      });
      return posthog;
    })
    .catch(() => null);

  return ready;
}

export function track(event: string, props?: Props): void {
  if (typeof window === "undefined" || !KEY || doNotTrack()) return;

  void getClient()
    .then((client) => {
      if (!client) return;
      client.capture(event, props);
    })
    .catch(() => {
      // Analytics must never break the board.
    });
}
