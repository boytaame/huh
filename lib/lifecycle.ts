import type { Editor, TLShapeId } from "tldraw";
import type { AiBlobShape, AskRegionShape } from "@/shapes/types";
import { arrowsForBlob, arrowsForRegion, threadLink } from "@/lib/threads";
import { cancelAsk } from "@/lib/stream";

/**
 * Delete rules (spec-addendum-1 P5):
 * - deleting a blob removes its region(s) and arrow(s),
 * - deleting a region removes its arrow only,
 * - deleting an arrow just detaches the blob,
 * - child blobs survive their parent and become detached,
 * - every cascade is one undo step, with no dangling arrows.
 *
 * The region/blob pair is recorded on the arrow's `meta` when the arrow is
 * created: tldraw has already dropped the arrow bindings by the time a delete
 * handler runs, so bindings cannot be used here.
 */

const arrowsByRegion = new Map<string, TLShapeId[]>();
const arrowsByBlob = new Map<string, TLShapeId[]>();
const regionsByBlob = new Map<string, TLShapeId[]>();

function detachBlob(editor: Editor, blobId: string): void {
  const blob = editor.getShape<AiBlobShape>(blobId as TLShapeId);
  if (!blob) return;
  if (blob.props.detached && blob.props.offsetFromRegion === null) return;
  editor.updateShape<AiBlobShape>({
    id: blob.id,
    type: "ai-blob",
    props: { detached: true, offsetFromRegion: null },
  });
}

/**
 * Installs the delete side effects. Returns a disposer for the editor's onMount.
 */
export function installDeleteCascade(editor: Editor): () => void {
  const removeBefore = editor.sideEffects.registerBeforeDeleteHandler(
    "shape",
    (shape) => {
      // Snapshot the connections before the records disappear.
      if (shape.type === "ask-region") {
        arrowsByRegion.set(shape.id, arrowsForRegion(editor, shape.id));
      } else if (shape.type === "ai-blob") {
        // Deleting a thread must not leave an orphan stream running (D2).
        cancelAsk(shape.id);
        const arrows = arrowsForBlob(editor, shape.id);
        const regions = new Set<TLShapeId>();
        // Regions drawn over this blob (child threads)…
        for (const other of editor.getCurrentPageShapes()) {
          if (other.type !== "ask-region") continue;
          if ((other as AskRegionShape).props.anchorId === shape.id) {
            regions.add(other.id);
          }
        }
        // …and the region this blob's own arrow starts from.
        for (const arrowId of arrows) {
          const link = threadLink(editor.getShape(arrowId) ?? {});
          if (link) regions.add(link.regionId as TLShapeId);
        }
        regionsByBlob.set(shape.id, [...regions]);
        arrowsByBlob.set(shape.id, arrows);
      }
    },
  );

  const removeAfter = editor.sideEffects.registerAfterDeleteHandler(
    "shape",
    (shape) => {
      if (shape.type === "ai-blob") {
        // Children of a deleted parent blob survive as detached blobs.
        for (const other of editor.getCurrentPageShapes()) {
          if (other.type !== "ai-blob") continue;
          const child = other as AiBlobShape;
          if (child.props.parentId !== shape.id) continue;
          editor.updateShape<AiBlobShape>({
            id: child.id,
            type: "ai-blob",
            props: { parentId: "" },
          });
        }

        // The blob is the content: its regions and arrows go with it.
        const doomed = new Set<TLShapeId>([
          ...(regionsByBlob.get(shape.id) ?? []),
          ...(arrowsByBlob.get(shape.id) ?? []),
        ]);
        regionsByBlob.delete(shape.id);
        arrowsByBlob.delete(shape.id);
        const ids = [...doomed].filter((id) => editor.getShape(id));
        if (ids.length) editor.deleteShapes(ids);
        return;
      }

      if (shape.type === "ask-region") {
        const arrows = (arrowsByRegion.get(shape.id) ?? []).filter((id) =>
          editor.getShape(id),
        );
        arrowsByRegion.delete(shape.id);
        if (arrows.length) editor.deleteShapes(arrows);
        return;
      }

      if (shape.type === "arrow") {
        const link = threadLink(shape);
        if (link) detachBlob(editor, link.blobId);
      }
    },
  );

  return () => {
    removeBefore();
    removeAfter();
    arrowsByRegion.clear();
    arrowsByBlob.clear();
    regionsByBlob.clear();
  };
}
