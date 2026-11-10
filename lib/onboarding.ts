/** First-run state (spec-addendum-3 D3). Purely local, never sent anywhere. */

export const ONBOARDED_KEY = "huh.onboarded";
export const ONBOARDED_EVENT = "huh:onboarded";

export function isOnboarded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    // Storage blocked: showing the card once per session is harmless.
    return false;
  }
}

export function markOnboarded(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    // Ignore: the card may show again after a reload in private mode.
  }
  window.dispatchEvent(new Event(ONBOARDED_EVENT));
}
