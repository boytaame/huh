"use client";

import { useEffect, useRef, useState } from "react";
import { Tldraw, useEditor, useValue } from "tldraw";
import { AiBlobShapeUtil } from "@/shapes/AiBlobShapeUtil";
import { AskRegionShapeUtil } from "@/shapes/AskRegionShapeUtil";
import { AskTool } from "@/tools/AskTool";
import {
  DEFAULT_TITLE,
  loadBoardTitle,
  saveBoardTitle,
} from "@/lib/boardTitle";
import {
  downloadJson,
  downloadSnapshot,
  getBoardContext,
  type BoardJson,
} from "@/lib/exportBoard";
import { installAnchoring } from "@/lib/anchoring";
import { installDeleteCascade } from "@/lib/lifecycle";

declare global {
  interface Window {
    getBoardContext?: () => BoardJson;
  }
}

/** Board JSON / native snapshot downloads, in tldraw's top-right panel slot. */
function ExportPanel() {
  const editor = useEditor();

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50"
        onClick={() =>
          downloadJson("board.json", getBoardContext(editor, loadBoardTitle()))
        }
      >
        Export board JSON
      </button>
      <button
        type="button"
        title="Download full snapshot"
        className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-500 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-800"
        onClick={() => downloadSnapshot(editor)}
      >
        Snapshot
      </button>
    </div>
  );
}

function BoardChrome({
  title,
  onTitleChange,
}: {
  title: string;
  onTitleChange: (value: string) => void;
}) {
  const editor = useEditor();
  const toolId = useValue("current-tool", () => editor.getCurrentToolId(), [editor]);
  const shapeCount = useValue(
    "shape-count",
    () => editor.getCurrentPageShapes().length,
    [editor],
  );
  const isAsking = toolId === "ask";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key.toLowerCase() !== "a") return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (editor.getEditingShapeId()) return;

      event.preventDefault();
      event.stopPropagation();
      editor.setCurrentTool("ask");
    };

    // Capture phase: "A" must win over tldraw's built-in arrow shortcut.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [editor]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[600]">
      <div className="pointer-events-auto absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur">
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
        <div className="min-w-0">
          <div className="text-[8.5px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
            AI Canvas
          </div>
          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            maxLength={80}
            spellCheck={false}
            aria-label="Board title"
            className="block w-[180px] truncate bg-transparent text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400"
            placeholder={DEFAULT_TITLE}
          />
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-20 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => editor.setCurrentTool(isAsking ? "select" : "ask")}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-sm transition ${
            isAsking
              ? "border-amber-500 bg-amber-400 text-neutral-900"
              : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isAsking ? "bg-neutral-900" : "bg-amber-400"
            }`}
          />
          Ask
          <kbd
            className={`ml-0.5 rounded border px-1 text-[10px] font-medium ${
              isAsking
                ? "border-black/20 bg-black/10 text-neutral-800"
                : "border-neutral-200 bg-neutral-50 text-neutral-500"
            }`}
          >
            A
          </kbd>
        </button>
        {isAsking && (
          <div className="rounded-full bg-neutral-900/90 px-3 py-1 text-[11px] text-white shadow-sm">
            Drag a box over any part of the board
          </div>
        )}
      </div>

      {shapeCount === 0 && !isAsking && (
        <div className="absolute left-1/2 top-1/2 w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-dashed border-neutral-300 bg-white/70 px-5 py-4 text-center backdrop-blur">
          <div className="text-sm font-medium text-neutral-700">
            Drop study material anywhere
          </div>
          <div className="mt-1 text-xs leading-relaxed text-neutral-500">
            Paste an image (Ctrl+V), drag in a file, or press{" "}
            <span className="rounded border border-neutral-300 bg-white px-1 text-[10px] font-medium">
              A
            </span>{" "}
            and box the part you are stuck on.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The app's chrome is light-only, so a dark colour scheme — stored by tldraw in
 * this browser, resolved from the OS when the scheme is "system", or pushed in
 * by another tab — paints the board black behind white UI. Watch the resolved
 * mode rather than pinning once on mount: the OS listener and tldraw's
 * cross-tab broadcasts can both turn the board dark after the editor starts.
 */
function ForceLightBoard() {
  const editor = useEditor();
  const isDark = useValue(
    "board-is-dark",
    () => editor.user.getIsDarkMode(),
    [editor],
  );

  useEffect(() => {
    if (isDark) {
      editor.user.updateUserPreferences({ colorScheme: "light" });
    }
  }, [editor, isDark]);

  return null;
}

export default function Board() {
  const [title, setTitle] = useState(() => loadBoardTitle());
  const titleRef = useRef(title);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    titleRef.current = value;
    saveBoardTitle(value);
  };

  return (
    <div className="ai-canvas-root">
      <Tldraw
        persistenceKey="ai-canvas-v1"
        shapeUtils={[AskRegionShapeUtil, AiBlobShapeUtil]}
        tools={[AskTool]}
        components={{
          MainMenu: null,
          PageMenu: null,
          SharePanel: ExportPanel,
        }}
        onMount={(editor) => {
          window.getBoardContext = () => getBoardContext(editor, titleRef.current);
          const disposeAnchoring = installAnchoring(editor);
          const disposeCascade = installDeleteCascade(editor);
          return () => {
            disposeAnchoring();
            disposeCascade();
            delete window.getBoardContext;
          };
        }}
      >
        <ForceLightBoard />
        <BoardChrome title={title} onTitleChange={handleTitleChange} />
      </Tldraw>
    </div>
  );
}
