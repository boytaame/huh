export type LLMMessage = { role: "user" | "assistant"; content: string };

/** Bumped whenever the system prompt changes; sent with feedback (D4). */
export const PROMPT_VERSION = "v2.2";

/**
 * Hard output cap enforced here, never trusted from the client (D1). Kept
 * deliberately small: this is a cost-protection ceiling, and answers are
 * meant to be short and gap-first anyway.
 */
export const MAX_OUTPUT_TOKENS = 400;

export const DEFAULT_MODELS = {
  gemini: "gemini-3.6-flash",
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
} as const;

export type LLMProvider = keyof typeof DEFAULT_MODELS;

export const SYSTEM_PROMPT = `You are a tutor embedded in a whiteboard. The user selected ONE part of their material (an image) and may have asked a specific question. Answer ONLY that.

  VOICE
  - Talk like a smart friend who just got it, not a textbook. Plain, short sentences.
  - Assume the user is a student seeing this for the first time. Never use stiff phrases like "it follows that", "recall that", "one can see".
  - Match the language the user writes in. Keep math notation as-is.

  CONTENT
  - Never restate the selected content. They can see it.
  - Line 1 = THE GAP: one sentence on exactly what's confusing or what they asked.
  - Then THE FIX: the key step(s) as short math lines. Every step gets a short "because" in plain words.
  - If a symbol or term might be new, explain it in a few words the first time.
  - For "why does this work" questions, prefer one tiny example with real numbers over abstract explanation.
  - If more detail truly helps, put it after a line containing only ---MORE---.
  - No greetings, no summaries, no "hope this helps", no offers to explain more.
  - Do not end with a recap of the result or a concluding sentence. Stop after the last explanatory step.
  - Use LaTeX: inline $...$ and block $$...$$.
  - If you're unsure what they mean, ask ONE short clarifying question instead of guessing.`;

export type LLMRequest = {
  system: string;
  /** Board summary + ancestor context, sent before the image. */
  context: string;
  question: string;
  /** PNG data URL of the selected region. */
  image?: string;
  /** Messages before the current question. */
  history: LLMMessage[];
};

/** Explicit provider credentials — used for bring-your-own-key requests. */
export type LLMConfig = {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
};

/** Provider failures carry their HTTP status so the route can classify them. */
export class LLMRequestError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "LLMRequestError";
    this.status = status;
  }
}

/** Model label for feedback records; never throws. */
export function serverModelName(): string {
  const provider = (process.env.LLM_PROVIDER ?? "gemini").trim().toLowerCase();
  const fallback = provider in DEFAULT_MODELS
    ? DEFAULT_MODELS[provider as LLMProvider]
    : "unknown";
  return process.env.LLM_MODEL?.trim() || fallback;
}

export type LLMOptions = {
  /** Overrides the server-side env config (BYOK path). */
  config?: LLMConfig;
  signal?: AbortSignal;
};

/**
 * Build the context text sent before the image/question. Shared by the server
 * route and the browser BYOK path so both produce identical prompts.
 */
export function assembleContext(
  boardSummary: string,
  ancestorContext: string,
  hasImage: boolean,
): string {
  return [
    `## Board summary\n${boardSummary || "(empty board)"}`,
    `## Where this selection sits\n${ancestorContext || "(no additional context)"}`,
    hasImage
      ? "## Selected region\nThe attached image is the exact region the user boxed on the board."
      : "## Selected region\nNo image was captured for this selection; rely on the context above.",
  ].join("\n\n");
}

function getConfig() {
  const provider = (process.env.LLM_PROVIDER ?? "gemini").trim().toLowerCase();
  if (!(provider in DEFAULT_MODELS)) {
    throw new Error(
      `Unknown LLM_PROVIDER "${provider}". Use gemini, anthropic, or openai.`,
    );
  }
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY is not set. Copy .env.example to .env.local, add your key, and restart the dev server.",
    );
  }
  const model =
    process.env.LLM_MODEL?.trim() || DEFAULT_MODELS[provider as LLMProvider];
  return { provider: provider as LLMProvider, apiKey, model };
}

/** Merge consecutive same-role messages and drop leading assistant turns. */
export function normalizeHistory(history: LLMMessage[]): LLMMessage[] {
  const out: LLMMessage[] = [];
  for (const message of history) {
    if (!message.content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === message.role) {
      last.content += `\n\n${message.content}`;
    } else {
      out.push({ role: message.role, content: message.content });
    }
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

async function assertOk(response: Response, provider: string): Promise<void> {
  if (response.ok) return;
  const body = (await response.text())
    .slice(0, 500)
    .replace(/key=[^&\s"]+/gi, "key=***");
  throw new LLMRequestError(`${provider} API error ${response.status}: ${body}`, response.status);
}

/**
 * Turn a server-sent-events response into a plain text stream.
 * Providers put one JSON object per `data:` line.
 */
function sseToText(
  response: Response,
  extract: (event: unknown) => string | null | undefined,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  const emit = (controller: ReadableStreamDefaultController<Uint8Array>, raw: string) => {
    const data = raw.trim();
    if (!data || data === "[DONE]") return;
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    const text = extract(event);
    if (text) controller.enqueue(encoder.encode(text));
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const body = response.body;
      if (!body) {
        controller.close();
        return;
      }
      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).replace(/\r$/, "");
            buffer = buffer.slice(newline + 1);
            if (line.startsWith("data:")) emit(controller, line.slice(5));
          }
        }
        const rest = buffer.trim();
        if (rest.startsWith("data:")) emit(controller, rest.slice(5));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    cancel(reason) {
      void response.body?.cancel(reason);
    },
  });
}

/** Stream a completion from the configured provider. */
export async function streamLLM(
  request: LLMRequest,
  options: LLMOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  const config = options.config ?? getConfig();
  const { provider, apiKey } = config;
  const model = config.model?.trim() || DEFAULT_MODELS[provider];
  const history = normalizeHistory(request.history);
  const image = request.image ? parseDataUrl(request.image) : null;

  if (provider === "gemini") {
    type GeminiPart = {
      text?: string;
      inline_data?: { mime_type: string; data: string };
    };
    const contents: { role: "user" | "model"; parts: GeminiPart[] }[] = history.map(
      (message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }),
    );
    contents.push({
      role: "user",
      parts: [
        { text: request.context },
        ...(image
          ? [{ inline_data: { mime_type: image.mediaType, data: image.data } }]
          : []),
        { text: `Question: ${request.question}` },
      ],
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        }),
        signal: options.signal,
      },
    );
    await assertOk(response, "Gemini");
    return sseToText(response, (event) => {
      const data = event as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        promptFeedback?: { blockReason?: string };
      };
      const parts = data.candidates?.[0]?.content?.parts;
      if (parts) return parts.map((part) => part.text ?? "").join("");
      if (data.promptFeedback?.blockReason) {
        throw new Error(`Gemini blocked the request (${data.promptFeedback.blockReason}).`);
      }
      return "";
    });
  }

  if (provider === "anthropic") {
    const messages: { role: "user" | "assistant"; content: unknown }[] = history.map(
      (message) => ({ role: message.role, content: message.content }),
    );
    messages.push({
      role: "user",
      content: [
        { type: "text", text: request.context },
        ...(image
          ? [
              {
                type: "image",
                source: { type: "base64", media_type: image.mediaType, data: image.data },
              },
            ]
          : []),
        { type: "text", text: `Question: ${request.question}` },
      ],
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        // Lets the same code run browser-direct for BYOK requests.
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        // Server-enforced ceiling, independent of anything the client sends.
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.3,
        system: request.system,
        stream: true,
        messages,
      }),
      signal: options.signal,
    });
    await assertOk(response, "Anthropic");
    return sseToText(response, (event) => {
      const data = event as {
        type?: string;
        delta?: { text?: string };
        error?: { message?: string };
      };
      if (data.type === "error") {
        throw new Error(data.error?.message || "Anthropic stream error.");
      }
      if (data.type === "content_block_delta") return data.delta?.text ?? "";
      return "";
    });
  }

  const messages: unknown[] = [{ role: "system", content: request.system }];
  for (const message of history) {
    messages.push({ role: message.role, content: message.content });
  }
  messages.push({
    role: "user",
    content: [
      { type: "text", text: request.context },
      ...(request.image
        ? [{ type: "image_url", image_url: { url: request.image, detail: "high" } }]
        : []),
      { type: "text", text: `Question: ${request.question}` },
    ],
  });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      messages,
    }),
    signal: options.signal,
  });
  await assertOk(response, "OpenAI");
  return sseToText(response, (event) => {
    const data = event as {
      choices?: { delta?: { content?: string } }[];
      error?: { message?: string };
    };
    if (data.error?.message) throw new Error(data.error.message);
    return data.choices?.[0]?.delta?.content ?? "";
  });
}
