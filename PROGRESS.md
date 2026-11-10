# PROGRESS

## Current branch
session/d-launch-hardening (branched from the latest `main`; `master` is also present in this repo and was not touched)

## Session D status (spec-addendum-3)

- **D1: done** (9398814) — `/api/ask` validates body size, image type/decoded size, question, board summary, ancestor context and history before the provider is called; per-client cookie (`huh_cid`), per-IP burst/daily and global UTC-day cap on Upstash Redis with an in-memory fallback and one warning; `max_tokens = 400` enforced in `lib/llm.ts`; uniform `{ error, message, retryAfterSec }` failures.
- **D2: done** (d432f89) — every failure maps to a short inline message with Retry; 30s first-token `AbortController`; delete aborts the request; partial answers keep `(cut off)`; empty responses are errors; no thread is left `streaming`; board error boundary with Reload + snapshot download.
- **D3: done** (5a2a4e7; card/help UI in ed937e9) — empty-board hint, dismissible first-run card with `huh.onboarded`, bundled sample SVG loaded as a normal image shape, Ask tooltip, help popover with shortcuts/legal links, composing “AI can be wrong” note. First successful answer retires the card.
- **D4: done** (24f3e7b) — 👍/👎 on every assistant message, 👎 quick reasons + optional note, persisted on the message; `POST /api/feedback` (no image, no IP, 60/day per client) and token-only `GET /api/feedback` (last 200; 401 otherwise); `PROMPT_VERSION` in `lib/llm.ts`.
- **D5: done** (ed937e9) — `lib/analytics.ts` no-ops without `NEXT_PUBLIC_POSTHOG_KEY` or with DNT; all listed events wired with enum/number props only; no user content leaves the app via analytics.
- **D6: done** (b818405) — `/privacy` and `/terms` plain-English drafts with a visible DRAFT marker, UU PDP note, env contact email; linked from the help popover and first-run card.
- **D7: done** (e246616 + final docs commit) — complete `.env.example`, Node runtime + `maxDuration` on both API routes, tldraw key wired, noindex metadata, security headers, Deploy section + owner checklist in `README.md`. `npm run build` passes (7 pages, both API routes dynamic). Sentry intentionally skipped (SDK not installed; env placeholders reserved).

### Verified this session
- `npx tsc --noEmit` and `npm run build` pass.
- 11 rapid asks from one IP → 11th `429 rate_limited` with `retryAfterSec`.
- `GLOBAL_DAILY_ASK_CAP=2` → 3rd ask `429 daily_cap`.
- ~10 MB image payload → `413 too_large` without calling the provider.
- No Upstash env → app works with one fallback warning; feedback logs one JSON line.
- Feedback: 200 with valid body, 401 without/with a wrong admin token, 429 after the per-client limit.
- `/privacy` and `/terms` return 200 with the DRAFT marker and `noindex, nofollow`.
- LLM key absent from `.next/static`, `git grep` at HEAD, and never tracked as `.env.local`.

### Not yet automated (needs a manual browser pass)
- Offline toggle → offline message → Retry with no duplicate bubble.
- Killing the dev server mid-stream → `(cut off)` + Retry.
- Deleting a streaming blob and watching the Network tab.
- Forced component crash → error boundary + snapshot file.
- PostHog Live Events with a real key; “no requests” with DNT / no key.
- “Try a sample” + press `A` and box step 3 in a fresh profile.

### Owner todo (pending)
- [ ] Create Upstash Redis (free) and set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel env.
- [ ] Set a hard monthly spend cap in the LLM provider dashboard.
- [ ] Create a PostHog project, set `NEXT_PUBLIC_POSTHOG_KEY`, and enable **Discard client IP data** in the project settings.
- [ ] (Optional) Create a Sentry project and copy the DSN; the SDK is not wired up yet.
- [ ] Check tldraw’s license terms/pricing; add `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` if needed.
- [ ] Review `/privacy` and `/terms` drafts; set a real `NEXT_PUBLIC_CONTACT_EMAIL`; check the UU PDP questions in `DECISIONS.md` with someone who knows the law.
- [ ] Set `ADMIN_TOKEN` to a long random string and keep it out of the repo.
- [ ] Deploy on Vercel; test on a phone browser and a second laptop.
- [ ] (Later) add a domain.

## Status of patches
- addendum-1 P1: done — blob body/textarea isolate pointer, key, context-menu and paste events; body text selectable (inline `user-select: text`); header drags the card; wheel handled natively at the card.
- addendum-1 P2: done — gap-first prompt, `---MORE---` collapsed detail, default question stored hidden (no "Explain this part…" bubble).
- addendum-1 P3: done — composing state with chips + focused input, no auto-send, Enter/Shift+Enter, Esc or empty-canvas cancel (undoable).
- addendum-1 P4: done — `anchorId`/`rel` regions, `offsetFromRegion` blobs, idempotent anchoring, region resize re-anchors, migrations.
- addendum-1 P5: done — blob → region + arrow, region → arrow + detached blob, arrow → unlink/detach, child blobs survive, one undo step each, no dialogs.
- addendum-1 P6: done — 400px width, 14px+ text, header always visible, collapsed = header + first line, colour palette, collision-free placement.
- addendum-2 3.1 (Ctrl+wheel): done — card-level non-passive wheel listener; Ctrl/Cmd+wheel preventDefaults and zooms the board at the pointer, plain wheel only scrolls the answer.
- addendum-2 3.2 (empty/streaming send): done — send button disabled when the input is blank or a reply is streaming; empty Enter only acts while composing.
- addendum-2 3.3 (selectable text): done — inline `user-select: text`/`cursor: text` on the body, pointer events stopped inside it, drag only from the header.
- addendum-2 3.5 (prompt/voice): done — no-recap rule, per-chip suffixes, language matching (already present). Length caps removed: no output-token limit and no word budget in the prompt.
- bugfix (black canvas): done — a dark colour scheme tldraw had stored in the browser painted the board `#101011` under the light UI. The board is pinned to `light` on mount, so a stored preference can no longer produce it.
- bugfix (native text drag): done — a `dragstart` inside a card is cancelled at the card (capture) and the body is non-draggable, so dragging an answer no longer drags the selection out instead of the card.
- bugfix (stuck streaming after undo): done — a thread restored by undo with no live request returns to `idle` and drops its empty assistant placeholder.
- addendum-2 resize (session C): done — native corner/edge resize clamped to 280–720px wide and 160px tall, `userSized`/`userHeight` props with migration `/2`, content auto-grows until a manual resize, header **Reset size** button, collapse restores the hand-picked height.

## Done this session
- Full functional pass over the running app (ask/compose, chips, streaming, follow-up, send guards, Shift+Enter, More, selectable text, wheel ownership, soft wrap of the Light-only-board fix, resize/clamp/reset/collapse, anchoring, palette rotation, child threads, delete cascades + undo, Esc cancel, export JSON + snapshot, `getBoardContext`, title persistence, reload persistence). Found and fixed two defects: native text drag inside a card, and a thread restored by undo staying on "Thinking…" forever.
- Audit of addendum-1 P1–P6 by reading the code and exercising the running app; this file created.
- Session A: Ctrl+wheel no longer zooms the browser page (it zooms the board), plain wheel only scrolls the answer, empty/streaming sends blocked, selectable text re-verified, no-recap prompt rule, per-chip voice suffixes. Follow-up: dropped the 400-token cap and the prompt word budget because they truncated explanations.
- Session C: resizable threads with a `userSized` flag and reset-size action.

## Half-done / blocked
- Nothing.

## Next up (in order)
1. Manual browser pass on `session/d-launch-hardening` (the list above), then merge it yourself (`git switch master && git merge --no-ff session/d-launch-hardening`). Do not have the agent merge it.
2. Owner checklist in `README.md` (Upstash, spend cap, PostHog, tldraw license, legal drafts, `ADMIN_TOKEN`), then deploy on Vercel.
3. Show 1–3 classmates with zero explanation and watch whether they find the Ask box alone.

## How to verify what's done
1. `npm run dev`, open the board, drag a selection with the Ask tool: the thread opens composing, cursor in the input, five chips, nothing sent yet.
2. Plain wheel over the answer scrolls it; Ctrl+wheel over the card zooms the board and never the browser page.
3. The send button is greyed out until you type; pressing Enter on an empty follow-up does nothing, but Enter on an empty first input still explains.
4. Select text in an answer with the mouse and copy it; dragging the card must start only from the header strip.
5. Answers stop after the last explanatory step (no "putting it together…" recap); chips use their own voice ("Simpler" = analogy, `Example` = one worked example with numbers).
