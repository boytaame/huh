/**
 * Quick prompts offered while a thread has no messages yet (spec-addendum-1 P3).
 * The label is what the user sees in their bubble; the prompt is what the model gets.
 */
export const QUICK_CHIPS = [
  {
    label: "Explain this",
    prompt:
      "Explain this part step by step, focusing on what is likely confusing.",
  },
  {
    label: "Why?",
    prompt: "Why is this step valid? What rule or reasoning justifies it? Only give the reason this step is valid, nothing else.",
  },
  {
    label: "Simpler",
    prompt: "Explain this in simpler terms, as if I'm new to it. Use everyday words and an analogy if it helps. No jargon.",
  },
  {
    label: "Example",
    prompt: "Show a small, concrete example of this idea.",
  },
  {
    label: "Check my work",
    prompt: "Check whether this step is correct and point out any mistake. Say first whether its correct (yes/no), then point to the exact mistake if any.",
  },
] as const;

export type QuickChip = (typeof QUICK_CHIPS)[number];

/** Sent when the user presses Enter on an empty input. */
export const DEFAULT_QUESTION = QUICK_CHIPS[0].prompt;
