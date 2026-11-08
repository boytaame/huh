# spec.md — Whiteboard AI ("Threads for Sub-Problems") MVP

> Hand this file to the builder agent as the single source of truth. Build exactly what is in **MVP Scope**. Do not add features from **Out of Scope**. If something is ambiguous, pick the simplest option, note it in `DECISIONS.md`, and keep going.

---

## 1. One-line pitch

An infinite whiteboard where you drop study material (screenshots, math problems, text), draw a **selection box** over any part of it, and an AI **answer blob appears right beside that selection** and stays there as a mini-thread. The whole board is a mind map of materials + AI explanations, exportable as JSON.

## 2. Problem being solved

Linear AI chat breaks flow. Example: the AI returns a 5-step solution, the user doesn't understand how `5x` became `8` in step 3. Today they must open another tab or ask in the same chat (scroll, lose place, manage tabs). No single response can fully explain everything without reading the user's mind.

**Solution:** ask about *that exact piece*, in place, on the same page. Each question = a thread attached to a sub-problem. The user pans around the board to move between threads.

## 3. Core interaction (the diagram)

```
┌──────────────┐          ┌─────────────┐
│  MATERIAL    │          │     AI      │
│  (red)       │          │  (black)    │
│  step 1 ~~~  │          │  ~~~~~~~~   │
│ ┌──────────┐ │──────────│  ~~~~~~~~   │
│ │ step 3   │ │  arrow   │  ~~~~~~~~   │
│ └──────────┘ │          │ [follow-up] │
│  step 4 ~~~  │          └─────────────┘
└──────────────┘
   yellow = selection box
```

- **Red box** = any material on the board (image / text / equation).
- **Yellow box** = the selection box the user draws over part of the material.
- **Black box** = the AI response blob, placed to the right of the selection, connected by an arrow, persistent, with a follow-up input.

## 4. Tech stack (fixed)

- **Framework:** Next.js (App Router) + TypeScript
- **Canvas:** `tldraw` SDK (React). Use its custom shapes, custom tools, arrow bindings and snapshot APIs. Start from the `branching-chat` starter kit if it saves time: `npm create tldraw@latest -- --template branching-chat`
- **Styling:** Tailwind CSS
- **Math rendering:** KaTeX (`react-katex` or `katex` directly) inside AI blobs
- **LLM:** vision-capable model behind a thin provider abstraction (`lib/llm.ts`). Default provider configured through env vars. Must support streaming and image input.
- **Dev environment:** Windows. Use cross-platform commands only (npm scripts, no bash-only syntax). Document any PowerShell steps in README.
- **Persistence:** `localStorage` via tldraw's persistence key. No database, no auth.

Env vars (`.env.local`, never commit):
```
LLM_PROVIDER=gemini        # gemini | anthropic | openai
LLM_API_KEY=...
LLM_MODEL=...              # fast + cheap vision model by default
```

> Note: tldraw requires a license key for production use. Dev/demo is fine without. Mention this in README, do not block on it.

## 5. MVP scope (build all of this)

### 5.1 Canvas & materials
- Infinite pan/zoom canvas (tldraw defaults).
- User can add materials by: **paste from clipboard** (images and text), **drag-and-drop image files**, and tldraw's built-in text tool.
- Materials are normal tldraw shapes (image / text). No special type needed.

### 5.2 Ask tool (the signature feature)
- Add a custom toolbar button + keyboard shortcut `A` for **Ask tool**.
- With Ask tool active, user click-drags a rectangle anywhere on the canvas (can partially overlap images/text).
- On release:
  1. Create a persistent **selection shape** (yellow, semi-transparent rectangle) at that region.
  2. Capture the region as a **PNG image** (everything visible inside that rectangle, rendered from the canvas — do NOT run OCR). Use tldraw's export (`editor.toImage` with a `bounds` option, or the SVG export cropped to bounds; verify against the installed version's docs).
  3. Create an **AI blob shape** to the right of the selection (offset ~80px, avoid overlapping existing shapes where easy; if blocked, place below).
  4. Create an **arrow** from the selection shape to the blob, bound to both so it follows when either moves.
  5. Auto-send the first request to the LLM and stream the response into the blob.
- If the region contains no text/visual content, still send it; the model handles it. The user can also type a question before sending (see 5.3).

### 5.3 AI blob (custom shape)
- Custom tldraw `ShapeUtil` rendering an HTML component.
- Contains:
  - Header: small label "AI" + collapse/expand button + delete button.
  - **Message list** (assistant + user messages) with markdown + KaTeX rendering.
  - **Follow-up input** at the bottom. Submitting appends a user message and streams a new assistant reply **in the same blob** (this is the "thread").
  - Optional **question field** shown right after the selection is made, defaulting to empty = "explain this part". Pressing Enter sends. If the user does nothing for the default flow, it auto-sends "Explain this part step by step, focusing on what is likely confusing."
- Blob auto-grows in height with content (max height ~600px, then internal scroll).
- Streaming: tokens appear live. Show a subtle loading state.
- Errors: show inline error message with a Retry button.

### 5.4 Mind-map behavior
- AI blobs can themselves be selected with the Ask tool (ask about part of an AI answer) → creates a **child blob** linked back. This gives the Obsidian-like tree of materials ↔ explanations.
- Every blob stores a `parentId` (the shape the selection was drawn over, or the blob it came from) for context building.

### 5.5 Board context + JSON export
- Button **"Export board JSON"** downloads `board.json`.
- Also expose `getBoardContext()` (used internally for prompts, see §7).
- JSON schema (compact, LLM-friendly):

```json
{
  "version": 1,
  "title": "string (user editable, default 'Untitled board')",
  "nodes": [
    {
      "id": "shape:abc",
      "type": "material" | "selection" | "ai",
      "kind": "image" | "text" | "region" | "thread",
      "bounds": { "x": 0, "y": 0, "w": 0, "h": 0 },
      "text": "string | null",
      "parentId": "shape:xyz | null",
      "messages": [ { "role": "user" | "assistant", "content": "string" } ]
    }
  ],
  "edges": [ { "from": "shape:abc", "to": "shape:def" } ]
}
```
- Also include a button **"Download full snapshot"** that saves tldraw's native snapshot (for re-importing). Import is optional.

### 5.6 Basics
- Board autosaves to `localStorage`.
- Clean minimal UI, dark mode friendly. Top-left: board title. Top-right: Export JSON. Bottom: tldraw toolbar + Ask tool.
- Works on latest Chrome/Edge/Firefox desktop. Mobile not required.

## 6. Out of scope (do NOT build)
- Auth, accounts, cloud sync, multiplayer/collab
- Database / backend persistence
- OCR libraries (use the vision model on the image)
- PDF import, voice, handwriting recognition tuning
- Quizzes, flashcards, spaced repetition, any "study mode" extras
- Mobile/touch optimization
- Pricing, billing, usage limits

## 7. Context strategy (important)

**Never send the entire board JSON on every request.** It bloats fast and gets slow/expensive. For each LLM call, build context as:

1. **System prompt** (below).
2. **Board summary** (≤ ~500 tokens): board title + list of top-level materials with short labels/text snippets (first ~100 chars each).
3. **Ancestor chain:** the parent material/blob text (if text exists) and parent blob's last few messages.
4. **The selected region image** (PNG, max ~1600px on the long side, downscale if larger).
5. **Thread history** for this blob (all messages, trimmed from the oldest if over budget).
6. The user's current question.

Implement `buildContext(editor, blobId)` in `lib/context.ts` with a configurable token/char budget.

### System prompt (use as default)
```
You are a tutor embedded in a whiteboard. The user selected ONE specific part of their material (provided as an image). Explain ONLY that part, in the context of the board summary provided.
- Assume they got most of the material but are stuck on this piece. Find the likely gap (e.g., a skipped algebra step) and fill it.
- Show the intermediate steps explicitly. Be concise; no preamble, no restating the whole problem.
- Use LaTeX for math: inline $...$ and block $$...$$.
- If the selection has no meaningful content, say so briefly and ask what they want to know.
- On follow-ups, answer the follow-up directly using the same selection as context.
```

## 8. Data model (tldraw custom shapes)

```ts
// shape: 'ask-region'
{ w: number, h: number, imageDataUrl?: string /* cached crop for re-sends */ }

// shape: 'ai-blob'
{
  w: number, h: number,
  parentId: string,
  collapsed: boolean,
  messages: { role: 'user'|'assistant', content: string }[],
  status: 'idle'|'streaming'|'error',
  regionImage?: string // data URL of the selection crop, stored for follow-ups
}
```

Arrows use tldraw's native arrow shape with bindings to `ask-region` → `ai-blob`.

## 9. API

`POST /api/ask` (Next.js route handler, streams text)
```json
{
  "image": "data:image/png;base64,...",
  "question": "string | null",
  "boardSummary": "string",
  "ancestorContext": "string",
  "history": [ { "role": "user", "content": "..." } ]
}
```
- Returns a streamed text response. API key stays server-side only.
- Provider logic lives in `lib/llm.ts`; swapping providers must be a one-file change.

## 10. Suggested file structure
```
/app
  page.tsx                 # mounts <Board />
  /api/ask/route.ts
/components
  Board.tsx                # tldraw instance + UI overrides
  AiBlob.tsx               # blob UI (messages, input, katex)
/shapes
  AskRegionShapeUtil.tsx
  AiBlobShapeUtil.tsx
/tools
  AskTool.ts               # custom tool (state machine: idle → drawing → done)
/lib
  llm.ts
  context.ts
  exportBoard.ts
/README.md
/DECISIONS.md
```

## 11. Build order (do in this order, verify each step runs before moving on)
1. Scaffold Next.js + tldraw, canvas renders, paste image works.
2. `AskTool`: draw a rectangle → creates `ask-region` shape. Log the captured PNG to confirm the crop is correct.
3. `AiBlobShapeUtil` with static dummy messages + arrow binding to the region.
4. `/api/ask` + `lib/llm.ts`; stream a real response into the blob.
5. Follow-up input inside the blob (thread).
6. KaTeX + markdown rendering.
7. Child blobs (Ask tool over a blob).
8. `buildContext` + board summary.
9. Export board JSON + localStorage persistence.
10. Polish: loading/error states, collapse/delete, README.

## 12. Acceptance criteria (must all pass)
- [ ] Paste a screenshot of a multi-step math solution onto the canvas.
- [ ] Press `A`, drag a box over step 3 → a yellow region appears, an AI blob appears to its right with an arrow, and the explanation streams in within ~5 seconds.
- [ ] The explanation addresses only the selected step (not the whole problem).
- [ ] Type a follow-up in the blob → reply appears in the same blob, history kept.
- [ ] Math renders correctly via KaTeX.
- [ ] Draw a second box over a different step → a second independent blob appears; pan between both freely.
- [ ] Draw a box over text inside an AI blob → child blob appears linked to it.
- [ ] Moving a region or blob keeps the arrow attached.
- [ ] Refresh the page → board is restored.
- [ ] "Export board JSON" downloads valid JSON matching §5.5 including messages and parent links.
- [ ] API key is never exposed to the browser.

## 13. Demo script (what this MVP must nail)
1. Paste a screenshot of a 5-step algebra solution.
2. Box step 3 where `5x` becomes `8`. Blob explains that step only.
3. Ask a follow-up in the blob: "why can we subtract here?"
4. Box a different step, get a second blob.
5. Zoom out to show the board as a map of material + threads.
6. Export board JSON.

## 14. Notes to the builder
- Prioritize **feel**: selection → blob should feel instant and anchored. Streaming + clean placement matter more than extra features.
- Keep code simple and typed. No over-engineering, no extra abstractions beyond `llm.ts` and `context.ts`.
- Write a short README: setup, env vars, run commands (Windows-friendly), known limitations.
- Log any assumptions in `DECISIONS.md`.