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

/**
 * Raw markdown for "Copy LaTeX/Markdown" (E2): exactly what the model returned,
 * minus the `---MORE---` marker line. `$...$` math is kept intact.
 */
export function copyableMarkdown(content: string): string {
  return content
    .replace(/^\s*---MORE---\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Readable text for "Copy text" (E2): markdown emphasis removed, math kept as
 * its LaTeX source, and the collapsed "More" section always included.
 */
export function copyableText(content: string): string {
  const { main, more } = splitAnswer(content);
  const all = more ? `${main}\n\n${more}` : main;
  return all
    .replace(/```[a-zA-Z]*\n?/g, "")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|\s)_([^_\n]+)_/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^\s*---MORE---\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
