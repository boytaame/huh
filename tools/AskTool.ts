import {
  Box,
  createShapeId,
  StateNode,
  Vec,
  type Editor,
  type TLArrowShape,
  type TLPointerEventInfo,
  type TLShapeId,
} from "tldraw";
import { buildContext } from "@/lib/context";
import { blobToDataUrl, downscaleImage } from "@/lib/image";
import { overlapArea, rectArea, rectsIntersect, type Rect } from "@/lib/geometry";
import type { AiBlobShape, AskRegionShape } from "@/shapes/types";
import {
  AI_BLOB_INITIAL_HEIGHT,
  AI_BLOB_WIDTH,
  DEFAULT_QUESTION,
} from "@/shapes/types";
import { streamAnswer } from "@/lib/stream";

const GAP = 80;

function toRect(box: { x: number; y: number; w: number; h: number }): Rect {
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

/** Topmost non-overlay shape under the selection (material or a parent blob). */
function findParent(editor: Editor, bounds: Rect, excludeId: TLShapeId) {
  const candidates = editor
    .getCurrentPageShapesSorted()
    .filter(
      (shape) =>
        shape.id !== excludeId &&
        shape.type !== "arrow" &&
        shape.type !== "ask-region",
    );

  const selectionArea = rectArea(bounds);
  if (selectionArea <= 0) return null;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const pageBounds = editor.getShapePageBounds(candidates[index]);
    if (!pageBounds) continue;
    if (overlapArea(toRect(pageBounds), bounds) >= selectionArea * 0.4) {
      return candidates[index];
    }
  }
  return null;
}

/** Prefer the right side, avoid collisions, then try below/left/above. */
function findBlobPosition(
  editor: Editor,
  region: Rect,
  width: number,
  height: number,
): { x: number; y: number } {
  const viewport = editor.getViewportPageBounds();
  const candidates = [
    { x: region.x + region.w + GAP, y: region.y },
    { x: region.x + region.w + GAP, y: region.y + region.h + GAP },
    { x: region.x, y: region.y + region.h + GAP },
    { x: region.x - GAP - width, y: region.y },
  ];

  const obstacles = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type !== "arrow")
    .flatMap((shape) => {
      const bounds = editor.getShapePageBounds(shape);
      return bounds ? [toRect(bounds)] : [];
    });

  const fits = (candidate: Rect) =>
    obstacles.every((obstacle) => overlapArea(candidate, obstacle) === 0);

  const visible = (candidate: Rect) =>
    overlapArea(candidate, toRect(viewport)) >= rectArea(candidate) * 0.6;

  const box = (candidate: { x: number; y: number }): Rect => ({
    x: candidate.x,
    y: candidate.y,
    w: width,
    h: height,
  });

  return (
    candidates.find((candidate) => fits(box(candidate)) && visible(box(candidate))) ??
    candidates.find((candidate) => fits(box(candidate))) ??
    candidates.find((candidate) => visible(box(candidate))) ??
    candidates[2]
  );
}

function createArrow(
  editor: Editor,
  regionId: TLShapeId,
  blobId: TLShapeId,
  region: { x: number; y: number; w: number; h: number },
  blobPosition: { x: number; y: number },
) {
  const arrowId = createShapeId();
  const startX = region.x + region.w;
  const startY = region.y + region.h / 2;
  const endX = blobPosition.x;
  const endY = blobPosition.y + 80;

  editor.createShape<TLArrowShape>({
    id: arrowId,
    type: "arrow",
    x: startX,
    y: startY,
    props: {
      start: { x: 0, y: 0 },
      end: { x: endX - startX, y: endY - startY },
      color: "black",
      arrowheadEnd: "arrow",
    },
  });

  editor.createBindings([
    {
      fromId: arrowId,
      toId: regionId,
      type: "arrow",
      props: {
        terminal: "start",
        normalizedAnchor: { x: 1, y: 0.5 },
        isExact: false,
        isPrecise: true,
        snap: "none",
      },
    },
    {
      fromId: arrowId,
      toId: blobId,
      type: "arrow",
      props: {
        terminal: "end",
        normalizedAnchor: { x: 0, y: 0.5 },
        isExact: false,
        isPrecise: true,
        snap: "none",
      },
    },
  ]);
}

/**
 * Creates the blob and arrow immediately, then captures the selection crop and
 * starts streaming the first answer.
 */
async function finalizeAsk(editor: Editor, regionId: TLShapeId): Promise<void> {
  const region = editor.getShape<AskRegionShape>(regionId);
  const pageBounds = region ? editor.getShapePageBounds(region) : undefined;
  if (!region || !pageBounds) return;

  const bounds = toRect(pageBounds);
  const parent = findParent(editor, bounds, regionId);
  const position = findBlobPosition(
    editor,
    bounds,
    AI_BLOB_WIDTH,
    AI_BLOB_INITIAL_HEIGHT,
  );

  const blobId = createShapeId();
  editor.createShape<AiBlobShape>({
    id: blobId,
    type: "ai-blob",
    x: position.x,
    y: position.y,
    props: {
      w: AI_BLOB_WIDTH,
      h: AI_BLOB_INITIAL_HEIGHT,
      parentId: parent?.id ?? "",
      collapsed: false,
      messages: [],
      status: "streaming",
      regionImage: "",
      error: "",
    },
  });

  createArrow(editor, regionId, blobId, bounds, position);

  let image = "";

  try {
    const captureShapes = editor.getCurrentPageShapes().filter((shape) => {
      if (shape.id === regionId || shape.id === blobId) return false;
      if (shape.type === "arrow" || shape.type === "ask-region") return false;
      const shapeBounds = editor.getShapePageBounds(shape);
      return shapeBounds
        ? rectsIntersect(toRect(shapeBounds), bounds)
        : false;
    });

    if (captureShapes.length > 0) {
      const { blob } = await editor.toImage(captureShapes, {
        bounds: new Box(bounds.x, bounds.y, bounds.w, bounds.h),
        format: "png",
        background: true,
        padding: 0,
        pixelRatio: 2,
      });
      image = await downscaleImage(await blobToDataUrl(blob), 1600);

      if (editor.getShape<AskRegionShape>(regionId)) {
        editor.updateShape<AskRegionShape>({
          id: regionId,
          type: "ask-region",
          props: { imageDataUrl: image },
        });
      }
      if (editor.getShape<AiBlobShape>(blobId)) {
        editor.updateShape<AiBlobShape>({
          id: blobId,
          type: "ai-blob",
          props: { regionImage: image },
        });
      }
    }
  } catch (error) {
    console.warn("[ask] could not capture the selection", error);
  }

  const blob = editor.getShape<AiBlobShape>(blobId);
  if (!blob) return;

  const context = buildContext(editor, blobId);
  const question = DEFAULT_QUESTION;

  editor.updateShape<AiBlobShape>({
    id: blobId,
    type: "ai-blob",
    props: {
      messages: [{ role: "user", content: question }],
      status: "streaming",
      error: "",
    },
  });

  void streamAnswer(editor, blobId, {
    image: image || undefined,
    question,
    boardSummary: context.boardSummary,
    ancestorContext: context.ancestorContext,
    history: [],
  });
}

class AskIdle extends StateNode {
  static override id = "idle";

  override onPointerDown(_info: TLPointerEventInfo) {
    this.parent.transition("drawing");
  }
}

class AskDrawing extends StateNode {
  static override id = "drawing";

  private origin = new Vec();
  private regionId: TLShapeId | null = null;
  private moved = false;

  override onEnter() {
    this.origin = this.editor.inputs.currentPagePoint.clone();
    this.regionId = null;
    this.moved = false;
    this.editor.setCursor({ type: "cross", rotation: 0 });
  }

  override onPointerMove() {
    const point = this.editor.inputs.currentPagePoint;
    const x = Math.min(this.origin.x, point.x);
    const y = Math.min(this.origin.y, point.y);
    const w = Math.abs(point.x - this.origin.x);
    const h = Math.abs(point.y - this.origin.y);

    if (!this.moved && Math.max(w, h) < 5) return;
    this.moved = true;

    if (!this.regionId) {
      const id = createShapeId();
      this.regionId = id;
      this.editor.createShape<AskRegionShape>({
        id,
        type: "ask-region",
        x,
        y,
        props: { w, h, imageDataUrl: "" },
      });
    } else {
      this.editor.updateShape<AskRegionShape>({
        id: this.regionId,
        type: "ask-region",
        x,
        y,
        props: { w, h },
      });
    }
  }

  override onPointerUp() {
    const regionId = this.regionId;
    const region = regionId
      ? this.editor.getShape<AskRegionShape>(regionId)
      : undefined;
    const bounds = region ? this.editor.getShapePageBounds(region) : undefined;

    this.editor.setCurrentTool("select");

    if (!regionId || !region || !bounds || bounds.w < 10 || bounds.h < 10) {
      if (regionId) this.editor.deleteShapes([regionId]);
      return;
    }

    void finalizeAsk(this.editor, regionId);
  }

  override onCancel() {
    if (this.regionId) this.editor.deleteShapes([this.regionId]);
    this.editor.setCurrentTool("select");
  }

  override onExit() {
    this.editor.setCursor({ type: "default", rotation: 0 });
  }
}

/**
 * Ask tool: drag a rectangle over anything on the board. On release the region
 * becomes a persistent yellow selection with an AI thread attached to its right.
 */
export class AskTool extends StateNode {
  static override id = "ask";
  static override initial = "idle";
  static override children = () => [AskIdle, AskDrawing];

  override onExit() {
    this.editor.setCursor({ type: "default", rotation: 0 });
  }
}
