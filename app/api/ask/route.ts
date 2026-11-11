import { SYSTEM_PROMPT, assembleContext, streamLLM, type LLMMessage } from "@/lib/llm";
import { checkAskLimits } from "@/lib/rateLimit";
import { clientIp, hashClientId, readClientId } from "@/lib/requestIdentity";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Hosted ask endpoint (spec-addendum-3 D1). Every failure uses the same shape:
 * `{ error, message, retryAfterSec }`. Request bodies are validated before the
 * provider is called, and images never appear in logs.
 */

const MAX_BODY_BYTES = 6_500_000; // ~4.8 MB of base64 payload
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_QUESTION_CHARS = 1000;
const MAX_BOARD_SUMMARY_CHARS = 3000;
const MAX_ANCESTOR_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARS = 12_000;

type ErrorCode =
  | "rate_limited"
  | "daily_cap"
  | "too_large"
  | "bad_request"
  | "provider_error"
  | "timeout";

type AskPayload = {
  question: string;
  image?: string;
  boardSummary: string;
  ancestorContext: string;
  history: LLMMessage[];
  /** Regenerate asks for a slightly different answer (spec-addendum-4 E2). */
  regenerate?: boolean;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string };

function fail(code: ErrorCode, message: string): Parsed<never> {
  return { ok: false, code, message };
}

function responseHeaders(cookie: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (cookie) headers["Set-Cookie"] = cookie;
  return headers;
}

function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  cookie: string | null,
  retryAfterSec = 0,
): Response {
  return Response.json(
    { error: code, message, retryAfterSec },
    { status, headers: responseHeaders(cookie) },
  );
}

/** Read at most `maxBytes` of JSON, so a huge payload is rejected unparsed. */
async function readJson(request: Request): Promise<Parsed<unknown>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return fail("too_large", "That image is too big. Select a smaller box.");
  }
  if (!request.body) return fail("bad_request", "Missing request body.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel();
        return fail("too_large", "That image is too big. Select a smaller box.");
      }
      chunks.push(value);
    }
  } catch {
    return fail("bad_request", "Could not read the request body.");
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return fail("bad_request", "Invalid JSON body.");
  }
}

function decodedBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function validateImage(value: unknown): Parsed<string | undefined> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string") {
    return fail("bad_request", "The image must be a data URL.");
  }

  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) {
    return fail("bad_request", "That selection is too big or broken. Try a smaller box.");
  }

  if (decodedBase64Bytes(match[2]) > MAX_IMAGE_BYTES) {
    return fail("too_large", "That selection is too big or broken. Try a smaller box.");
  }

  return { ok: true, value };
}

function validateText(
  value: unknown,
  maxChars: number,
): Parsed<string> {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string") {
    return fail("bad_request", "Malformed request.");
  }
  if (value.length > maxChars) {
    return fail("too_large", "That request carries too much context.");
  }
  return { ok: true, value };
}

function validateHistory(value: unknown): Parsed<LLMMessage[]> {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail("bad_request", "Malformed history.");

  const history: LLMMessage[] = [];
  let total = 0;

  for (const item of value) {
    if (!item || typeof item !== "object") {
      return fail("bad_request", "Malformed history.");
    }
    const message = item as { role?: unknown; content?: unknown };
    if (
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string"
    ) {
      return fail("bad_request", "Malformed history.");
    }
    total += message.content.length;
    if (total > MAX_HISTORY_CHARS) {
      return fail("too_large", "This thread is too long to send. Start a fresh thread.");
    }
    history.push({ role: message.role, content: message.content });
  }

  if (history.length > MAX_HISTORY_MESSAGES) {
    return fail("too_large", "This thread is too long to send. Start a fresh thread.");
  }

  return { ok: true, value: history };
}

function validateBody(body: unknown): Parsed<AskPayload> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("bad_request", "Malformed request.");
  }
  const payload = body as Record<string, unknown>;

  const question =
    typeof payload.question === "string" ? payload.question.trim() : "";
  if (!question) return fail("bad_request", "A question is required.");
  if (question.length > MAX_QUESTION_CHARS) {
    return fail("too_large", "That question is too long.");
  }

  const image = validateImage(payload.image);
  if (!image.ok) return image;

  const boardSummary = validateText(payload.boardSummary, MAX_BOARD_SUMMARY_CHARS);
  if (!boardSummary.ok) return boardSummary;

  const ancestorContext = validateText(payload.ancestorContext, MAX_ANCESTOR_CHARS);
  if (!ancestorContext.ok) return ancestorContext;

  const history = validateHistory(payload.history);
  if (!history.ok) return history;

  if (payload.regenerate !== undefined && typeof payload.regenerate !== "boolean") {
    return fail("bad_request", "Malformed request.");
  }

  return {
    ok: true,
    value: {
      question,
      image: image.value,
      boardSummary: boardSummary.value,
      ancestorContext: ancestorContext.value,
      history: history.value,
      regenerate: payload.regenerate === true,
    },
  };
}

function logRequest(input: {
  clientIdHash: string;
  status: number;
  ms: number;
  code?: ErrorCode;
}): void {
  // Never log image data, prompts, questions or keys.
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      route: "/api/ask",
      cid: input.clientIdHash,
      status: input.status,
      ms: input.ms,
      ...(input.code ? { code: input.code } : {}),
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const { clientId, cookie } = readClientId(request);
  const clientIdHash = hashClientId(clientId);

  const parsedBody = await readJson(request);
  if (!parsedBody.ok) {
    logRequest({ clientIdHash, status: 400, ms: Date.now() - startedAt, code: parsedBody.code });
    return errorResponse(
      parsedBody.code,
      parsedBody.message,
      parsedBody.code === "too_large" ? 413 : 400,
      cookie,
    );
  }

  const validated = validateBody(parsedBody.value);
  if (!validated.ok) {
    const status = validated.code === "too_large" ? 413 : 400;
    logRequest({ clientIdHash, status, ms: Date.now() - startedAt, code: validated.code });
    return errorResponse(validated.code, validated.message, status, cookie);
  }

  const payload = validated.value;
  const limited = await checkAskLimits({ clientId, ip: clientIp(request) });
  if (!limited.ok) {
    logRequest({ clientIdHash, status: 429, ms: Date.now() - startedAt, code: limited.error });
    const message =
      limited.error === "daily_cap"
        ? "Huh hit its daily limit. Back tomorrow."
        : `Slow down a sec, try again in ~${limited.retryAfterSec}s.`;
    const response = errorResponse(
      limited.error,
      message,
      429,
      cookie,
      limited.retryAfterSec,
    );
    response.headers.set("Retry-After", String(limited.retryAfterSec));
    return response;
  }

  const context = assembleContext(
    payload.boardSummary,
    payload.ancestorContext,
    !!payload.image,
  );

  try {
    const stream = await streamLLM(
      {
        system: SYSTEM_PROMPT,
        context,
        question: payload.question,
        image: payload.image,
        history: payload.history,
      },
      { temperature: payload.regenerate ? 0.45 : 0.3 },
    );

    logRequest({ clientIdHash, status: 200, ms: Date.now() - startedAt });

    return new Response(stream, {
      headers: {
        ...responseHeaders(cookie),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    logRequest({
      clientIdHash,
      status: 502,
      ms: Date.now() - startedAt,
      code: "provider_error",
    });
    console.error(
      "[api/ask]",
      error instanceof Error ? error.message.slice(0, 300) : "unknown provider failure",
    );
    return errorResponse(
      "provider_error",
      "The AI is overloaded. Try again.",
      502,
      cookie,
      5,
    );
  }
}
