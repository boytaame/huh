import { BaseBoxShapeUtil, T } from "tldraw";
import type { AskRegionShape } from "@/shapes/types";

/** A yellow, semi-transparent selection box. */
export class AskRegionShapeUtil extends BaseBoxShapeUtil<AskRegionShape> {
  static override type = "ask-region" as const;

  static override props = {
    w: T.number,
    h: T.number,
    imageDataUrl: T.string,
  };

  getDefaultProps(): AskRegionShape["props"] {
    return { w: 200, h: 120, imageDataUrl: "" };
  }

  override canResize(): boolean {
    return false;
  }

  override canEdit(): boolean {
    return false;
  }

  override getIndicatorPath(shape: AskRegionShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  override component(shape: AskRegionShape) {
    return (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          border: "2px dashed #eab308",
          background: "rgba(250, 204, 21, 0.16)",
          borderRadius: 4,
          pointerEvents: "none",
        }}
      />
    );
  }

  override toSvg(shape: AskRegionShape) {
    return (
      <rect
        x={0}
        y={0}
        width={shape.props.w}
        height={shape.props.h}
        rx={4}
        fill="rgba(250, 204, 21, 0.16)"
        stroke="#eab308"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
    );
  }
}
