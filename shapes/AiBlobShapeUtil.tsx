import { BaseBoxShapeUtil, T } from "tldraw";
import { AiBlob } from "@/components/AiBlob";
import type { AiBlobShape } from "@/shapes/types";

/** Strip just enough markdown/LaTeX for a readable SVG fallback of the thread. */
function plainText(content: string): string {
  return content
    .replace(/\$\$?/g, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>]/g, "")
    .replace(/\\[a-zA-Z]+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
      T.object({ role: T.literalEnum("user", "assistant"), content: T.string }),
    ),
    status: T.literalEnum("idle", "streaming", "error"),
    regionImage: T.string,
    error: T.string,
  };

  getDefaultProps(): AiBlobShape["props"] {
    return {
      w: 400,
      h: 170,
      parentId: "",
      collapsed: false,
      messages: [],
      status: "idle",
      regionImage: "",
      error: "",
    };
  }

  override canResize(): boolean {
    return false;
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
    const lines = shape.props.messages
      .slice(-4)
      .flatMap((message) => {
        const prefix = message.role === "user" ? "You: " : "AI: ";
        return wrap(prefix + plainText(message.content), 46);
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
