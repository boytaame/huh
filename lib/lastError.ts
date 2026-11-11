/**
 * Last failure code shown to the user (spec-addendum-4 E6). Used only for the
 * bug-report technical lines; never contains a question, answer or image.
 */

let lastErrorCode: string | null = null;

export function setLastErrorCode(code: string): void {
  if (code) lastErrorCode = code;
}

export function getLastErrorCode(): string {
  return lastErrorCode ?? "none";
}
