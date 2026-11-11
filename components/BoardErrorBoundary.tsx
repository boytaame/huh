"use client";

import { Component, type ReactNode } from "react";
import { downloadJson } from "@/lib/exportBoard";

type Props = { children: ReactNode };
type State = { crashed: boolean };

/**
 * Last-resort guard around the board (spec-addendum-3 D2). Boards live in the
 * browser, so a render crash never means data loss — offer a reload and a
 * snapshot download instead of a stack trace.
 */
export class BoardErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error): void {
    // Error name/message only; never the board contents.
    console.error("[board] render crashed:", error.name, error.message.slice(0, 200));
  }

  downloadSnapshot = (): void => {
    try {
      const snapshot = window.getHuhSnapshot?.();
      downloadJson(
        "board-snapshot.json",
        snapshot ?? { error: "snapshot unavailable", crashedAt: new Date().toISOString() },
      );
    } catch {
      downloadJson("board-snapshot.json", {
        error: "snapshot unavailable",
        crashedAt: new Date().toISOString(),
      });
    }
  };

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Something broke.
          </div>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            Your board is saved in this browser. Reload to pick up where you left off, or
            download a snapshot first.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.downloadSnapshot}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              Download snapshot
            </button>
          </div>
        </div>
      </div>
    );
  }
}
