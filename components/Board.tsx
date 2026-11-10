"use client";

import { useEffect, useRef, useState } from "react";
import { getAssetUrls } from "@tldraw/assets/selfHosted";
import { Tldraw, useEditor, useValue, stopEventPropagation } from "tldraw";
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
import { ByokPanel } from "@/components/ByokPanel";
import {
  isOnboarded,
  markOnboarded,
  ONBOARDED_EVENT,
} from "@/lib/onboarding";
import { track } from "@/lib/analytics";

declare global {
  interface Window {
    getBoardContext?: () => BoardJson;
    /** Last-resort snapshot for the error boundary (D2). */
    getHuhSnapshot?: () => unknown;
  }
}

/** Serve tldraw UI assets (icons, fonts, translations) from /public/tldraw — same origin, so Firefox allows the CSS-mask loads that cdn.tldraw.com would block. */
const assetUrls = getAssetUrls({ baseUrl: "/tldraw/" });

/** Board JSON / native snapshot downloads, in tldraw's top-right panel slot. */
function ExportPanel() {
  const editor = useEditor();

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50"
        onClick={() => {
          track("export_json");
          downloadJson("board.json", getBoardContext(editor, loadBoardTitle()));
        }}
      >
        Export board JSON
      </button>
      <button
        type="button"
        title="Download full snapshot"
        className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-500 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-800"
        onClick={() => {
          track("snapshot_download");
          downloadSnapshot(editor);
        }}
      >
        Snapshot
      </button>
    </div>
  );
}

/** Top-right SharePanel slot: BYOK key box next to the export buttons. */
function SharePanelComposite() {
  return (
    // tldraw's UI layer sets pointer-events:none; re-enable it for custom
    // panel content, and stop tldraw's editor from treating taps as canvas input.
    <div
      className="pointer-events-auto flex items-center gap-2"
      onPointerDown={stopEventPropagation}
    >
      <ByokPanel />
      <ExportPanel />
    </div>
  );
}

/** Shortcuts / help popover (spec-addendum-3 D3). */
function HelpPopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  const rows: [string, string][] = [
    ["A", "Ask tool"],
    ["Enter", "Send"],
    ["Shift + Enter", "New line"],
    ["Esc", "Cancel"],
    ["Ctrl + wheel", "Zoom the board"],
    ["Drag the header", "Move a thread"],
  ];

  return (
    <div ref={rootRef} className="pointer-events-auto absolute bottom-3 left-3">
      {open ? (
        <div className="mb-2 w-[250px] rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
            Shortcuts
          </div>
          <dl className="mt-2 space-y-1.5">
            {rows.map(([keys, label]) => (
              <div key={keys} className="flex items-center justify-between gap-3">
                <dt className="text-[12px] text-neutral-600">{label}</dt>
                <dd className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10.5px] font-medium text-neutral-700">
                  {keys}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
            <a className="underline hover:text-neutral-800" href="/privacy">
              Privacy
            </a>
            <a className="underline hover:text-neutral-800" href="/terms">
              Terms
            </a>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        title="Help and shortcuts"
        aria-label="Help and shortcuts"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-sm font-semibold text-neutral-500 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-800"
      >
        ?
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
  const [showIntro, setShowIntro] = useState(() => !isOnboarded());
  const [sampleState, setSampleState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    track("app_opened");
  }, []);

  useEffect(() => {
    if (showIntro) track("onboarding_shown");
  }, [showIntro]);

  // Material entering the board, without reading what it is.
  useEffect(() => {
    const insideEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      Boolean(target.closest(".ai-blob-card, input, textarea, [contenteditable='true']"));

    const onPaste = (event: ClipboardEvent) => {
      if (insideEditable(event.target)) return;
      const data = event.clipboardData;
      if (!data) return;
      const image = Array.from(data.items).some(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      );
      if (image) track("material_added", { source: "paste" });
      else if (data.getData("text")) track("material_added", { source: "text" });
    };

    const onDrop = (event: DragEvent) => {
      if (insideEditable(event.target)) return;
      if (event.dataTransfer?.files?.length) {
        track("material_added", { source: "drop" });
      }
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // A successful first ask retires the intro card for good.
  useEffect(() => {
    const hide = () => setShowIntro(false);
    window.addEventListener(ONBOARDED_EVENT, hide);
    return () => window.removeEventListener(ONBOARDED_EVENT, hide);
  }, []);

  const dismissIntro = () => {
    if (showIntro) track("onboarding_dismissed");
    setShowIntro(false);
    markOnboarded();
  };

  // Esc dismisses the card unless the user is typing somewhere.
  useEffect(() => {
    if (!showIntro) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      event.stopPropagation();
      dismissIntro();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [showIntro]);

  const loadSample = async () => {
    if (sampleState === "loading") return;
    setSampleState("loading");
    try {
      const response = await fetch("/sample/algebra-steps.svg");
      if (!response.ok) throw new Error("sample unavailable");
      const text = await response.text();
      await editor.putExternalContent({ type: "svg-text", text });
      setSampleState("idle");
      track("sample_loaded");
      setShowIntro(false);
      markOnboarded();
    } catch {
      setSampleState("error");
    }
  };

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
          title="Ask tool (A): drag a box over the part you do not get"
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
        <div className="absolute left-1/2 top-1/2 w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-dashed border-neutral-300 bg-white/70 px-5 py-4 text-center text-[12.5px] leading-relaxed text-neutral-500 backdrop-blur">
          Paste a problem (Ctrl+V) or drop an image. Then press{" "}
          <span className="rounded border border-neutral-300 bg-white px-1 text-[10px] font-medium text-neutral-700">
            A
          </span>{" "}
          and box the part you don’t get.
        </div>
      )}

      {showIntro ? (
        <div className="pointer-events-auto absolute left-3 top-20 w-[300px] rounded-xl border border-neutral-200 bg-white p-4 shadow-lg">
          <button
            type="button"
            onClick={dismissIntro}
            aria-label="Dismiss intro"
            title="Dismiss"
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            ×
          </button>
          <div className="text-sm font-semibold text-neutral-900">Three moves, that’s it</div>
          <ol className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-neutral-600">
            <li>1. Paste or drop your material</li>
            <li>
              2. Press <span className="rounded border border-neutral-300 bg-neutral-50 px-1 text-[10px] font-medium">A</span> and draw a box over what confuses you
            </li>
            <li>3. Ask your question, or just hit Enter</li>
          </ol>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={loadSample}
              disabled={sampleState === "loading"}
              className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-neutral-700 disabled:bg-neutral-300"
            >
              {sampleState === "loading" ? "Loading…" : "Try a sample"}
            </button>
            <button
              type="button"
              onClick={dismissIntro}
              className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-neutral-600 transition hover:bg-neutral-50"
            >
              Got it
            </button>
          </div>
          {sampleState === "error" ? (
            <div className="mt-2 text-[11px] text-red-600">Couldn’t load the sample.</div>
          ) : null}
          <div className="mt-2 text-[10.5px] leading-relaxed text-neutral-400">
            By using Huh you agree to the{" "}
            <a className="underline hover:text-neutral-600" href="/terms">
              Terms
            </a>{" "}
            and{" "}
            <a className="underline hover:text-neutral-600" href="/privacy">
              Privacy Policy
            </a>
            .
          </div>
        </div>
      ) : null}

      <HelpPopover />
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
        assetUrls={assetUrls}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        persistenceKey="ai-canvas-v1"
        shapeUtils={[AskRegionShapeUtil, AiBlobShapeUtil]}
        tools={[AskTool]}
        components={{
          MainMenu: null,
          PageMenu: null,
          SharePanel: SharePanelComposite,
        }}
        onMount={(editor) => {
          window.getBoardContext = () => getBoardContext(editor, titleRef.current);
          window.getHuhSnapshot = () => editor.getSnapshot();
          const disposeAnchoring = installAnchoring(editor);
          const disposeCascade = installDeleteCascade(editor);
          return () => {
            disposeAnchoring();
            disposeCascade();
            delete window.getBoardContext;
            delete window.getHuhSnapshot;
          };
        }}
      >
        <ForceLightBoard />
        <BoardChrome title={title} onTitleChange={handleTitleChange} />
      </Tldraw>
    </div>
  );
}
