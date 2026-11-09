# PROGRESS

## Current branch
session/a-interaction

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
- addendum-2 3.5 (prompt/voice): done — no-recap rule, per-chip suffixes, 400-token cap, language matching (already present).
- addendum-2 resize (session C): not started.

## Done this session
- Audit of addendum-1 P1–P6 by reading the code and exercising the running app; this file created.

## Half-done / blocked
- Nothing.

## Next up (in order)
1. Session C: resizable blob (`userSized` flag, 280×160 min, 720 max width, reset size).
2. Session C polish: collision avoidance and low-zoom readability.

## How to verify what's done
1. `npm run dev`, open the board, drag a selection with the Ask tool: the thread opens composing, cursor in the input, five chips, nothing sent yet.
2. Plain wheel over the answer scrolls it; Ctrl+wheel over the card zooms the board and never the browser page.
3. The send button is greyed out until you type; pressing Enter on an empty follow-up does nothing, but Enter on an empty first input still explains.
4. Select text in an answer with the mouse and copy it; dragging the card must start only from the header strip.
5. Answers stop after the last explanatory step (no "putting it together…" recap); chips use their own voice ("Simpler" = analogy, `Example` = one worked example with numbers).
