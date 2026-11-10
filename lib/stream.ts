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

type FailureCode =
  | "rate_limited"
  | "daily_cap"
  | "provider_error"
  | "timeout"
  | "too_large"
  | "bad_request"
  | "offline"
  | "empty"
  | "cut_off";

class AskError extends Error {
  code: FailureCode;
  retryAfterSec: number;

  constructor(code: FailureCode, message: string, retryAfterSec = 0) {
    super(message);
    this.name = "AskError";
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

/** Short, human copy for every failure (spec-addendum-3 D2). */
export function friendlyErrorMessage(
  code: string,
  fallback = "",
  retryAfterSec = 0,
): string {
  switch (code) {
    case "rate_limited":
      return `Slow down a sec, try again in ~${retryAfterSec || 60}s.`;
    case "daily_cap":
      return "Huh hit its daily limit. Back tomorrow.";
    case "provider_error":
      return "The AI is overloaded. Try again.";
    case "timeout":
      return "That took too long. Try again.";
    case "offline":
      return "You're offline. Reconnect and retry.";
    case "too_large":
      return "That selection is too big or broken. Try a smaller box.";
    case "bad_request":
      return "That request didn't go through. Try a smaller box.";
    case "empty":
      return "Got nothing back. Try again.";
    case "cut_off":
      return "The answer got cut off. Try again.";
    default:
      return fallback || "Something went wrong. Try again.";
  }
}

const activeStreams = new Map<string, AbortController>();
const lastPayloads = new Map<string, AskPayload>();

/** Abort if no token arrives within this window. */
const FIRST_TOKEN_TIMEOUT_MS = 30_000;

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

async function responseFailure(response: Response): Promise<AskError> {
  let body: { error?: unknown; message?: unknown; retryAfterSec?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // Non-JSON failures (a proxy error page) still get a friendly message.
  }

  const code =
    typeof body.error === "string"
      ? body.error
      : response.status === 413
        ? "too_large"
        : response.status === 429
          ? "rate_limited"
          : "provider_error";
  const retryAfterSec =
    typeof body.retryAfterSec === "number" && body.retryAfterSec > 0
      ? body.retryAfterSec
      : response.status === 429
        ? Number(response.headers.get("retry-after")) || 60
        : 0;
  const fallback = typeof body.message === "string" ? body.message : "";

  return new AskError(
    code as FailureCode,
    friendlyErrorMessage(code, fallback, retryAfterSec),
    retryAfterSec,
  );
}

function markFailure(
  editor: Editor,
  blobId: TLShapeId,
  message: string,
  keepPartial: boolean,
): void {
  const shape = editor.getShape<AiBlobShape>(blobId);
  if (!shape) return;

  let messages = shape.props.messages;
  const last = messages[messages.length - 1];
  if (!keepPartial && last?.role === "assistant" && !last.content) {
    messages = messages.slice(0, -1);
  }

  patchBlob(editor, blobId, {
    messages,
    status: "error",
    error: message,
  });
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

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FIRST_TOKEN_TIMEOUT_MS);

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
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new AskError("offline", friendlyErrorMessage("offline"));
    }

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
      if (!response.ok) throw await responseFailure(response);
      body = response.body;
    }

    if (!body) throw new AskError("empty", friendlyErrorMessage("empty"));

    const reader = body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // The 30s deadline only covers time-to-first-token.
      clearTimeout(timeout);

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

    if (!accumulated.trim()) {
      markFailure(editor, blobId, friendlyErrorMessage("empty"), false);
      return;
    }

    flush();
    patchBlob(editor, blobId, { status: "idle", error: "" });
  } catch (error) {
    if (controller.signal.aborted) {
      if (!timedOut) return; // deleted, cancelled, or superseded
      markFailure(editor, blobId, friendlyErrorMessage("timeout"), false);
      return;
    }

    const shape = editor.getShape<AiBlobShape>(blobId);
    if (!shape) return;

    let failure: AskError;
    if (error instanceof AskError) {
      failure = error;
    } else if (
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    ) {
      failure = new AskError("offline", friendlyErrorMessage("offline"));
    } else if (error instanceof TypeError) {
      failure = new AskError("offline", friendlyErrorMessage("offline"));
    } else {
      failure = new AskError("provider_error", friendlyErrorMessage("provider_error"));
    }

    // A cut-off answer keeps its partial text and gets the "(cut off)" line.
    markFailure(
      editor,
      blobId,
      failure.message,
      accumulated.trim().length > 0,
    );
  } finally {
    clearTimeout(timeout);
    if (activeStreams.get(blobId) === controller) {
      activeStreams.delete(blobId);
    }
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
  // A new send supersedes anything still streaming into this blob.
  if (activeStreams.has(blobId)) cancelAsk(blobId);

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

/** Re-send the last failed request without duplicating the user bubble. */
export function retryAsk(editor: Editor, blobId: TLShapeId): void {
  const shape = editor.getShape<AiBlobShape>(blobId);
  if (!shape || activeStreams.has(blobId)) return;

  let payload = lastPayloads.get(blobId);

  if (!payload) {
    // After a refresh the in-memory payload is gone; rebuild it from the
    // thread's last real question and the cached crop.
    let lastUserIndex = -1;
    for (let index = shape.props.messages.length - 1; index >= 0; index -= 1) {
      const message = shape.props.messages[index];
      if (message.role === "user") {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex === -1) return;

    const question = shape.props.messages[lastUserIndex].content;
    if (!question.trim()) return;

    const context = buildContext(editor, blobId);
    payload = {
      image: shape.props.regionImage || undefined,
      question,
      boardSummary: context.boardSummary,
      ancestorContext: context.ancestorContext,
      history: shape.props.messages
        .slice(0, lastUserIndex)
        .filter((message) => message.content.trim())
        .slice(-20)
        .map((message) => ({ role: message.role, content: message.content })),
    };
  }

  const messages = [...shape.props.messages];
  while (messages.length && messages[messages.length - 1].role === "assistant") {
    messages.pop();
  }

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
