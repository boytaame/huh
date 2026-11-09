export const MORE_MARKER = "---MORE---";

/**
 * Splits a streamed answer on the `---MORE---` marker.
 *
 * The marker can arrive mid-stream, so a trailing partial marker is held back
 * (never rendered as text) until the rest of it shows up.
 */
export function splitAnswer(content: string): { main: string; more: string | null } {
  const index = content.indexOf(MORE_MARKER);
  if (index !== -1) {
    const more = content.slice(index + MORE_MARKER.length).trim();
    return {
      main: content.slice(0, index).replace(/\n+$/, ""),
      more: more || null,
    };
  }

  // Hold back a trailing fragment like "---M" / "---MO" while streaming.
  for (let length = MORE_MARKER.length - 1; length >= 4; length -= 1) {
    const tail = content.slice(-length);
    if (MORE_MARKER.startsWith(tail)) {
      return { main: content.slice(0, -length).replace(/\n+$/, ""), more: null };
    }
  }

  return { main: content, more: null };
}

/** Strip markdown/LaTeX enough for a one-line preview. */
export function plainText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$?/g, "")
    .replace(/[#*_`>]/g, "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First visible line of an answer, for the collapsed blob. */
export function firstLine(content: string, maxLength = 90): string {
  const { main } = splitAnswer(content);
  const line = plainText(main.split("\n").find((part) => part.trim()) ?? main);
  return line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line;
}
