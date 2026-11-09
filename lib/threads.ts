import type { Editor, TLDefaultColorStyle, TLShapeId } from "tldraw";
import type { AiBlobShape, AskRegionShape } from "@/shapes/types";

/** Small shared palette so a region, its arrow and its blob read as one thread. */
export type ThreadColor = {
  id: string;
  /** Hex used for the region stroke and the blob header accent. */
  accent: string;
  /** Region fill. */
  fill: string;
  /** tldraw style color for the arrow. */
  arrow: TLDefaultColorStyle;
};

export const THREAD_PALETTE: readonly ThreadColor[] = [
  { id: "yellow", accent: "#eab308", fill: "rgba(250, 204, 21, 0.16)", arrow: "yellow" },
  { id: "orange", accent: "#f97316", fill: "rgba(249, 115, 22, 0.14)", arrow: "orange" },
  { id: "teal", accent: "#0d9488", fill: "rgba(13, 148, 136, 0.14)", arrow: "green" },
  { id: "pink", accent: "#db2777", fill: "rgba(219, 39, 119, 0.12)", arrow: "red" },
  { id: "blue", accent: "#2563eb", fill: "rgba(37, 99, 235, 0.12)", arrow: "blue" },
  { id: "violet", accent: "#7c3aed", fill: "rgba(124, 58, 237, 0.12)", arrow: "violet" },
];

export function threadColor(id: string | undefined): ThreadColor {
  return THREAD_PALETTE.find((color) => color.id === id) ?? THREAD_PALETTE[0];
}

/** Next palette entry, preferring colors that are not on the board yet. */
export function nextThreadColor(editor: Editor): string {
  const used = new Set(
    editor
      .getCurrentPageShapes()
      .filter((shape) => shape.type === "ask-region")
      .map((shape) => (shape as AskRegionShape).props.color),
  );
  const free = THREAD_PALETTE.find((color) => !used.has(color.id));
  return (free ?? THREAD_PALETTE[used.size % THREAD_PALETTE.length]).id;
}

export type ThreadLink = { regionId: string; blobId: string };

/** The region/blob pair recorded on the arrow that connects them. */
export function threadLink(shape: { meta?: unknown }): ThreadLink | null {
  const meta = shape.meta as { thread?: Partial<ThreadLink> } | undefined;
  const link = meta?.thread;
  return link && typeof link.regionId === "string" && typeof link.blobId === "string"
    ? (link as ThreadLink)
    : null;
}

/** Arrows whose recorded link mentions this region. */
export function arrowsForRegion(editor: Editor, regionId: string): TLShapeId[] {
  return editor
    .getCurrentPageShapes()
    .filter(
      (shape) => shape.type === "arrow" && threadLink(shape)?.regionId === regionId,
    )
    .map((shape) => shape.id);
}

/** Arrows whose recorded link mentions this blob. */
export function arrowsForBlob(editor: Editor, blobId: string): TLShapeId[] {
  return editor
    .getCurrentPageShapes()
    .filter(
      (shape) => shape.type === "arrow" && threadLink(shape)?.blobId === blobId,
    )
    .map((shape) => shape.id);
}

function isArrowBinding(binding: { props: unknown }): boolean {
  const props = binding.props as { terminal?: unknown };
  return props.terminal === "start" || props.terminal === "end";
}

/** Arrows attached to a shape in either direction. */
export function arrowIdsForShape(editor: Editor, shapeId: string): TLShapeId[] {
  const ids = new Set<TLShapeId>();
  for (const binding of editor.getBindingsInvolvingShape(shapeId as TLShapeId, "arrow")) {
    if (isArrowBinding(binding)) ids.add(binding.fromId);
  }
  return [...ids];
}

/**
 * Arrow bindings point from the arrow to the shape it is bound to, so both
 * helpers look up bindings involving the shape and walk to the arrow.
 */
export function linkedBlobs(editor: Editor, regionId: string): AiBlobShape[] {
  const blobs: AiBlobShape[] = [];
  for (const arrowId of arrowsForRegion(editor, regionId)) {
    const link = threadLink(editor.getShape(arrowId) ?? {});
    const blob = link ? editor.getShape<AiBlobShape>(link.blobId as TLShapeId) : undefined;
    if (blob && blob.type === "ai-blob") blobs.push(blob);
  }
  if (blobs.length) return blobs;

  for (const binding of editor.getBindingsInvolvingShape(
    regionId as TLShapeId,
    "arrow",
  )) {
    if ((binding.props as { terminal?: string }).terminal !== "start") continue;
    if (binding.toId !== regionId) continue;
    const arrowId = binding.fromId;
    const end = editor
      .getBindingsFromShape(arrowId, "arrow")
      .find((other) => (other.props as { terminal?: string }).terminal === "end");
    if (!end) continue;
    const shape = editor.getShape<AiBlobShape>(end.toId);
    if (shape && shape.type === "ai-blob") blobs.push(shape);
  }
  return blobs;
}

/** Region whose arrow ends at this blob (if any). */
export function regionForBlob(editor: Editor, blobId: string): AskRegionShape | null {
  for (const arrowId of arrowsForBlob(editor, blobId)) {
    const link = threadLink(editor.getShape(arrowId) ?? {});
    const region = link
      ? editor.getShape<AskRegionShape>(link.regionId as TLShapeId)
      : undefined;
    if (region && region.type === "ask-region") return region;
  }

  for (const binding of editor.getBindingsInvolvingShape(
    blobId as TLShapeId,
    "arrow",
  )) {
    if ((binding.props as { terminal?: string }).terminal !== "end") continue;
    if (binding.toId !== blobId) continue;
    const arrowId = binding.fromId;
    const start = editor
      .getBindingsFromShape(arrowId, "arrow")
      .find((other) => (other.props as { terminal?: string }).terminal === "start");
    if (!start) continue;
    const shape = editor.getShape<AskRegionShape>(start.toId);
    if (shape && shape.type === "ask-region") return shape;
  }
  return null;
}

/** Regions that belong to a blob: drawn over it, or linked by an arrow. */
export function regionsForBlob(editor: Editor, blobId: string): AskRegionShape[] {
  const regions = new Map<string, AskRegionShape>();
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== "ask-region") continue;
    const region = shape as AskRegionShape;
    if (region.props.anchorId === blobId) regions.set(region.id, region);
  }
  const linked = regionForBlob(editor, blobId);
  if (linked) regions.set(linked.id, linked);
  return [...regions.values()];
}
