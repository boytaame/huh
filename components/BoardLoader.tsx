"use client";

import dynamic from "next/dynamic";
import { BoardErrorBoundary } from "@/components/BoardErrorBoundary";

// tldraw needs the DOM, so keep the board client-only.
const Board = dynamic(() => import("./Board"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-neutral-50 text-sm text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
      Loading canvas…
    </div>
  ),
});

export default function BoardLoader() {
  return (
    <BoardErrorBoundary>
      <Board />
    </BoardErrorBoundary>
  );
}
