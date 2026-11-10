import {
  createShapeId,
  StateNode,
  Vec,
  type Editor,
  type TLArrowShape,
  type TLPointerEventInfo,
  type TLShapeId,
} from "tldraw";
import { captureRegionImage } from "@/lib/capture";
import { findAnchor, relativeTo, toRect } from "@/lib/anchoring";
import { findBlobPosition } from "@/lib/placement";
import { nextThreadColor, threadColor } from "@/lib/threads";
import type { AiBlobShape, AskRegionShape } from "@/shapes/types";
import { AI_BLOB_INITIAL_HEIGHT, AI_BLOB_WIDTH } from "@/shapes/types";
import { track } from "@/lib/analytics";

function createArrow(
  editor: Editor,
  regionId: TLShapeId,
  blobId: TLShapeId,
  region: { x: number; y: number; w: number; h: number },
  blobPosition: { x: number; y: number },
  color: string,
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
    // Arrow bindings are gone by the time a delete handler runs, so the
    // region/blob link lives on the arrow itself (spec-addendum-1 P5).
    meta: { thread: { regionId, blobId } },
    props: {
      start: { x: 0, y: 0 },
      end: { x: endX - startX, y: endY - startY },
      color: threadColor(color).arrow,
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
 * Release handler: anchor the region, capture its crop, create the blob in
 * `composing` state and bind the arrow. **No LLM call happens here** — the
 * answer only starts once the user sends a question or chip.
 */
async function finalizeAsk(editor: Editor, regionId: TLShapeId): Promise<void> {
  const region = editor.getShape<AskRegionShape>(regionId);
  const pageBounds = region ? editor.getShapePageBounds(region) : undefined;
  if (!region || !pageBounds) return;

  track("ask_region_created");

  const bounds = toRect(pageBounds);
  const anchor = findAnchor(editor, bounds, regionId);
  const anchorBounds = anchor ? editor.getShapePageBounds(anchor) : undefined;
  const rel = anchor && anchorBounds ? relativeTo(bounds, toRect(anchorBounds)) : null;

  editor.updateShape<AskRegionShape>({
    id: regionId,
    type: "ask-region",
    props: { anchorId: anchor?.id ?? null, rel },
  });

  // Capture now (at release time), not when the question is sent. The shape
  // list is collected synchronously, so the blob and arrow are not in it.
  const imagePromise = captureRegionImage(editor, regionId);

  const position = findBlobPosition(
    editor,
    bounds,
    { w: AI_BLOB_WIDTH, h: AI_BLOB_INITIAL_HEIGHT },
    new Set([regionId]),
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
      parentId: anchor?.id ?? "",
      collapsed: false,
      messages: [],
      status: "composing",
      regionImage: "",
      error: "",
      offsetFromRegion: { x: position.x - bounds.x, y: position.y - bounds.y },
      detached: false,
      moreOpen: {},
      color: region.props.color,
    },
  });

  createArrow(editor, regionId, blobId, bounds, position, region.props.color);

  const image = await imagePromise;
  if (!image) return;

  const regionStillThere = editor.getShape<AskRegionShape>(regionId);
  if (regionStillThere) {
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
  private color = "yellow";
  private moved = false;

  override onEnter() {
    this.origin = this.editor.inputs.currentPagePoint.clone();
    this.regionId = null;
    this.color = nextThreadColor(this.editor);
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
        props: {
          w,
          h,
          imageDataUrl: "",
          anchorId: null,
          rel: null,
          color: this.color,
        },
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
 * becomes a persistent selection with an AI thread beside it, in composing
 * state, waiting for a question or a quick chip.
 */
export class AskTool extends StateNode {
  static override id = "ask";
  static override initial = "idle";
  static override children = () => [AskIdle, AskDrawing];

  override onExit() {
    this.editor.setCursor({ type: "default", rotation: 0 });
  }
}
