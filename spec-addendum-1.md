# spec-addendum-1.md — Patch 1 for Whiteboard AI MVP

> This file **amends `spec.md`**. Where this file conflicts with `spec.md`, **this file wins**. Everything not mentioned here stays as in `spec.md`. Implement the patches in the order given (P1 → P5), then the polish items (P6). Verify each patch with its acceptance checks before moving on. Log any assumptions in `DECISIONS.md`.

Current state (from the live build): Ask tool, yellow regions, arrows, streamed KaTeX answers and JSON export all work. The issues below are what this patch fixes.

---

## P1. Fix blob input and event handling (BLOCKER)

**Problem:** The follow-up input inside AI blobs can't be focused or typed in. tldraw's canvas intercepts pointer/keyboard events before they reach the blob's HTML.

**Requirements:**
- The blob's root `HTMLContainer` must have `style={{ pointerEvents: 'all' }}`.
- On the blob root (and on every interactive child: input, buttons, chips, scroll area) stop propagation for: `onPointerDown`, `onPointerUp`, `onPointerMove` (only while the pointer is inside an input/scroll area), `onTouchStart`, `onTouchEnd`, `onClick`, `onDoubleClick`, `onContextMenu` as needed so the canvas does not steal focus.
- `onWheel` on the message list: stop propagation so scrolling the blob does not zoom/pan the board. Only let the wheel bubble when the list cannot scroll further AND the user holds Ctrl (pinch-zoom).
- On all text inputs: stop propagation of `keydown`, `keyup`, `keypress`. **Critical:** the Ask tool shortcut is `A`; typing "a" in an input must NEVER switch tools or trigger any tldraw shortcut (including Delete/Backspace deleting the shape).
- Enter submits, Shift+Enter inserts a newline.
- Dragging the blob must still work via the **header bar only** (not the body), so text selection inside the body works normally. Body text must be selectable and copyable.

**Acceptance:**
- [ ] Click the follow-up input, type a sentence containing the letters `a`, `d`, `e`, `x`; text appears, tool does not change, nothing is deleted.
- [ ] Mouse-wheel inside a long blob scrolls the blob, not the canvas.
- [ ] Can select/copy text from an AI answer.

---

## P2. Gap-first answers and collapsed detail (readability)

**Problem:** Answers are a wall of text that restates the selected content.

**Replace the system prompt in `spec.md` §7 with:**
```
You are a tutor embedded in a whiteboard. The user selected ONE specific part of their material (provided as an image) and may have asked a specific question about it. Answer ONLY that.

Rules:
- NEVER restate or re-describe the selected content. The user can already see it.
- Start with THE GAP: 1 sentence naming exactly what is likely confusing or what the user asked.
- Then THE FIX: the key step(s) as short math/text lines (max ~4 lines).
- If more detail would genuinely help, put it AFTER a line containing only `---MORE---`. Keep it concise.
- Use LaTeX: inline $...$ and block $$...$$.
- No greetings, no summaries, no closing offers.
- If the selection has no meaningful content, say so in one sentence and ask what they want to know.
- On follow-ups, same rules: answer the follow-up directly, gap-first, short.
```

**UI requirements:**
- Parse the streamed response on the `---MORE---` marker (handle the marker arriving mid-stream; don't render the marker itself).
- Render content before the marker normally. Render content after the marker inside a collapsed section labelled **"More ▾"** (collapsed by default, toggles open/closed, remembered per message in blob state).
- If no marker is present, render everything normally.
- Hide the default "Explain this part…" user bubble. Only render user bubbles for text the user actually typed or a chip that was clicked (show the chip label, e.g. "Why?").

**Acceptance:**
- [ ] A typical explanation shows ≤ ~6 visible lines with "More ▾" below if extra detail exists.
- [ ] The answer does not begin by restating the equation.
- [ ] No visible "Explain this part…" bubble unless the user chose it by typing.

---

## P3. Composing state: no auto-send; input focused with chips

**Problem:** Releasing the Ask box immediately auto-sends a default prompt. Users have different confusions and should be able to ask their own question first.

**New flow (replaces `spec.md` §5.2 step 5 and §5.3 "auto-sends"):**
1. On release of the Ask drag: create the yellow region, **capture the region PNG immediately (at release time, not send time)** and store it on the region/blob, create the blob and arrow. **Do NOT call the LLM.**
2. The blob starts in `status: 'composing'`. It shows the same input component used for follow-ups, **auto-focused** (focus after the shape mounts; retry on next frame if needed so focus reliably lands).
3. Above the input, show **quick chips**: `Explain this` · `Why?` · `Simpler` · `Example` · `Check my work`. Clicking a chip sends immediately with a prompt mapped as:
   - Explain this → "Explain this part step by step, focusing on what is likely confusing."
   - Why? → "Why is this step valid? What rule or reasoning justifies it?"
   - Simpler → "Explain this in simpler terms, as if I'm new to it."
   - Example → "Show a small, concrete example of this idea."
   - Check my work → "Check whether this step is correct and point out any mistake."
4. Typing and pressing **Enter** sends the custom question.
5. **Enter on an EMPTY input = the "Explain this" default.** (Keeps the lazy path to one keystroke.)
6. **Esc** while composing (or clicking the empty canvas while composing with nothing typed) **cancels**: delete the region, arrow and blob as one undo step.
7. After the first message is sent, status becomes `streaming` → `idle`, and the chips are **hidden** (they only appear while the thread has zero messages). The same input remains for follow-ups.
8. The yellow region stays visible while composing.

**Add status value** `'composing'` to the blob data model.

**Optional (nice-to-have, only if trivial):** a settings toggle "Auto-explain on select" (default OFF) that restores the old auto-send behavior.

**Acceptance:**
- [ ] Drawing a box shows a blob with a focused cursor and chips; no network request is made yet.
- [ ] Pressing Enter with an empty input sends the default explain.
- [ ] Clicking each chip sends its mapped prompt and shows the chip label as the user bubble.
- [ ] Esc cancels and leaves no orphaned shapes; Ctrl+Z restores them.
- [ ] After the first send, chips disappear and the follow-up input works.

---

## P4. Anchored regions: selection boxes follow the material

**Problem:** Moving or resizing the problem image leaves the yellow Ask box behind.

**Data model changes** — `ask-region` gains:
```ts
anchorId: string | null        // shape the box was drawn over
rel: { x: number, y: number, w: number, h: number } | null  // box bounds as FRACTIONS (0..1) of the anchor's bounds
```
and `ai-blob` gains:
```ts
offsetFromRegion: { x: number, y: number }  // blob position relative to its region, in page units
```

**Behavior:**
- On release, pick the anchor = the shape with the **largest overlap area** with the box (ignore other regions/blobs/arrows unless the box is drawn over an `ai-blob`, in which case that blob is the anchor). If nothing overlaps, `anchorId = null` (free-floating, never auto-moves).
- Compute `rel` from the box bounds relative to the anchor's current page bounds. Store it.
- Use `editor.sideEffects.registerAfterChangeHandler('shape', …)`: when an anchor shape's position, size or rotation changes, recompute each dependent region's page bounds from `rel` and the anchor's new bounds, and update the region. This makes regions follow **moves AND resizes** (and rotation if supported; otherwise at minimum translate + scale).
- When a region moves because of its anchor, move its blob(s) by the same delta so `offsetFromRegion` is preserved. Arrows follow automatically via bindings.
- If the user manually drags a blob, update its `offsetFromRegion` so the custom layout persists.
- If the user manually drags/resizes a region, update `rel` (re-derive from the anchor) so it stays consistent.
- Guard against infinite update loops (use a flag or compare values before writing).
- Nested case: region anchored to a blob → blob moves → its region moves → child blob moves (recursion must terminate; the structure is a tree).

**Acceptance:**
- [ ] Drag the problem image: yellow box and its blob(s) move with it; arrows stay attached.
- [ ] Resize the problem image: the yellow box still sits over the same step.
- [ ] A box drawn over empty canvas does not move when other shapes move.
- [ ] Dragging a blob independently keeps that offset when the problem later moves.

---

## P5. Delete behavior: blob is the content, region + arrow are the connection

**Rules:**
1. **Delete the blob → delete its region(s) and arrow(s) too** (the whole group).
2. **Delete the region → delete its arrow only.** The blob stays.
3. **Delete the arrow → unlink only.** Region and blob stay.
4. **"Unlink" semantics:** once the arrow between a region and blob is deleted (or the region is deleted), that blob is **detached**: it no longer follows the problem when it moves, and `offsetFromRegion` is ignored. It becomes a free-floating blob.
5. Each cascade must be **a single undo step** (batch inside one `editor.run`/history mark) so Ctrl+Z restores everything together. **Do not use confirmation dialogs.**
6. **Child blobs are not cascaded.** If a parent blob is deleted, its child blobs (asked from inside it) are detached and kept, each with its own cached crop. (Their `parentId` becomes null; their own region/arrow are deleted only if they pointed into the deleted parent's body — handle by detaching, not deleting the child blob.)
7. **Detached blobs show a thumbnail:** render a small (≈ 48–64px high) thumbnail of the cached `regionImage` in the blob header so the user can still see what it was about. Show it only when the blob is detached.
8. Dangling arrows must never remain: if either endpoint is deleted, clean up the arrow.
9. Prevent recursion: region/arrow delete handlers only touch their own connection; only the blob's delete handler may remove the region.

**Acceptance:**
- [ ] Delete blob → region and arrow vanish; Ctrl+Z restores all three.
- [ ] Delete region → arrow vanishes, blob remains and shows the thumbnail.
- [ ] Delete arrow → region and blob remain; moving the problem no longer moves the blob.
- [ ] No dangling arrows in any case.
- [ ] Deleting a parent blob leaves its child blobs intact.

*(Re-link — drawing an arrow from a detached blob to a region to re-attach — is a later feature. Do not build it now.)*

---

## P6. Polish (do after P1–P5 pass)

- **Readability at low zoom:** increase blob default width (≈ 380–420px) and base font size (≥ 14px). Blob text must stay legible around 70–100% zoom.
- **Placement:** spawn the blob ~80px to the right of the region (as in `spec.md`). If that spot is off-viewport or overlaps another shape, try below, then left, then the nearest free slot. Keep the blob fully inside the current viewport at spawn time (clamp, then pan the camera slightly if needed).
- **Collision avoidance:** a new blob must not overlap existing blobs; nudge to the nearest free position.
- **Consistent header:** every blob shows the "AI" label, collapse button and delete button, always visible, with the header as the drag handle.
- **Thread color linking:** assign each region/blob pair a color from a small palette (yellow, orange, teal, pink, …). Apply it to the region fill/stroke, the arrow, and the blob header accent so pairs are identifiable when zoomed out.
- **Collapsed blob view:** collapsing shows only the header + first line of the answer, so zoomed-out boards stay scannable.

---

## Updated data model summary

```ts
// ask-region
{ w, h, imageDataUrl?, anchorId: string|null, rel: {x,y,w,h}|null, color: string }

// ai-blob
{
  w, h, parentId: string|null,
  collapsed: boolean,
  messages: { role: 'user'|'assistant', content: string, label?: string }[],
  status: 'composing' | 'idle' | 'streaming' | 'error',
  regionImage?: string,
  offsetFromRegion: { x: number, y: number } | null,  // null = detached
  detached: boolean,
  moreOpen: Record<number, boolean>  // per-message "More" toggle state
}
```

## Updated acceptance (add to `spec.md` §12)
- [ ] All acceptance checks listed under P1–P5 pass.
- [ ] Demo script (`spec.md` §13) still works end-to-end with the new composing flow: paste problem → press `A` → box step 3 → type "why did 5x become 8?" → Enter → short gap-first answer with "More ▾" → follow-up in the same blob → drag the problem and everything moves together → delete the blob and everything vanishes in one Ctrl+Z-able step.
