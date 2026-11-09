import { BaseBoxShapeUtil, T, type TLPropsMigrations } from "tldraw";
import type { AskRegionShape } from "@/shapes/types";
import { threadColor } from "@/lib/threads";

/** A yellow (or palette-colored) semi-transparent selection box. */
export class AskRegionShapeUtil extends BaseBoxShapeUtil<AskRegionShape> {
  static override type = "ask-region" as const;

  static override props = {
    w: T.number,
    h: T.number,
    imageDataUrl: T.string,
    anchorId: T.nullable(T.string),
    rel: T.nullable(
      T.object({ x: T.number, y: T.number, w: T.number, h: T.number }),
    ),
    color: T.string,
  };

  /** Backfill props for regions saved before spec-addendum-1. */
  static override migrations: TLPropsMigrations = {
    sequence: [
      {
        id: "com.tldraw.shape.ask-region/1",
        up: (props: Record<string, unknown>) => ({
          imageDataUrl: "",
          anchorId: null,
          rel: null,
          color: "yellow",
          ...props,
        }),
        down: "none",
      },
    ],
  };

  getDefaultProps(): AskRegionShape["props"] {
    return {
      w: 200,
      h: 120,
      imageDataUrl: "",
      anchorId: null,
      rel: null,
      color: "yellow",
    };
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
    const color = threadColor(shape.props.color);
    return (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          border: `2px dashed ${color.accent}`,
          background: color.fill,
          borderRadius: 4,
          pointerEvents: "none",
        }}
      />
    );
  }

  override toSvg(shape: AskRegionShape) {
    const color = threadColor(shape.props.color);
    return (
      <rect
        x={0}
        y={0}
        width={shape.props.w}
        height={shape.props.h}
        rx={4}
        fill={color.fill}
        stroke={color.accent}
        strokeWidth={2}
        strokeDasharray="6 4"
      />
    );
  }
}
