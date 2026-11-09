# spec-addendum-2.md — Patch 2 + Git Workflow for Whiteboard AI MVP

> This file **amends `spec.md` and `spec-addendum-1.md`**. Precedence: **addendum-2 > addendum-1 > spec.md** wherever they conflict. Everything not mentioned stays as is.
>
> **Do NOT rewrite the app.** Modify the existing code in this project folder. Work in small steps, verify each step, commit after each passing step.

---

## 0. Read this first (session rules)

- Each work session has a **hard time limit of about 1 hour**, after which progress is paused. Plan for that:
  1. **At the start:** read `PROGRESS.md` (create it if missing, template in §5), run `git status` and `git log --oneline -10`, then continue from where the last session stopped.
  2. **While working:** commit after every passing step (see §1). Never leave the repo in a long uncommitted state.
  3. **About 10 minutes before the limit (or whenever you sense it's close):** stop starting new tasks, finish or revert the current one, update `PROGRESS.md`, and make a final commit.
- Do one session goal at a time (see §2). **Do not start the next session's tasks** unless the current ones are done and committed.
- If a task is taking much longer than expected, **stop, commit what works, log it in `PROGRESS.md` under "Blocked / half-done", and move to the next task.** Finishing 3 things cleanly beats 5 half-built.
- Log assumptions in `DECISIONS.md`.
- **First action of the very first session:** audit the codebase against `spec-addendum-1.md` (P1 to P6) and write the status of each patch (done / partial / not started) into `PROGRESS.md`. Do not assume; check by reading code and running the app.

---

## 1. Git workflow (follow strictly)

Goal: small safe steps, easy rollback, no lost work when a session gets cut off.

### 1.1 Before starting a session
```
git status                      # must be clean
git log --oneline -10
```
- If the working tree is dirty, commit it first: `git add -A && git commit -m "chore: snapshot before session"`.
- Confirm `.gitignore` contains `.env*`, `node_modules`, `.next`. **Never commit secrets or API keys.**

### 1.2 Branching
- `main` = always working. **Never commit directly to `main`** during a session.
- One branch per session: `session/a-interaction`, `session/b-anchoring-delete`, `session/c-polish`.
- Risky or experimental work (e.g. anchoring side effects): use `exp/<name>`. If it doesn't work out, delete the branch and nothing is lost.
- Optional for risky experiments: `git worktree add ../wb-exp exp/<name>` to try something in a separate folder without disturbing the main working copy.

### 1.3 Commit rhythm
- **One logical change = one commit.** Roughly one commit per task checkbox in §3, and at least one every ~10 minutes of work.
- Format: `type(scope): short summary` where type is one of `fix`, `feat`, `refactor`, `style`, `chore`, `docs`, `wip`.
  - Examples: `fix(blob): disable send button when input is empty`, `feat(blob): add resize handles`.
- **Before each commit:** run `git diff --stat` to review what changed (no stray files, no huge unrelated edits), then run the type/build check (`npx tsc --noEmit` and/or `npm run build`; also lint if configured). Fix errors before committing.
- If the time limit is close and a task is unfinished, make a `wip:` commit on the session branch so work isn't lost, and note it in `PROGRESS.md`.

### 1.4 Checkpoints
- When **all tasks of a session pass their acceptance checks**: update `PROGRESS.md`, commit, then tag the branch: `git tag -a v0.<n>-session-<x> -m "<what works>"`.
- **Do NOT merge into `main` yourself.** Tell the user the branch is ready; the user will test and then merge (`git switch main && git merge --no-ff session/<name>`).

### 1.5 Undoing things safely
- Undo uncommitted changes to ONE file: `git restore <file>`.
- Undo a bad committed change: `git revert <commit>` (preserves history).
- **Never** run `git reset --hard`, `git clean -fd`, `git push --force`, or delete branches/tags **without explicitly asking the user first.**
- Don't push unless a remote exists and the user asked you to.

### 1.6 Useful commands for self-review
```
git diff --stat
git log --oneline -10
git show --stat HEAD
git diff main...HEAD --stat     # everything on this branch vs main
```

---

## 2. Session plan (batch by code area)

| Session | Branch | Goal |
|---|---|---|
| **A** | `session/a-interaction` | Audit, interaction bugs, prompt tweaks, composing flow (if not done) |
| **B** | `session/b-anchoring-delete` | Anchored regions (P4) + delete behavior (P5) from addendum-1 |
| **C** | `session/c-polish` | Resize feature, placement/collision, low-zoom readability, color pairs, chip voice |

Reason: A is low-risk interaction-layer work. B changes the data model and shape side effects (riskiest, needs a full fresh session, do not mix with other work). C is polish built on top of a stable model. Don't reorder.

MVP priority: **must-have** = working input and follow-ups, composing flow, anchoring, delete behavior, JSON export. **Should-have** = items 3.1 to 3.4 below. **Nice-to-have** = resize, color pairs, collision avoidance. If time is short, cut from the bottom.

---

## 3. Session A tasks (do now)

### 3.0 Audit (first)
- [ ] Check status of addendum-1 P1 to P6 and write it to `PROGRESS.md`.
- [ ] Confirm the new system prompt (v2, gap-first, plain voice) is in use. See 3.5.

### 3.1 BUG: Ctrl+scroll inside a blob resizes the browser page
**Symptom:** Ctrl + mouse wheel over a blob changes the browser zoom (100% / 125% / 90%).
**Cause (likely):** the wheel event reaches the browser's default zoom handler because it's not `preventDefault`-ed. (Addendum-1 P1 said to let Ctrl+wheel bubble for pinch-zoom; that is now **superseded**.)
**Required behavior:**
- Over a blob, `Ctrl+wheel` must **never zoom the browser page.** Call `preventDefault()` (attach the wheel listener with `{ passive: false }`; React's `onWheel` may be passive, so use a ref + `addEventListener` if needed).
- **Default decision:** Ctrl+wheel over a blob **zooms the board** (the tldraw canvas), centered on the pointer, same as over empty canvas, so the app feels consistent. **Fallback if this gets complicated within a few minutes:** make it a no-op (just prevent browser zoom).
- Plain wheel (no Ctrl) over a blob scrolls the blob's content, and does not zoom or pan the board.
- Check that the same applies while the pointer is over the input, chips and header.
**Acceptance:**
- [ ] Ctrl+wheel over a blob never changes the browser zoom percentage.
- [ ] Ctrl+wheel over a blob zooms the board (or no-ops under the fallback).
- [ ] Plain wheel scrolls the blob content only.

### 3.2 BUG: Send button clickable while input is empty
**Required behavior:**
- Send button is **disabled** (visibly dimmed, not clickable) when `input.trim() === ''` or when the blob `status === 'streaming'`.
- **Follow-up state:** Enter on an empty or whitespace-only input does **nothing**.
- **Composing state (before the first message):** Enter on an empty input still sends the default "Explain this" prompt (this is the addendum-1 P3 behavior and stays). The send **button** is still disabled when empty (the "Explain this" chip is right there).
- Prevent double submits: ignore Enter/click while `status === 'streaming'`. Trim whitespace before sending.
**Acceptance:**
- [ ] Cannot send an empty or whitespace-only follow-up by button or Enter.
- [ ] Cannot send while a response is streaming.
- [ ] Composing state: Enter on empty still runs the default explain.

### 3.3 BUG: Text not selectable inside the blob
**Required behavior (addendum-1 P1 already required this, so verify and fix any regression):**
- All message text (and the answer body) must be selectable and copyable. Set `user-select: text` on the message list (tldraw may apply `user-select: none` on ancestors; override explicitly on the blob body) and `cursor: text` over text.
- Pointer events inside the body must not start a canvas drag or deselect the shape. Dragging the blob happens **only via the header**.
- Double-click selects a word; triple-click selects a paragraph; Ctrl+C copies. KaTeX output should also be copyable (ideally copies the LaTeX source or readable text).
**Acceptance:**
- [ ] Can drag-select text in an AI answer and copy it with Ctrl+C.
- [ ] Selecting text does not move the blob or change the board selection.

### 3.4 Composing flow (only if not already done)
If the audit shows addendum-1 **P3** (no auto-send, focused input, chips, Esc to cancel) is not fully implemented, implement it now per addendum-1 P3 before moving on. If it's done, skip.

### 3.5 Prompt tweaks (voice and length)
The v2 gap-first system prompt is already in place. Verify it, and apply these small additions **if not already present**:
- [ ] Add rule: **"Do not end with a recap of the result or a concluding sentence. Stop after the last explanatory step."** (Current output ends with a line like "Putting those results together gives…" that repeats what's visible.)
- [ ] Add per-chip instruction suffixes appended to the user message:
  - **Simpler:** "Use everyday words and an analogy if it helps. No jargon."
  - **Why?:** "Only give the reason this step is valid, nothing else."
  - **Example:** "Only give one small worked example with real numbers."
  - **Check my work:** "Say first whether it's correct (yes/no), then point to the exact mistake if any."
- [ ] Set a `max_tokens` cap of about 400 on the visible answer as a backstop (the prompt rules are the real control; the cap is a seatbelt).
- [ ] Match the user's language (answer in the language the question is written in; keep math notation as-is).

---

## 4. Session C task: resizable blob (new feature, lowest priority)

**Requirement:** the user can resize an AI blob.
- Enable native tldraw resize on the blob shape (`canResize` true and implement `onResize` if needed), with handles on the corners/edges.
- **Min size:** about 280 x 160. **Max width** about 720. Content must reflow and scroll inside when the blob is smaller than its content.
- **Sizing behavior:** the blob **auto-grows in height** with content (up to its max height) **until the user manually resizes it**; after a manual resize, store a `userSized: true` flag and stop auto-height (content scrolls inside instead). A "reset size" action (double-click on a resize handle or a small button) can clear the flag.
- Resizing must not break text selection, the input, or the arrow binding (the arrow stays attached to the blob edge).
- Persist width/height in the blob's props so it survives a refresh.
**Acceptance:**
- [ ] Dragging a corner resizes the blob; text reflows; the input stays usable.
- [ ] Manually resized blobs stop auto-growing; unresized blobs still auto-grow.
- [ ] Size persists after refresh; arrow stays attached.

(Rest of session C: addendum-1 P6 polish items: placement, collision avoidance, low-zoom readability, color-linked pairs, collapsed view.)

---

## 5. `PROGRESS.md` template (create and keep updated)

```md
# PROGRESS

## Current branch
session/<name>

## Status of patches
- addendum-1 P1: done | partial | not started  (notes)
- P2: ...
- P3: ...
- P4: ...
- P5: ...
- P6: ...
- addendum-2 3.1 / 3.2 / 3.3 / 3.5 / resize: ...

## Done this session
- (commit hash) short summary

## Half-done / blocked
- what, where in the code, what's left

## Next up (in order)
1. ...
2. ...

## How to verify what's done
- steps the user can follow in the app
```

---

## 6. Acceptance for this addendum
- [ ] Ctrl+wheel never changes browser zoom over a blob.
- [ ] Send is impossible when empty or streaming (button and Enter), except Enter-on-empty in composing state.
- [ ] Answer text is selectable and copyable; dragging a blob works only by its header.
- [ ] Answers no longer end with a recap sentence; chips apply their voice suffixes.
- [ ] Git: work done on session branches, small commits with clear messages, tag at the end of each passing session, `PROGRESS.md` current, nothing secret committed, nothing merged to `main` by the agent.
