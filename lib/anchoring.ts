import type { Editor, TLShape, TLShapeId } from "tldraw";
import type { AiBlobShape, AskRegionShape, RelativeRect } from "@/shapes/types";
import { linkedBlobs, regionForBlob } from "@/lib/threads";
import { overlapArea, rectArea, rectsIntersect, type Rect } from "@/lib/geometry";

/**
 * Keeps yellow regions glued to the material they were drawn over, and keeps
 * blobs at their offset from their region (spec-addendum-1 P4).
 */

let applying = false;

/** Reentrancy guard: our own writes must not trigger another sync pass. */
export function isApplyingAnchors(): boolean {
  return applying;
}

function near(a: number, b: number, epsilon = 0.5): boolean {
  return Math.abs(a - b) <= epsilon;
}

function boxSize(shape: TLShape): { w: number; h: number } | null {
  const props = shape.props as { w?: unknown; h?: unknown };
  return typeof props.w === "number" && typeof props.h === "number"
    ? { w: props.w, h: props.h }
    : null;
}

function movedOrResized(prev: TLShape, next: TLShape): boolean {
  if (prev.x !== next.x || prev.y !== next.y || prev.rotation !== next.rotation) {
    return true;
  }
  const before = boxSize(prev);
  const after = boxSize(next);
  if (!before || !after) return false;
  return !near(before.w, after.w) || !near(before.h, after.h);
}

export function toRect(box: { x: number; y: number; w: number; h: number }): Rect {
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

/** Bounds of a region expressed as fractions of its anchor's page bounds. */
export function relativeTo(
  regionBounds: Rect,
  anchorBounds: Rect,
): RelativeRect {
  return {
    x: anchorBounds.w ? (regionBounds.x - anchorBounds.x) / anchorBounds.w : 0,
    y: anchorBounds.h ? (regionBounds.y - anchorBounds.y) / anchorBounds.h : 0,
    w: anchorBounds.w ? regionBounds.w / anchorBounds.w : 0,
    h: anchorBounds.h ? regionBounds.h / anchorBounds.h : 0,
  };
}

/**
 * Anchor for a freshly drawn box: the topmost AI blob the box sits mostly on,
 * otherwise the shape with the largest overlap. Regions and arrows are skipped.
 */
export function findAnchor(
  editor: Editor,
  box: Rect,
  excludeId: TLShapeId,
): TLShape | null {
  const boxArea = rectArea(box);
  if (boxArea <= 0) return null;

  const candidates = editor
    .getCurrentPageShapesSorted()
    .filter(
      (shape) =>
        shape.id !== excludeId &&
        shape.type !== "arrow" &&
        shape.type !== "ask-region",
    );

  const blobs: { shape: TLShape; area: number }[] = [];
  const others: { shape: TLShape; area: number }[] = [];

  for (const shape of candidates) {
    const bounds = editor.getShapePageBounds(shape);
    if (!bounds) continue;
    const area = overlapArea(toRect(bounds), box);
    if (area <= 0) continue;
    (shape.type === "ai-blob" ? blobs : others).push({ shape, area });
  }

  // A box drawn over an AI answer anchors to that blob, even if a material
  // behind it also overlaps.
  const blob = blobs.sort((a, b) => b.area - a.area)[0];
  if (blob && blob.area >= boxArea * 0.25) return blob.shape;

  const best = [...blobs, ...others].sort((a, b) => b.area - a.area)[0];
  return best ? best.shape : null;
}

/** Region page bounds the anchor implies right now, or null. */
export function regionTargetBounds(
  editor: Editor,
  region: AskRegionShape,
): Rect | null {
  if (!region.props.anchorId || !region.props.rel) return null;
  const anchor = editor.getShape(region.props.anchorId as TLShapeId);
  if (!anchor) return null;
  const anchorBounds = editor.getShapePageBounds(anchor);
  if (!anchorBounds) return null;

  const { rel } = region.props;
  return {
    x: anchorBounds.x + rel.x * anchorBounds.w,
    y: anchorBounds.y + rel.y * anchorBounds.h,
    w: rel.w * anchorBounds.w,
    h: rel.h * anchorBounds.h,
  };
}

function moveBlobs(
  editor: Editor,
  regionId: TLShapeId,
  dx: number,
  dy: number,
): void {
  if (near(dx, 0) && near(dy, 0)) return;
  for (const blob of linkedBlobs(editor, regionId)) {
    if (!blob.props.offsetFromRegion) continue;
    editor.updateShape<AiBlobShape>({
      id: blob.id,
      type: "ai-blob",
      x: blob.x + dx,
      y: blob.y + dy,
    });
  }
}

/** Recompute every region anchored to this shape, and move their blobs. */
function syncRegionsForAnchor(editor: Editor, anchor: TLShape): void {
  const bounds = editor.getShapePageBounds(anchor);
  if (!bounds) return;

  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== "ask-region") continue;
    const region = shape as AskRegionShape;
    if (region.props.anchorId !== anchor.id) continue;

    const target = regionTargetBounds(editor, region);
    if (!target) continue;

    const dx = target.x - region.x;
    const dy = target.y - region.y;
    const resized = !near(target.w, region.props.w) || !near(target.h, region.props.h);
    if (near(dx, 0) && near(dy, 0) && !resized) continue;

    editor.updateShape<AskRegionShape>({
      id: region.id,
      type: "ask-region",
      x: target.x,
      y: target.y,
      props: { w: target.w, h: target.h },
    });

    moveBlobs(editor, region.id, dx, dy);
  }
}

/** A region moved by hand: re-derive `rel` and keep its blobs at their offset. */
function reanchorRegion(
  editor: Editor,
  prev: AskRegionShape,
  next: AskRegionShape,
): void {
  // If the region already sits exactly where its anchor + rel put it, this
  // change came from our own anchor sync (side effects can run after the
  // caller's guard is gone), so its blobs have already been moved with it.
  const target = regionTargetBounds(editor, next);
  const atTarget =
    !!target &&
    near(next.x, target.x) &&
    near(next.y, target.y) &&
    near(next.props.w, target.w) &&
    near(next.props.h, target.h);
  if (!atTarget) moveBlobs(editor, next.id, next.x - prev.x, next.y - prev.y);

  const anchorId = next.props.anchorId;
  if (!anchorId) return;
  const anchor = editor.getShape(anchorId as TLShapeId);
  if (!anchor) return;
  const anchorBounds = editor.getShapePageBounds(anchor);
  if (!anchorBounds) return;

  const current = {
    x: next.x,
    y: next.y,
    w: next.props.w,
    h: next.props.h,
  };
  const nextRel = relativeTo(current, toRect(anchorBounds));
  const prevRel = next.props.rel;
  if (
    prevRel &&
    near(prevRel.x, nextRel.x, 1e-4) &&
    near(prevRel.y, nextRel.y, 1e-4) &&
    near(prevRel.w, nextRel.w, 1e-4) &&
    near(prevRel.h, nextRel.h, 1e-4)
  ) {
    return;
  }

  editor.updateShape<AskRegionShape>({
    id: next.id,
    type: "ask-region",
    props: { rel: nextRel },
  });
}

/** A blob moved by hand: remember where it sits relative to its region. */
function syncBlobOffset(editor: Editor, blob: AiBlobShape): void {
  const previous = blob.props.offsetFromRegion;
  if (!previous) return;
  const region = regionForBlob(editor, blob.id);
  if (!region) return;

  // A blob that moved together with its region is already at the stored
  // offset; only a hand-moved blob has a new relative position.
  if (
    near(blob.x, region.x + previous.x) &&
    near(blob.y, region.y + previous.y)
  ) {
    return;
  }

  const offset = { x: blob.x - region.x, y: blob.y - region.y };
  if (near(previous.x, offset.x) && near(previous.y, offset.y)) return;

  editor.updateShape<AiBlobShape>({
    id: blob.id,
    type: "ai-blob",
    props: { offsetFromRegion: offset },
  });
}

/**
 * Installs the after-change sync. Returns a disposer for the editor's onMount.
 */
export function installAnchoring(editor: Editor): () => void {
  const remove = editor.sideEffects.registerAfterChangeHandler(
    "shape",
    (prev, next) => {
      if (applying) return;
      if (!movedOrResized(prev, next)) return;

      applying = true;
      try {
        editor.run(() => {
          if (next.type === "ask-region") {
            reanchorRegion(editor, prev as AskRegionShape, next as AskRegionShape);
          } else if (next.type === "ai-blob") {
            if (prev.x !== next.x || prev.y !== next.y) {
              syncBlobOffset(editor, next as AiBlobShape);
            }
            syncRegionsForAnchor(editor, next);
          } else {
            syncRegionsForAnchor(editor, next);
          }
        });
      } finally {
        applying = false;
      }
    },
  );

  return remove;
}

/** Region whose page bounds still intersect a rect (used for capture). */
export function shapesInsideRect(
  editor: Editor,
  bounds: Rect,
  exclude: Set<string>,
): TLShape[] {
  return editor.getCurrentPageShapes().filter((shape) => {
    if (exclude.has(shape.id)) return false;
    if (shape.type === "arrow" || shape.type === "ask-region") return false;
    const shapeBounds = editor.getShapePageBounds(shape);
    return shapeBounds ? rectsIntersect(toRect(shapeBounds), bounds) : false;
  });
}
