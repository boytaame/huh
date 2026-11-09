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
    prompt:
      "Why is this step valid? Only give the reason this step is valid, nothing else.",
  },
  {
    label: "Simpler",
    prompt:
      "Explain this in simpler terms. Use everyday words and an analogy if it helps. No jargon.",
  },
  {
    label: "Example",
    prompt:
      "Show a small, concrete example of this idea. Only give one small worked example with real numbers.",
  },
  {
    label: "Check my work",
    prompt:
      "Check whether this step is correct. Say first whether it's correct (yes/no), then point to the exact mistake if any.",
  },
] as const;

export type QuickChip = (typeof QUICK_CHIPS)[number];

/** Sent when the user presses Enter on an empty input. */
export const DEFAULT_QUESTION = QUICK_CHIPS[0].prompt;
