import {
  BaseBoxShapeUtil,
  T,
  resizeBox,
  type TLPropsMigrations,
  type TLResizeInfo,
} from "tldraw";
import { AiBlob } from "@/components/AiBlob";
import type { AiBlobShape } from "@/shapes/types";
import {
  AI_BLOB_INITIAL_HEIGHT,
  AI_BLOB_MAX_WIDTH,
  AI_BLOB_MIN_HEIGHT,
  AI_BLOB_MIN_WIDTH,
  AI_BLOB_WIDTH,
} from "@/shapes/types";
import { plainText, splitAnswer } from "@/lib/answer";

function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= maxChars) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export class AiBlobShapeUtil extends BaseBoxShapeUtil<AiBlobShape> {
  static override type = "ai-blob" as const;

  static override props = {
    w: T.number,
    h: T.number,
    parentId: T.string,
    collapsed: T.boolean,
    messages: T.arrayOf(
      T.object({
        role: T.literalEnum("user", "assistant"),
        content: T.string,
        label: T.optional(T.string),
        hidden: T.optional(T.boolean),
        feedback: T.optional(T.literalEnum("up", "down")),
        feedbackReason: T.optional(T.string),
        feedbackComment: T.optional(T.string),
      }),
    ),
    status: T.literalEnum("composing", "idle", "streaming", "error"),
    regionImage: T.string,
    error: T.string,
    offsetFromRegion: T.nullable(T.object({ x: T.number, y: T.number })),
    detached: T.boolean,
    moreOpen: T.dict(T.string, T.boolean),
    color: T.string,
    userSized: T.boolean,
    userHeight: T.number,
  };

  /** Backfill props for blobs saved before spec-addendum-1. */
  static override migrations: TLPropsMigrations = {
    sequence: [
      {
        id: "com.tldraw.shape.ai-blob/1",
        up: (props: Record<string, unknown>) => ({
          error: "",
          offsetFromRegion: null,
          detached: false,
          moreOpen: {},
          color: "yellow",
          // A stream cannot survive a reload; don't leave a blob spinning.
          status: props.status === "streaming" ? "idle" : props.status,
          ...props,
        }),
        down: "none",
      },
      {
        id: "com.tldraw.shape.ai-blob/2",
        up: (props: Record<string, unknown>) => ({
          userSized: false,
          userHeight: 0,
          ...props,
        }),
        down: "none",
      },
    ],
  };

  getDefaultProps(): AiBlobShape["props"] {
    return {
      w: AI_BLOB_WIDTH,
      h: AI_BLOB_INITIAL_HEIGHT,
      parentId: "",
      collapsed: false,
      messages: [],
      status: "composing",
      regionImage: "",
      error: "",
      offsetFromRegion: null,
      detached: false,
      moreOpen: {},
      color: "yellow",
      userSized: false,
      userHeight: 0,
    };
  }

  override canResize(): boolean {
    return true;
  }

  /** Corner/edge resize, clamped to the readable range (addendum-2 §4). */
  override onResize(shape: AiBlobShape, info: TLResizeInfo<AiBlobShape>) {
    const resized = resizeBox(shape, info);
    const w = Math.min(
      AI_BLOB_MAX_WIDTH,
      Math.max(AI_BLOB_MIN_WIDTH, resized.props.w),
    );
    const h = Math.max(AI_BLOB_MIN_HEIGHT, resized.props.h);
    return {
      ...resized,
      props: { ...resized.props, w, h, userSized: true, userHeight: h },
    };
  }

  override canEdit(): boolean {
    return false;
  }

  override getIndicatorPath(shape: AiBlobShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  override getText(shape: AiBlobShape): string {
    return shape.props.messages.map((message) => message.content).join("\n\n");
  }

  override component(shape: AiBlobShape) {
    return <AiBlob shape={shape} />;
  }

  /**
   * HTML shapes are not part of tldraw's raster export. Render a plain-text
   * approximation so a child selection over a blob still sees something useful.
   */
  override toSvg(shape: AiBlobShape) {
    const messages = shape.props.collapsed
      ? shape.props.messages.slice(-1)
      : shape.props.messages.slice(-4);
    const lines = messages
      .flatMap((message) => {
        const prefix = message.role === "user" ? "You: " : "AI: ";
        const { main } = splitAnswer(message.content);
        return wrap(prefix + plainText(main), 46);
      })
      .slice(0, 22);

    return (
      <g>
        <rect
          x={0}
          y={0}
          width={shape.props.w}
          height={shape.props.h}
          rx={12}
          fill="#ffffff"
          stroke="#e5e5e5"
        />
        {lines.length > 0 ? (
          <text x={14} y={24} fontSize={13} fontFamily="sans-serif" fill="#171717">
            {lines.map((line, index) => (
              <tspan key={index} x={14} dy={index === 0 ? 0 : 18}>
                {line}
              </tspan>
            ))}
          </text>
        ) : (
          <text x={14} y={24} fontSize={13} fontFamily="sans-serif" fill="#737373">
            AI answer
          </text>
        )}
      </g>
    );
  }
}
