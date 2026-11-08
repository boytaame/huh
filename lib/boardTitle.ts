export const DEFAULT_TITLE = "Untitled board";
export const BOARD_TITLE_KEY = "ai-canvas:board-title";

export function loadBoardTitle(): string {
  if (typeof window === "undefined") return DEFAULT_TITLE;
  try {
    return localStorage.getItem(BOARD_TITLE_KEY) || DEFAULT_TITLE;
  } catch {
    return DEFAULT_TITLE;
  }
}

export function saveBoardTitle(title: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BOARD_TITLE_KEY, title);
  } catch {
    // Storage can be unavailable (private mode / quota); the title still works for this session.
  }
}
