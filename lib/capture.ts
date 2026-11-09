import { Box, type Editor, type TLShapeId } from "tldraw";
import type { AskRegionShape } from "@/shapes/types";
import { shapesInsideRect, toRect } from "@/lib/anchoring";
import { blobToDataUrl, downscaleImage } from "@/lib/image";

/**
 * Rasterises everything visible inside a region into a PNG data URL.
 *
 * The shape list is collected synchronously (before the first await), so shapes
 * created afterwards — the blob, its arrow — are never part of the crop.
 */
export async function captureRegionImage(
  editor: Editor,
  regionId: TLShapeId,
): Promise<string> {
  const region = editor.getShape<AskRegionShape>(regionId);
  const pageBounds = region ? editor.getShapePageBounds(region) : undefined;
  if (!region || !pageBounds) return "";

  const bounds = toRect(pageBounds);
  const shapes = shapesInsideRect(editor, bounds, new Set([regionId]));
  if (shapes.length === 0) return "";

  try {
    const { blob } = await editor.toImage(shapes, {
      bounds: new Box(bounds.x, bounds.y, bounds.w, bounds.h),
      format: "png",
      background: true,
      padding: 0,
      pixelRatio: 2,
    });
    return await downscaleImage(await blobToDataUrl(blob), 1600);
  } catch (error) {
    console.warn("[ask] could not capture the selection", error);
    return "";
  }
}
