import type { Editor, TLShapeId } from "tldraw";
import type { AiBlobShape, ChatMessage } from "@/shapes/types";
import { loadBoardTitle } from "@/lib/boardTitle";

export const DEFAULT_CHAR_BUDGET = 12_000;

export type BuiltContext = {
  boardSummary: string;
  ancestorContext: string;
  /** Thread messages before the question currently being asked. */
  history: ChatMessage[];
};

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function shapeText(editor: Editor, shapeId: string): string | null {
  const shape = editor.getShape(shapeId as TLShapeId);
  if (!shape) return null;
  try {
    return editor.getShapeUtil(shape).getText(shape) ?? null;
  } catch {
    return null;
  }
}

/** Board title + short labels for top-level materials (kept tiny on purpose). */
export function buildBoardSummary(editor: Editor, title?: string): string {
  const boardTitle = title ?? loadBoardTitle();
  const shapes = editor
    .getCurrentPageShapesSorted()
    .filter((shape) => shape.type === "image" || shape.type === "text")
    .slice(0, 15);

  const threadCount = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type === "ai-blob").length;

  const lines = [`Title: "${boardTitle}"`];
  if (shapes.length === 0) {
    lines.push("Materials: none");
  } else {
    lines.push("Top-level materials (left to right, top to bottom):");
    for (const shape of shapes) {
      if (shape.type === "image") {
        const bounds = editor.getShapePageBounds(shape);
        const size = bounds
          ? ` ${Math.round(bounds.w)}×${Math.round(bounds.h)}`
          : "";
        lines.push(`- image${size}`);
      } else {
        const text = shapeText(editor, shape.id) ?? "";
        lines.push(`- text: "${truncate(text, 100)}"`);
      }
    }
  }
  if (threadCount > 0) lines.push(`AI threads on board: ${threadCount}`);

  return lines.join("\n").slice(0, 2000);
}

/** Parent material text plus the recent messages of parent AI threads. */
function buildAncestorContext(editor: Editor, blob: AiBlobShape): string {
  const parts: string[] = [];
  let parentId = blob.props.parentId;
  let depth = 0;

  while (parentId && depth < 3) {
    const shape = editor.getShape(parentId as TLShapeId);
    if (!shape) break;

    if (shape.type === "ai-blob") {
      const parent = shape as AiBlobShape;
      const recent = parent.props.messages.slice(-3);
      if (recent.length) {
        parts.push(
          `Parent AI thread (recent messages):\n${recent
            .map(
              (message) =>
                `${message.role === "user" ? "user" : "assistant"}: ${truncate(
                  message.content,
                  700,
                )}`,
            )
            .join("\n")}`,
        );
      }
      parentId = parent.props.parentId;
      depth += 1;
      continue;
    }

    if (shape.type === "ask-region") {
      parts.push("Parent selection region (yellow box on the board).");
      break;
    }

    const text = shapeText(editor, shape.id);
    if (text) {
      parts.push(`Parent ${shape.type} material:\n${truncate(text, 1200)}`);
    } else {
      const bounds = editor.getShapePageBounds(shape);
      parts.push(
        `Parent ${shape.type} material${
          bounds ? ` (${Math.round(bounds.w)}×${Math.round(bounds.h)})` : ""
        }.`,
      );
    }
    break;
  }

  return parts.join("\n\n").slice(0, 3000);
}

/**
 * Builds the per-request context: compact board summary, ancestor chain and a
 * budget-trimmed thread history. The full board JSON is never sent.
 */
export function buildContext(
  editor: Editor,
  blobId: string,
  options?: { charBudget?: number; title?: string },
): BuiltContext {
  const blob = editor.getShape<AiBlobShape>(blobId as TLShapeId);
  if (!blob) return { boardSummary: "", ancestorContext: "", history: [] };

  const boardSummary = buildBoardSummary(editor, options?.title);
  const ancestorContext = buildAncestorContext(editor, blob);

  const budget = options?.charBudget ?? DEFAULT_CHAR_BUDGET;
  const available = Math.max(1500, budget - boardSummary.length - ancestorContext.length);
  const history: ChatMessage[] = [];
  let used = 0;

  for (let index = blob.props.messages.length - 1; index >= 0; index -= 1) {
    const message = blob.props.messages[index];
    if (!message.content.trim()) continue;
    if (used + message.content.length > available && history.length > 0) break;
    history.unshift({
      role: message.role,
      content: message.content.slice(0, available),
    });
    used += message.content.length;
  }

  return { boardSummary, ancestorContext, history };
}
