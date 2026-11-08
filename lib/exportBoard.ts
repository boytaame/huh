import type { Editor, TLShapeId } from "tldraw";
import type { AiBlobShape } from "@/shapes/types";

export type BoardNode = {
  id: string;
  type: "material" | "selection" | "ai";
  kind: "image" | "text" | "region" | "thread";
  bounds: { x: number; y: number; w: number; h: number };
  text: string | null;
  parentId: string | null;
  messages: { role: "user" | "assistant"; content: string }[];
};

export type BoardJson = {
  version: 1;
  title: string;
  nodes: BoardNode[];
  edges: { from: string; to: string }[];
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compact, LLM-friendly board JSON (also exposed on `window.getBoardContext`).
 */
export function getBoardContext(editor: Editor, title: string): BoardJson {
  const shapes = editor.getCurrentPageShapesSorted();
  const nodes: BoardNode[] = [];

  for (const shape of shapes) {
    const bounds = editor.getShapePageBounds(shape);
    const rect = bounds
      ? { x: round(bounds.x), y: round(bounds.y), w: round(bounds.w), h: round(bounds.h) }
      : { x: 0, y: 0, w: 0, h: 0 };

    if (shape.type === "image") {
      nodes.push({
        id: shape.id,
        type: "material",
        kind: "image",
        bounds: rect,
        text: null,
        parentId: null,
        messages: [],
      });
    } else if (shape.type === "text") {
      let text: string | null = null;
      try {
        text = editor.getShapeUtil(shape).getText(shape) ?? null;
      } catch {
        text = null;
      }
      nodes.push({
        id: shape.id,
        type: "material",
        kind: "text",
        bounds: rect,
        text,
        parentId: null,
        messages: [],
      });
    } else if (shape.type === "ask-region") {
      nodes.push({
        id: shape.id,
        type: "selection",
        kind: "region",
        bounds: rect,
        text: null,
        parentId: null,
        messages: [],
      });
    } else if (shape.type === "ai-blob") {
      const blob = shape as AiBlobShape;
      nodes.push({
        id: shape.id,
        type: "ai",
        kind: "thread",
        bounds: rect,
        text: null,
        parentId: blob.props.parentId || null,
        messages: blob.props.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });
    }
  }

  const edges: { from: string; to: string }[] = [];
  const seen = new Set<string>();

  for (const shape of shapes) {
    if (shape.type !== "arrow") continue;
    const bindings = editor.getBindingsInvolvingShape(shape.id, "arrow");
    const start = bindings.find((binding) => binding.props.terminal === "start");
    const end = bindings.find((binding) => binding.props.terminal === "end");
    if (!start || !end) continue;
    const key = `${start.toId}->${end.toId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from: start.toId, to: end.toId });
  }

  return { version: 1, title, nodes, edges };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Native tldraw snapshot, for re-importing later. */
export function downloadSnapshot(editor: Editor): void {
  downloadJson("board-snapshot.json", editor.getSnapshot());
}
