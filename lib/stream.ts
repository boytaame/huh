import type { Editor, TLShapeId } from "tldraw";
import type { AiBlobShape, ChatMessage } from "@/shapes/types";
import { SYSTEM_PROMPT, assembleContext, streamLLM } from "@/lib/llm";
import { getByokConfig } from "@/lib/byok";
import { buildContext } from "@/lib/context";
import { DEFAULT_QUESTION } from "@/lib/chips";

export type AskPayload = {
  image?: string;
  question: string;
  boardSummary: string;
  ancestorContext: string;
  history: ChatMessage[];
};

const activeStreams = new Map<string, AbortController>();
const lastPayloads = new Map<string, AskPayload>();

function patchBlob(
  editor: Editor,
  blobId: TLShapeId,
  props: Partial<AiBlobShape["props"]>,
): AiBlobShape | null {
  const shape = editor.getShape<AiBlobShape>(blobId);
  if (!shape) return null;
  editor.updateShape<AiBlobShape>({
    id: blobId,
    type: "ai-blob",
    props,
  });
  return { ...shape, props: { ...shape.props, ...props } };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong while contacting the AI.";
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status}).`;
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text) as { error?: string };
      return json.error || fallback;
    } catch {
      return text.slice(0, 400) || fallback;
    }
  } catch {
    return fallback;
  }
}

/**
 * Streams one answer into a blob. Lives outside React so streaming survives
 * shape culling/re-mounts while the user pans around the board.
 */
export async function streamAnswer(
  editor: Editor,
  blobId: TLShapeId,
  payload: AskPayload,
): Promise<void> {
  if (activeStreams.has(blobId)) return;
  const initial = editor.getShape<AiBlobShape>(blobId);
  if (!initial) return;

  const controller = new AbortController();
  activeStreams.set(blobId, controller);
  lastPayloads.set(blobId, payload);

  patchBlob(editor, blobId, {
    messages: [
      ...initial.props.messages,
      { role: "assistant", content: "" },
    ],
    status: "streaming",
    error: "",
  });

  let accumulated = "";
  let lastFlush = 0;

  const flush = () => {
    const shape = editor.getShape<AiBlobShape>(blobId);
    if (!shape) return;
    const messages = shape.props.messages;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    editor.updateShape<AiBlobShape>({
      id: blobId,
      type: "ai-blob",
      props: {
        messages: [
          ...messages.slice(0, -1),
          { role: "assistant", content: accumulated },
        ],
      },
    });
  };

  try {
    let body: ReadableStream<Uint8Array> | null = null;

    // BYOK: with a user key, the browser calls the provider directly and the
    // app's server is not involved at all.
    const byok = getByokConfig();
    if (byok) {
      body = await streamLLM(
        {
          system: SYSTEM_PROMPT,
          context: assembleContext(payload.boardSummary, payload.ancestorContext, !!payload.image),
          question: payload.question,
          image: payload.image,
          history: payload.history,
        },
        { config: byok, signal: controller.signal },
      );
    } else {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await readErrorMessage(response));
      body = response.body;
    }

    if (!body) throw new Error("The AI response had no body.");

    const reader = body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });

      if (!editor.getShape<AiBlobShape>(blobId)) {
        controller.abort();
        return;
      }

      const now = Date.now();
      if (now - lastFlush > 55) {
        lastFlush = now;
        flush();
      }
    }

    accumulated += decoder.decode();
    flush();
    patchBlob(editor, blobId, { status: "idle", error: "" });
  } catch (error) {
    if (controller.signal.aborted) return;

    const shape = editor.getShape<AiBlobShape>(blobId);
    if (!shape) return;

    // Drop an empty assistant placeholder but keep any partial answer.
    const messages = shape.props.messages.filter(
      (message, index, all) =>
        !(index === all.length - 1 && message.role === "assistant" && !message.content),
    );

    patchBlob(editor, blobId, {
      messages,
      status: "error",
      error: errorMessage(error),
    });
  } finally {
    activeStreams.delete(blobId);
  }
}

/** Append a user turn to an existing thread and stream the reply. */
export function askFollowUp(editor: Editor, blobId: TLShapeId, rawQuestion: string): void {
  sendQuestion(editor, blobId, rawQuestion);
}

export type SendOptions = {
  /** Chip label shown in the user's bubble instead of the prompt. */
  label?: string;
  /** Prompt sent on the user's behalf; kept out of the visible thread. */
  hidden?: boolean;
};

/**
 * Appends a user turn (a typed question, a chip, or the empty-input default)
 * and streams the reply into the same blob.
 */
export function sendQuestion(
  editor: Editor,
  blobId: TLShapeId,
  rawQuestion: string,
  options: SendOptions = {},
): void {
  if (activeStreams.has(blobId)) return;

  const shape = editor.getShape<AiBlobShape>(blobId);
  if (!shape) return;

  const question = rawQuestion.trim() || DEFAULT_QUESTION;
  const context = buildContext(editor, blobId);

  let messages = shape.props.messages;
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant" && !last.content) {
    messages = messages.slice(0, -1);
  }

  const userMessage: ChatMessage = { role: "user", content: question };
  if (options.label) userMessage.label = options.label;
  if (options.hidden) userMessage.hidden = true;

  patchBlob(editor, blobId, {
    messages: [...messages, userMessage],
    status: "streaming",
    error: "",
  });

  void streamAnswer(editor, blobId, {
    image: shape.props.regionImage || undefined,
    question,
    boardSummary: context.boardSummary,
    ancestorContext: context.ancestorContext,
    history: context.history,
  });
}

/** Re-send the last failed request. */
export function retryAsk(editor: Editor, blobId: TLShapeId): void {
  const payload = lastPayloads.get(blobId);
  const shape = editor.getShape<AiBlobShape>(blobId);
  if (!payload || !shape || activeStreams.has(blobId)) return;

  const messages = [...shape.props.messages];
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant") messages.pop();

  patchBlob(editor, blobId, { messages, status: "streaming", error: "" });
  void streamAnswer(editor, blobId, payload);
}

/** True while a request is writing into this blob. */
export function hasActiveStream(blobId: string): boolean {
  return activeStreams.has(blobId);
}

/** Stop an in-flight request (used when the blob is deleted). */
export function cancelAsk(blobId: string): void {
  activeStreams.get(blobId)?.abort();
  activeStreams.delete(blobId);
  lastPayloads.delete(blobId);
}
