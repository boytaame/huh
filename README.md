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
# edit .env.local and add LLM_API_KEY
npm run dev
```

Open <http://localhost:3000>.

On macOS/Linux the equivalent is `cp .env.example .env.local && npm run dev`.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `LLM_PROVIDER` | yes | `gemini`, `anthropic` or `openai` |
| `LLM_API_KEY` | yes | Server-side key. Never sent to the browser. |
| `LLM_MODEL` | no | Overrides the provider default |

Defaults when `LLM_MODEL` is empty:

| Provider | Default model |
| --- | --- |
| `gemini` | `gemini-2.5-flash` |
| `anthropic` | `claude-haiku-4-5` |
| `openai` | `gpt-4o-mini` |

The key is read only inside `app/api/ask/route.ts` → `lib/llm.ts`. There is no `NEXT_PUBLIC_` variable, so it cannot reach client bundles.

## Using the board

- **Add material:** paste an image or text (`Ctrl+V`), drag an image file onto the board, or use tldraw's text tool.
- **Ask:** click **Ask** (or press `A`), then drag a box over any part of the board. A coloured selection is anchored to what is underneath it, and a thread appears beside it — nothing is sent to the model yet.
- **Write or tap a chip:** the new thread opens in a composing state with the cursor already in its input and five quick chips (*Why?*, *What's the rule?*, *Example?*, *Simpler*, *What next?*). Press `Enter` (or click a chip) to send; `Shift+Enter` adds a newline. `Esc`, or clicking empty canvas, cancels the thread.
- **Read:** the answer leads with the exact step that was missing; extra detail sits behind **More ▾** so the first answer stays short. Collapsing a thread leaves its header and the first line. Answer text can be selected and copied, and the wheel scrolls the answer instead of zooming the board (the header still drags the whole card).
- **Follow up:** type in the thread's input and press Enter. The answer streams into the same thread, with history kept.
- **Branch:** box part of an AI answer with the Ask tool to create a child thread. The parent link is stored and included in prompts.
- **Move things:** drag a selection or thread — the region stays anchored to its material, the thread keeps its offset, and the arrow follows. Resizing a selection re-anchors it to its material too.
- **Delete:** the thread's trash button (or `Esc` while composing) removes the thread and its selection; deleting the selection keeps the thread as a detached card with a thumbnail of what it explained; deleting the arrow just detaches the card. Each is a single `Ctrl+Z` step, and child threads survive as detached cards.
- **Export:** top-right **Export board JSON** downloads `board.json` (schema in `spec.md` §5.5). **Snapshot** downloads the native tldraw snapshot.
- **Console:** `getBoardContext()` in DevTools returns the same board JSON.

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

Context is built per request by `lib/context.ts` (`buildContext`): compact board summary, ancestor chain, selection PNG, and a budget-trimmed thread history. The full board JSON is never sent to the model.

## Project structure

```
app/
  page.tsx                 mounts the board (client-only)
  api/ask/route.ts         streaming endpoint (server-side key)
components/
  Board.tsx                tldraw instance + chrome
  AiBlob.tsx               thread UI
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
  stream.ts                client stream writer (survives pan/zoom)
  exportBoard.ts           board JSON + snapshot
  anchoring.ts             keeps regions anchored (anchorId/rel) and blobs on offset
  lifecycle.ts             delete cascade (blob/region/arrow → thread states)
  threads.ts               palette + thread links
  chips.ts                 quick chips and the default question
  answer.ts                ---MORE--- split, first line, plain text
  capture.ts               region PNG capture
  placement.ts             collision-free blob placement
```

## Known limitations

- **No backend persistence, auth or sync** — by design (MVP scope). Clearing site data clears the board.
- **No snapshot import UI.** You can download the native snapshot, but there is no re-import button yet.
- **Selection over an AI blob:** tldraw does not rasterize HTML custom shapes, so the crop uses a plain-text SVG approximation of the thread. The child prompt also receives the parent thread's recent messages, so it still has the real context.
- **Selection crop includes the board background** for legibility to the vision model.
- **Desktop only.** No mobile/touch optimization, no OCR, PDFs, voice, quizzes or study features.
- **Model defaults** can age; set `LLM_MODEL` to a current fast vision model if a provider retires one.
- If `LLM_API_KEY` is missing or invalid, the thread shows an inline error with a Retry button; the rest of the board keeps working.

## License note

tldraw requires a commercial license for production use. Running this project locally for development/demo is fine without a license; add `licenseKey` to `<Tldraw>` before shipping commercially. See <https://tldraw.dev/pricing>.
