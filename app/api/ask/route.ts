import { SYSTEM_PROMPT, streamLLM, type LLMMessage } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body.", 400);
  }

  const payload = body as Record<string, unknown>;
  const question = typeof payload.question === "string" ? payload.question.trim() : "";
  if (!question) return errorResponse("A question is required.", 400);

  const image =
    typeof payload.image === "string" && payload.image.startsWith("data:image/")
      ? payload.image
      : undefined;

  const history: LLMMessage[] = Array.isArray(payload.history)
    ? payload.history
        .slice(-40)
        .filter(
          (message): message is LLMMessage =>
            !!message &&
            typeof message === "object" &&
            ((message as LLMMessage).role === "user" ||
              (message as LLMMessage).role === "assistant") &&
            typeof (message as LLMMessage).content === "string",
        )
        .map((message) => ({
          role: message.role,
          content: message.content.slice(0, 8000),
        }))
    : [];

  const boardSummary =
    typeof payload.boardSummary === "string" ? payload.boardSummary.slice(0, 4000) : "";
  const ancestorContext =
    typeof payload.ancestorContext === "string" ? payload.ancestorContext.slice(0, 6000) : "";

  const context = [
    `## Board summary\n${boardSummary || "(empty board)"}`,
    `## Where this selection sits\n${ancestorContext || "(no additional context)"}`,
    image
      ? "## Selected region\nThe attached image is the exact region the user boxed on the board."
      : "## Selected region\nNo image was captured for this selection; rely on the context above.",
  ].join("\n\n");

  try {
    const stream = await streamLLM({
      system: SYSTEM_PROMPT,
      context,
      question,
      image,
      history,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The language model request failed.";
    console.error("[api/ask]", message);
    return errorResponse(message, 502);
  }
}
