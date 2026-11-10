import { PROMPT_VERSION } from "@/lib/llm";

/**
 * Prompt-improvement feedback (spec-addendum-3 D4). Deliberately contains no
 * image: the answer, the question, the rating and an optional note only.
 */
export type FeedbackInput = {
  messageId: string;
  rating: "up" | "down";
  reason?: string;
  comment?: string;
  answer: string;
  question: string;
  ts: string;
};

const MAX_ANSWER_CHARS = 8000;
const MAX_QUESTION_CHARS = 1000;
const MAX_COMMENT_CHARS = 300;

export async function sendFeedback(input: FeedbackInput): Promise<boolean> {
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        ...input,
        answer: input.answer.slice(0, MAX_ANSWER_CHARS),
        question: input.question.slice(0, MAX_QUESTION_CHARS),
        comment: input.comment?.slice(0, MAX_COMMENT_CHARS),
        promptVersion: PROMPT_VERSION,
      }),
    });
    return response.ok;
  } catch {
    // Never block or error the UI on a failed feedback post.
    return false;
  }
}
