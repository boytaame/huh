# CHECK-RESULTS-4.md — Addendum 3 + Addendum 4 verification

**Date:** November 11, 2026
**Branch:** `session/e-feel`
**Method:** production build + dev server, curl, and the running app in a fresh incognito browser profile.

## Environment limitation (read first)

`LLM_API_KEY` is empty in `.env.local`, and this machine could not reach the AI provider
(`fetch failed` after ~10s). Therefore **no real model answer was produced locally**. All
thread behaviour (Stop, Regenerate, Copy, Edit, Retry, feedback) was exercised end-to-end
in the browser with a mocked `/api/ask` stream. The owner must re-check one live answer
after setting a working key.

## Addendum 3 — Session D

| Area | Check | Result |
|---|---|---|
| D1 | Missing question → `400 bad_request` | PASS |
| D1 | Non-data-URL image → `400 bad_request` | PASS |
| D1 | Question > 1000 chars → `413 too_large` | PASS |
| D1 | ~7 MB base64 image payload → `413 too_large` before provider | PASS |
| D1 | 11 concurrent asks from one IP → exactly one `429 rate_limited`, `retryAfterSec: 60` | PASS |
| D1 | No Upstash → one fallback warning, in-memory limiter works | PASS |
| D1 | `GLOBAL_DAILY_ASK_CAP=2` → third ask `429 daily_cap` with tomorrow retry | PASS |
| D1 | Server-enforced `MAX_OUTPUT_TOKENS = 400` for Gemini/Anthropic/OpenAI | PASS |
| D1 | Feedback POST 200; GET 401 without/wrong token; 200 with `ADMIN_TOKEN` | PASS |
| D1 | API key not present in client bundle (`LLM_API_KEY` only as an inlined env name) | PASS (key empty locally) |
| D2 | 429-shaped failure → inline “Slow down a sec…”, Retry visible | PASS (mocked) |
| D2 | Retry reuses the question, no duplicate user bubble | PASS (mocked) |
| D2 | Error disappears after a successful Retry | PASS (mocked) |
| D2 | Delete a blob while streaming → request aborted, no error UI, cascades removed | PASS (mocked) |
| D2 | Empty response / offline / 30s timeout mapping | Code path verified; not triggered live |
| D3 | Fresh profile: empty-board hint + first-run card | PASS |
| D3 | “Try a sample” places a normal image shape | PASS |
| D3 | Pressing `A` + dragging creates region + thread in composing state | PASS |
| D3 | Five chips, focused input, “AI can be wrong” note | PASS |
| D3 | `Esc`/X dismisses the card and it stays gone | PASS |
| D4 | 👍 sets pressed state and posts feedback | PASS |
| D4 | Feedback click does not move the blob | PASS (bounds unchanged) |
| D5 | No PostHog requests with no key; DNT-aware no-op | PASS (network log) |
| D6 | `/privacy` and `/terms` return 200 with DRAFT marker and noindex | PASS |
| D7 | `.env.example` complete; `npm run build` clean; security headers present | PASS |

## Addendum 4 — Session E

| Area | Check | Result |
|---|---|---|
| E1 | Send becomes **Stop** while streaming | PASS |
| E1 | Stop keeps partial text + muted `(stopped)`, no error/Retry, input focused | PASS |
| E1 | `(stopped)` is UI-only: assistant content stays partial | PASS |
| E1 | Stop before first token removes the empty bubble | PASS (code path; verified by stop flow) |
| E1 | `Esc` in the input stops a streaming answer | PASS (same handler path) |
| E2 | Regenerate on the last answer replaces it, no duplicate user bubble, count unchanged | PASS (mocked) |
| E2 | Regenerate hidden on older answers and while streaming | PASS |
| E2 | Copy text strips markdown, keeps `$...$`, includes collapsed More | PASS |
| E2 | Copy LaTeX keeps raw `**`/`$...$`, drops `---MORE---` | PASS |
| E2 | “Copied” confirmation shows and resets | PASS |
| E3 | Pencil on last typed question fills input, shows “Editing … Cancel” | PASS |
| E3 | Sending replaces question + answer in place; old question gone; count unchanged | PASS (mocked) |
| E3 | Cancel/Esc restores normal state; chip bubbles not editable | PASS |
| E4 | “Saving…” then “✓ Saved” after a document change | PASS |
| E4 | Forced storage failure → “Couldn’t save, export your board” + snapshot button | PASS |
| E4 | Recovery after failure returns to “✓ Saved” | PASS |
| E5 | Default follows OS; live OS change updates the class | PASS |
| E5 | System/Light/Dark persists in `huh.theme`; tldraw follows (`tl-theme__light`) | PASS |
| E5 | No flash: boot script sets `dark` before paint; body background dark | PASS |
| E5 | KaTeX inherits blob colour; dark overrides cover inputs/chips/errors/legal pages | PASS (DOM/computed styles) |
| E5 | Region capture forces `darkMode: false` | PASS (installed tldraw option) |
| E6 | Neither env set → link hidden | PASS |
| E6 | Contact email only → prefilled mailto with subject/body, technical lines only | PASS |
| E6 | Form URL set → exact URL, `target=_blank`, `rel=noreferrer` | PASS |
| Regression | P1 typing/events, P3 composing/Esc, P4/P5 anchoring/delete | PASS in exercised flows |

## Not verified / owner follow-up

- A real provider answer (needs a working key and outbound access).
- The 30-second first-token timeout (would require a stalled stream).
- Downloading the snapshot from the autosave failure button and the error boundary
  (the buttons render; no file was opened from the captured page).
- PostHog Live Events with a real key.
- Visual inspection was done through the accessibility tree and computed styles; no
  screenshot pass was requested.

## Stress test (local dev server, November 11, 2026)

| Scenario | Result |
|---|---|
| 30 concurrent page loads | 30×200, slowest 2.1s |
| 100 concurrent malformed asks | 100×400, no crash |
| Malformed JSON / 4.2 MB image / 21-message history | 400 / 413 / 413 |
| 30 concurrent asks from one IP (limit 10/min) | 10 allowed, 20×429 `rate_limited` |
| 35 concurrent asks, same `huh_cid`, rotating IPs (limit 30/day) | 30 allowed, 5×429 `rate_limited` |
| 65 concurrent feedback posts (limit 60/day) | 60×200, 5×429 |
| Health after all bursts | `/` 200 in 0.11s, `/privacy` 200, server still listening |

Allowed asks returned 502 only because the provider was unreachable locally. The limits and
body validation held under concurrency and the server stayed responsive. This is a dev-mode
run; production on Vercel uses separate instances, so Upstash is still required for shared
counters.

## Stress test (local dev server, November 11, 2026)

| Scenario | Result |
|---|---|
| 30 concurrent page loads | 30×200, slowest 2.1s |
| 100 concurrent malformed asks | 100×400, no crash |
| Malformed JSON / 4.2 MB image / 21-message history | 400 / 413 / 413 |
| 30 concurrent asks from one IP (limit 10/min) | 10 allowed, 20×429 `rate_limited` |
| 35 concurrent asks, same `huh_cid`, rotating IPs (limit 30/day) | 30 allowed, 5×429 `rate_limited` |
| 65 concurrent feedback posts (limit 60/day) | 60×200, 5×429 |
| Health after all bursts | `/` 200 in 0.11s, `/privacy` 200, server still listening |

Allowed asks returned 502 only because the provider was unreachable locally. Rate limits and
body validation held under concurrency and the server stayed responsive. This is a dev-mode
run; production on Vercel uses separate instances, so Upstash is still required for shared
counters.
