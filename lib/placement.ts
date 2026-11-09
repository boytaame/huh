import type { Editor } from "tldraw";
import { overlapArea, rectArea, type Rect } from "@/lib/geometry";
import { toRect } from "@/lib/anchoring";

const GAP = 80;
const MARGIN = 16;
const NUDGE = 48;
const NUDGE_STEPS = 8;

function boxes(editor: Editor, exclude: Set<string>): Rect[] {
  return editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type !== "arrow" && !exclude.has(shape.id))
    .flatMap((shape) => {
      const bounds = editor.getShapePageBounds(shape);
      return bounds ? [toRect(bounds)] : [];
    });
}

function isFree(candidate: Rect, obstacles: Rect[]): boolean {
  return obstacles.every((obstacle) => overlapArea(candidate, obstacle) < 1);
}

function isVisible(candidate: Rect, viewport: Rect): boolean {
  return overlapArea(candidate, viewport) >= rectArea(candidate) * 0.6;
}

function clampToViewport(candidate: Rect, viewport: Rect): Rect {
  const w = Math.min(candidate.w, viewport.w - MARGIN * 2);
  const h = Math.min(candidate.h, viewport.h - MARGIN * 2);
  return {
    w,
    h,
    x: Math.min(
      Math.max(candidate.x, viewport.x + MARGIN),
      viewport.x + viewport.w - w - MARGIN,
    ),
    y: Math.min(
      Math.max(candidate.y, viewport.y + MARGIN),
      viewport.y + viewport.h - h - MARGIN,
    ),
  };
}

/**
 * Blob placement: right of the region (80px), then below, left, above, then
 * the nearest free slot. The result is nudged out of collisions and clamped
 * fully inside the current viewport.
 */
export function findBlobPosition(
  editor: Editor,
  region: Rect,
  size: { w: number; h: number },
  exclude: Set<string>,
): { x: number; y: number } {
  const viewport = toRect(editor.getViewportPageBounds());
  const obstacles = boxes(editor, exclude);
  const { w, h } = size;

  const primary = [
    { x: region.x + region.w + GAP, y: region.y },
    { x: region.x, y: region.y + region.h + GAP },
    { x: region.x - GAP - w, y: region.y },
    { x: region.x, y: region.y - GAP - h },
    { x: region.x + region.w + GAP, y: region.y + region.h + GAP },
    { x: region.x - GAP - w, y: region.y + region.h + GAP },
    { x: region.x + (region.w - w) / 2, y: region.y + region.h + GAP },
    { x: region.x + (region.w - w) / 2, y: region.y - GAP - h },
  ].map((point) => ({ ...point, w, h }));

  const fits = (candidate: Rect) =>
    isFree(candidate, obstacles) && isVisible(candidate, viewport);

  const direct = primary.find(fits);
  if (direct) {
    const clamped = clampToViewport(direct, viewport);
    return { x: clamped.x, y: clamped.y };
  }

  // Nudge outward along each candidate until something is free.
  const directions = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];
  for (let step = 1; step <= NUDGE_STEPS; step += 1) {
    for (const candidate of primary) {
      for (const direction of directions) {
        const nudged: Rect = {
          w,
          h,
          x: candidate.x + direction.x * NUDGE * step,
          y: candidate.y + direction.y * NUDGE * step,
        };
        if (!fits(nudged)) continue;
        const clamped = clampToViewport(nudged, viewport);
        return { x: clamped.x, y: clamped.y };
      }
    }
  }

  const fallback = clampToViewport(primary[0], viewport);
  return { x: fallback.x, y: fallback.y };
}
