"use client";

import { useEffect, useRef, useState } from "react";
import { stopEventPropagation, useEditor } from "tldraw";
import { Markdown } from "@/components/Markdown";
import { askFollowUp, cancelAsk, retryAsk } from "@/lib/stream";
import {
  AI_BLOB_HEADER_HEIGHT,
  AI_BLOB_MAX_BODY_HEIGHT,
  type AiBlobShape,
} from "@/shapes/types";

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5M12 5l-6 6M12 5l6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AiBlob({ shape }: { shape: AiBlobShape }) {
  const editor = useEditor();
  const [draft, setDraft] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  const { messages, status, collapsed, error } = shape.props;
  const streaming = status === "streaming";

  // Grow the blob with its content; cap the body and let it scroll internally.
  useEffect(() => {
    if (collapsed) return;
    const content = contentRef.current;
    const footer = footerRef.current;
    if (!content) return;

    const sync = () => {
      const bodyHeight = Math.min(
        AI_BLOB_MAX_BODY_HEIGHT,
        content.offsetHeight + 24,
      );
      const next =
        AI_BLOB_HEADER_HEIGHT + bodyHeight + (footer?.offsetHeight ?? 56);
      const current = editor.getShape<AiBlobShape>(shape.id);
      if (current && Math.abs(current.props.h - next) > 1) {
        editor.updateShape<AiBlobShape>({
          id: shape.id,
          type: "ai-blob",
          props: { h: next },
        });
      }
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(content);
    if (footer) observer.observe(footer);
    return () => observer.disconnect();
  }, [editor, shape.id, collapsed]);

  useEffect(() => {
    if (!streaming) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages, streaming]);

  const toggleCollapsed = () => {
    if (collapsed) {
      editor.updateShape<AiBlobShape>({
        id: shape.id,
        type: "ai-blob",
        props: { collapsed: false, h: 220 },
      });
    } else {
      editor.updateShape<AiBlobShape>({
        id: shape.id,
        type: "ai-blob",
        props: { collapsed: true, h: AI_BLOB_HEADER_HEIGHT },
      });
    }
  };

  const remove = () => {
    cancelAsk(shape.id);
    editor.deleteShapes([shape.id]);
  };

  const submit = () => {
    const question = draft.trim();
    if (!question || streaming) return;
    setDraft("");
    askFollowUp(editor, shape.id, question);
  };

  return (
    <div className="ai-blob-card" style={{ height: shape.props.h }}>
      <div className="ai-blob-header">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
          AI
        </span>
        {streaming && (
          <span className="ai-typing" aria-label="Thinking">
            <span />
            <span />
            <span />
          </span>
        )}
        {status === "error" && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-red-500">
            error
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          title={collapsed ? "Expand" : "Collapse"}
          aria-label={collapsed ? "Expand" : "Collapse"}
          className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
          onPointerDown={stopEventPropagation}
          onClick={toggleCollapsed}
        >
          <ChevronIcon up={collapsed} />
        </button>
        <button
          type="button"
          title="Delete thread"
          aria-label="Delete thread"
          className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition hover:bg-red-50 hover:text-red-600"
          onPointerDown={stopEventPropagation}
          onClick={remove}
        >
          <TrashIcon />
        </button>
      </div>

      {!collapsed && (
        <div className="ai-blob-body" ref={bodyRef}>
          <div ref={contentRef}>
            {messages.length === 0 && streaming && (
              <div className="text-xs text-neutral-500">Looking at your selection…</div>
            )}

            {messages.map((message, index) => {
              if (message.role === "user") {
                return (
                  <div key={index} className="ai-msg ai-msg-user">
                    {message.content}
                  </div>
                );
              }
              const isLast = index === messages.length - 1;
              return (
                <div key={index} className="ai-msg ai-msg-assistant">
                  {message.content ? (
                    <Markdown>{message.content}</Markdown>
                  ) : streaming && isLast ? (
                    <span className="ai-typing" aria-label="Thinking">
                      <span />
                      <span />
                      <span />
                    </span>
                  ) : null}
                  {streaming && isLast && message.content ? (
                    <span className="ai-caret" />
                  ) : null}
                </div>
              );
            })}

            {status === "error" && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-red-700">
                <div className="font-medium">Couldn’t get an answer</div>
                <div className="mt-0.5 break-words text-red-600/90">
                  {error || "Unexpected error."}
                </div>
                <button
                  type="button"
                  className="mt-1.5 rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 transition hover:bg-red-100"
                  onPointerDown={stopEventPropagation}
                  onClick={() => retryAsk(editor, shape.id)}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!collapsed && (
        <div
          ref={footerRef}
          className="ai-blob-footer"
          onPointerDown={stopEventPropagation}
        >
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              className="ai-blob-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder={streaming ? "Thinking…" : "Ask a follow-up…"}
              disabled={streaming}
              aria-label="Follow-up question"
            />
            <button
              type="submit"
              aria-label="Send follow-up"
              disabled={streaming || !draft.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white transition enabled:hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
