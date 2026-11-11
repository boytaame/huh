# AI Canvas

An infinite whiteboard where you drop study material, box one confusing piece, and an AI explanation appears right beside that selection — then stays there as its own mini-thread.

```
 material (image/text)  ──────▶  AI thread (streaming answer + follow-ups)
        ▲ yellow selection box            ▲ can be boxed again → child thread
```

Built as the MVP in `spec.md`.

## Stack

- Next.js 16 (App Router) + TypeScript
- [tldraw](https://tldraw.dev) 5 for the canvas, custom shapes, arrows and bindings
- Tailwind CSS 4
- KaTeX + `react-markdown` (+ GFM) inside AI blobs
- Server-side provider adapter for Gemini / Anthropic / OpenAI with streaming and image input

## Setup (Windows PowerShell)

```powershell
npm install
Copy-Item .env.example .env.local
# edit .env.local: set LLM_PROVIDER (gemini/anthropic/openai) and LLM_API_KEY
npm run dev
```

Open <http://localhost:3000>.

On macOS/Linux the equivalent is `cp .env.example .env.local && npm run dev`.

### Environment variables

Copy `.env.example` to `.env.local`. Empty optional values keep the app working.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `LLM_PROVIDER` | yes | `gemini` | `gemini`, `anthropic` or `openai` |
| `LLM_API_KEY` | yes* | — | Server-side key. Never sent to the browser. *Unused when a visitor brings their own key in the top-right box. |
| `LLM_MODEL` | no | provider default | Overrides the model |
| `UPSTASH_REDIS_REST_URL` | prod | — | Shared rate-limit + feedback storage. Without it, local dev uses memory and logs. |
| `UPSTASH_REDIS_REST_TOKEN` | prod | — | Token for the same database |
| `RATE_LIMIT_CLIENT_DAILY` | no | `30` | Asks per anonymous client cookie per day |
| `RATE_LIMIT_IP_PER_MIN` | no | `10` | Ask burst per IP per minute |
| `RATE_LIMIT_IP_DAILY` | no | `100` | Asks per IP per day |
| `GLOBAL_DAILY_ASK_CAP` | no | `500` | Total asks per UTC day |
| `RATE_LIMIT_FEEDBACK_CLIENT_DAILY` | no | `60` | Feedback posts per client per day |
| `ADMIN_TOKEN` | for admin | — | Required by `GET /api/feedback` via `x-admin-token` |
| `NEXT_PUBLIC_POSTHOG_KEY` | no | — | Empty disables analytics entirely |
| `NEXT_PUBLIC_POSTHOG_HOST` | no | `https://us.i.posthog.com` | PostHog region host |
| `NEXT_PUBLIC_CONTACT_EMAIL` | no | — | Shown on `/privacy` and `/terms`; also the “Report a bug” mailto fallback |
| `NEXT_PUBLIC_BUG_FORM_URL` | no | — | If set, “Report a bug” opens this URL in a new tab (used as-is) |
| `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` | no | — | Public by design; empty is fine for a demo |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | no | — | Reserved placeholders; Sentry is not wired up yet |

Defaults when `LLM_MODEL` is empty:

| Provider | Default model |
| --- | --- |
| `gemini` | `gemini-3.6-flash` |
| `anthropic` | `claude-haiku-4-5` |
| `openai` | `gpt-4o-mini` |

The key is read only inside `app/api/ask/route.ts` → `lib/llm.ts`. There is no server key in a `NEXT_PUBLIC_` variable, so it cannot reach client bundles. `max_tokens` is set server-side in `lib/llm.ts` (400), never trusted from the browser.

### Rate limiting

Hosted `/api/ask` requests are limited per anonymous cookie (`huh_cid`), per IP and by a global daily cap. The counters use Upstash Redis when both env vars are set; locally they fall back to an in-memory limiter (one warning, not safe across serverless instances).

If a visitor pastes their own API key, the browser calls the provider directly and the server limits do not apply — they are spending their own budget. Remove their key to exercise the hosted, rate-limited path.

Quick local check (PowerShell, dev server on port 3000). The 11th rapid request should return `429` with `rate_limited` and `retryAfterSec`:

```powershell
1..12 | ForEach-Object { try { Invoke-WebRequest -Method Post -Uri http://localhost:3000/api/ask -ContentType 'application/json' -Body '{"image":"data:image/png;base64,iVBORw0KGgo=","question":"test","boardSummary":"","ancestorContext":"","history":[]}' | Select-Object -ExpandProperty StatusCode } catch { $_.Exception.Response.StatusCode.value__ } }
```

## Deploy (Vercel)

1. Push the repo to GitHub and, in Vercel, choose **Add New Project → Import**. The Next.js preset needs no special build settings.
2. Add the environment variables from `.env.example` to **Production** (and Preview if you use it). At minimum: `LLM_PROVIDER`, `LLM_API_KEY`, both Upstash variables, and a long random `ADMIN_TOKEN`.
3. Deploy. `/api/ask` runs on the Node runtime with `maxDuration = 60` so answers are not cut at 10 seconds; `/api/feedback` is also a Node function.
4. Optional later: add a custom domain.
5. Run the owner checklist below before sharing the URL.

### Owner checklist (Kevin)

- [ ] Create an Upstash Redis database (free tier), copy the REST URL + token into Vercel env.
- [ ] Set a **hard monthly spend cap** in the LLM provider dashboard.
- [ ] Create a PostHog project, copy the key into env. In PostHog project settings, enable **Discard client IP data** (the JS SDK's IP option is deprecated).
- [ ] (Optional) Create a Sentry project, copy the DSN — the SDK is not wired up yet, so this can wait.
- [ ] Check tldraw's license terms/pricing; add `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` if needed. Do not launch publicly without sorting this.
- [ ] Review the `/privacy` and `/terms` drafts (both say DRAFT) and set a real `NEXT_PUBLIC_CONTACT_EMAIL`.
- [ ] Set `ADMIN_TOKEN` to a long random string and keep it out of the repo.
- [ ] Deploy on Vercel; test on a phone browser and a second laptop.
- [ ] (Later) domain.

## Using the board

- **Add material:** paste an image or text (`Ctrl+V`), drag an image file onto the board, or use tldraw's text tool.
- **Ask:** click **Ask** (or press `A`), then drag a box over any part of the board. A coloured selection is anchored to what is underneath it, and a thread appears beside it — nothing is sent to the model yet.
- **Write or tap a chip:** the new thread opens in a composing state with the cursor already in its input and five quick chips (*Explain this*, *Why?*, *Simpler*, *Example*, *Check my work*). Press `Enter` (or click a chip) to send; `Shift+Enter` adds a newline. `Esc`, or clicking empty canvas, cancels the thread.
- **Read:** the answer leads with the exact step that was missing; extra detail sits behind **More ▾** so the first answer stays short. Collapsing a thread leaves its header and the first line. Answer text can be selected and copied, and the wheel scrolls the answer instead of zooming the board (the header still drags the whole card).
- **Follow up:** type in the thread's input and press Enter. The answer streams into the same thread, with history kept.
- **Branch:** box part of an AI answer with the Ask tool to create a child thread. The parent link is stored and included in prompts.
- **Move things:** drag a selection or thread — the region stays anchored to its material, the thread keeps its offset, and the arrow follows. Resizing a selection re-anchors it to its material too.
- **Resize a thread:** drag any corner or edge. Cards grow with their answer until you resize one by hand; after that the card keeps your size and the answer scrolls inside it. Width stays between 280 and 720px, and a **Reset size** button in the header returns the card to the default width with content-driven height.
- **Delete:** the thread's trash button (or `Esc` while composing) removes the thread and its selection; deleting the selection keeps the thread as a detached card with a thumbnail of what it explained; deleting the arrow just detaches the card. Each is a single `Ctrl+Z` step, and child threads survive as detached cards.
- **Export:** top-right **Export board JSON** downloads `board.json` (schema in `spec.md` §5.5). **Snapshot** downloads the native tldraw snapshot.
- **Console:** `getBoardContext()` in DevTools returns the same board JSON.

- **First run:** an empty board shows a hint, and a dismissible card offers **Try a sample** (a bundled algebra solution). The card never comes back after a dismissed card or a first successful answer.
- **Help:** the **?** button (bottom-left) lists the shortcuts and links to `/privacy` and `/terms`.
- **Feedback:** hover (or tap) an answer for 👍 / 👎. A 👎 opens quick reasons plus an optional note.
- **Stop:** while an answer streams the Send button becomes **Stop** (or press `Esc` in the input). The partial answer stays with a muted `(stopped)` line and you can type a follow-up immediately. Stopping before the first token leaves no empty bubble.
- **Regenerate / copy:** the last answer has **Regenerate** (a fresh streamed answer in place, no duplicate question); every answer has **Copy** (readable text, math kept as LaTeX, including the collapsed More part) and **$** (raw Markdown/LaTeX).
- **Fix a question:** hover your last typed question and click the pencil. Sending replaces that question and its answer in place; `Esc` or **Cancel** leaves the thread unchanged. Chip bubbles are not editable.
- **Theme:** **System / Light / Dark** in the top bar, stored in this browser. System follows the OS live. Screenshots sent to the model are always exported on a light background for legibility.
- **Saving:** the top bar shows **Saving…** → **✓ Saved**. If storing fails (for example, storage is full) it shows **Couldn’t save, export your board** with a snapshot download.
- **Report a bug:** in the **?** popover and on the legal pages. Uses `NEXT_PUBLIC_BUG_FORM_URL` when set, otherwise a prefilled `mailto:` to `NEXT_PUBLIC_CONTACT_EMAIL`; hidden if neither is set. It never includes board content.

Boards autosave locally through tldraw's `persistenceKey` (`ai-canvas-v1`). In tldraw 5 this is browser-local persistence (IndexedDB); there is no server, database, account or sync.

## Scripts

```powershell
npm run dev        # dev server (Turbopack)
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
```

## API

`POST /api/ask` accepts:

```json
{
  "image": "data:image/png;base64,...",
  "question": "Why can we subtract here?",
  "boardSummary": "...",
  "ancestorContext": "...",
  "history": [{ "role": "user", "content": "..." }]
}
```

It responds with a plain-text stream of tokens. Provider-specific request/response handling lives only in `lib/llm.ts`; swapping providers is a one-file change plus env vars.

Failures use one shape, and the thread renders the message with a Retry button:

```json
{ "error": "rate_limited | daily_cap | too_large | bad_request | provider_error | timeout", "message": "human readable", "retryAfterSec": 60 }
```

Before the provider is called, the route enforces: PNG/JPEG data URL only, ≤ 4 MB decoded image, question ≤ 1000 chars, board summary ≤ 3000, ancestor context ≤ 4000, history ≤ 20 messages / 12,000 chars. Wrong shape → `400`; oversized → `413`.

`POST /api/feedback` accepts `{ messageId, rating, reason?, comment?, answer, question, promptVersion, ts }` and never an image. It is rate-limited per client (60/day) and pushes to the Upstash list `feedback` (or logs one JSON line locally). `GET /api/feedback` returns the latest 200 items only with an `x-admin-token` header matching `ADMIN_TOKEN`; otherwise `401`.

Analytics lives in `lib/analytics.ts`: with no `NEXT_PUBLIC_POSTHOG_KEY`, or with Do Not Track enabled, `track()` is a silent no-op. Events carry only names and small enums/numbers — never questions, answers, board text or images.

Context is built per request by `lib/context.ts` (`buildContext`): compact board summary, ancestor chain, selection PNG, and a budget-trimmed thread history. The full board JSON is never sent to the model.

## Project structure

```
app/
  page.tsx                 mounts the board (client-only)
  api/ask/route.ts         streaming endpoint (server-side key)
app/
  privacy/page.tsx         draft privacy policy
  terms/page.tsx           draft terms
  api/feedback/route.ts    feedback capture + admin read
components/
  Board.tsx                tldraw instance + chrome + onboarding/help
  AiBlob.tsx               thread UI + feedback + error states
  BoardErrorBoundary.tsx   reload / snapshot on a render crash
  Markdown.tsx             markdown + KaTeX
shapes/
  AskRegionShapeUtil.tsx   yellow selection shape
  AiBlobShapeUtil.tsx      AI thread shape
  types.ts                 custom shape types
tools/
  AskTool.ts               draw-selection → capture → blob → stream
lib/
  llm.ts                   provider abstraction (Gemini/Anthropic/OpenAI)
  context.ts               budgeted prompt context
  stream.ts                client stream writer + friendly error mapping
  rateLimit.ts             per-client/per-IP/global limits (Upstash or memory)
  requestIdentity.ts       huh_cid cookie, IP, hashed client id
  upstash.ts               optional shared Redis client
  feedback.ts              client feedback post (no image)
  analytics.ts             PostHog wrapper (DNT-aware, no-op without key)
  onboarding.ts            huh.onboarded flag
  exportBoard.ts           board JSON + snapshot
  anchoring.ts             keeps regions anchored (anchorId/rel) and blobs on offset
  lifecycle.ts             delete cascade (blob/region/arrow → thread states)
  threads.ts               palette + thread links
  chips.ts                 quick chips and the default question
  answer.ts                ---MORE--- split, first line, plain/copy text
  capture.ts               region PNG capture (always light)
  theme.ts / themeBoot.ts  System/Light/Dark store + pre-paint boot script
  autosave.ts              Saving… / Saved / save-failed indicator
  bugReport.ts             bug-form URL or prefilled mailto (no user content)
  clipboard.ts             clipboard write with fallback
  placement.ts             collision-free blob placement
public/
  sample/algebra-steps.svg bundled onboarding sample
```

## Known limitations

- **No backend persistence, auth or sync** — by design (MVP scope). Clearing site data clears the board.
- **Rate limits are per deployment, not per account.** They stop casual abuse and one runaway script, not a determined attacker with many IPs. Keep the provider spend cap as the hard backstop.
- **Bring-your-own-key bypasses the server limits.** That is intentional: the visitor's key pays for those requests.
- **Analytics IP capture** depends on the PostHog project setting ("Discard client IP data"); the JS SDK option is deprecated.
- **`/privacy` and `/terms` are drafts**, not reviewed legal documents.
- **No snapshot import UI.** You can download the native snapshot, but there is no re-import button yet.
- **Selection over an AI blob:** tldraw does not rasterize HTML custom shapes, so the crop uses a plain-text SVG approximation of the thread. The child prompt also receives the parent thread's recent messages, so it still has the real context.
- **Selection crop includes the board background** for legibility to the vision model.
- **Desktop only.** No mobile/touch optimization, no OCR, PDFs, voice, quizzes or study features.
- **Model defaults** can age; set `LLM_MODEL` to a current fast vision model if a provider retires one.
- If `LLM_API_KEY` is missing or invalid, the thread shows an inline error with a Retry button; the rest of the board keeps working.

## License note

tldraw requires a commercial license for production use. Running this project locally for development/demo is fine without a license; add `licenseKey` to `<Tldraw>` before shipping commercially. See <https://tldraw.dev/pricing>.
