"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Vec, stopEventPropagation, useEditor } from "tldraw";
import { Markdown } from "@/components/Markdown";
import {
  cancelAsk,
  hasActiveStream,
  retryAsk,
  sendQuestion,
} from "@/lib/stream";
import { DEFAULT_QUESTION, QUICK_CHIPS } from "@/lib/chips";
import { firstLine, splitAnswer } from "@/lib/answer";
import { threadColor } from "@/lib/threads";
import { sendFeedback } from "@/lib/feedback";
import {
  AI_BLOB_COLLAPSED_EXTRA,
  AI_BLOB_HEADER_HEIGHT,
  AI_BLOB_MAX_BODY_HEIGHT,
  AI_BLOB_MIN_HEIGHT,
  AI_BLOB_WIDTH,
  type AiBlobShape,
  type ChatMessage,
} from "@/shapes/types";

const FEEDBACK_REASONS = ["Wrong", "Too long", "Didn't help", "Wrong language"] as const;

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

function ResetSizeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"
        stroke="currentColor"
        strokeWidth="1.8"
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

function ThumbIcon({ down }: { down: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={down ? { transform: "rotate(180deg)" } : undefined}
    >
      <path
        d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4.2-7.4A1.6 1.6 0 0 1 14 3.4l.6 5.1H19a2 2 0 0 1 2 2.4l-1.2 7A2.8 2.8 0 0 1 17 20H7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Typing() {
  return (
    <span className="ai-typing" aria-label="Thinking">
      <span />
      <span />
      <span />
    </span>
  );
}

export function AiBlob({ shape }: { shape: AiBlobShape }) {
  const editor = useEditor();
  const [draft, setDraft] = useState("");
  const [downForm, setDownForm] = useState<number | null>(null);
  const [downReason, setDownReason] = useState("");
  const [downComment, setDownComment] = useState("");
  const draftRef = useRef("");
  const cardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, status, collapsed, error, detached, moreOpen } = shape.props;
  const streaming = status === "streaming";
  const composing = status === "composing";
  const accent = threadColor(shape.props.color);
  const showChips = !collapsed && messages.length === 0;

  const setDraftBoth = useCallback((value: string) => {
    draftRef.current = value;
    setDraft(value);
  }, []);

  // Grow with content; cap the body and let it scroll internally.
  useEffect(() => {
    const header = headerRef.current;
    const content = contentRef.current;
    const footer = footerRef.current;

    const sync = () => {
      const headerHeight = header?.offsetHeight ?? AI_BLOB_HEADER_HEIGHT;
      let next: number;
      if (collapsed) {
        next = headerHeight + AI_BLOB_COLLAPSED_EXTRA;
      } else {
        // After a manual resize the card keeps its size and scrolls (addendum-2 §4).
        if (shape.props.userSized) return;
        if (!content) return;
        const bodyHeight = Math.min(
          AI_BLOB_MAX_BODY_HEIGHT,
          content.offsetHeight + 24,
        );
        next = headerHeight + bodyHeight + (footer?.offsetHeight ?? 56);
      }
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
    if (header) observer.observe(header);
    if (content) observer.observe(content);
    if (footer) observer.observe(footer);
    return () => observer.disconnect();
  }, [editor, shape.id, collapsed, detached, status, shape.props.userSized]);

  // Follow the stream.
  useEffect(() => {
    if (!streaming) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages, streaming]);

  // Focus the input when the thread is waiting for its first question.
  useEffect(() => {
    if (!composing || collapsed) return;
    let frames = 0;
    let frame = 0;
    const focus = () => {
      const input = inputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      if (document.activeElement !== input && frames < 8) {
        frames += 1;
        frame = requestAnimationFrame(focus);
      }
    };
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [composing, collapsed]);

  const cancelComposing = useCallback(() => {
    cancelAsk(shape.id);
    // Its own history step: the thread was often created in the same pending
    // batch, and the cancel must still be undoable on its own (P3).
    editor.markHistoryStoppingPoint("cancel-composing");
    editor.run(() => editor.deleteShapes([shape.id]));
  }, [editor, shape.id]);

  // Esc cancels composing; an empty first question is abandoned, not sent.
  useEffect(() => {
    if (!composing) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelComposing();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (draftRef.current.trim()) return;
      const card = cardRef.current;
      if (card && event.target instanceof Node && card.contains(event.target)) {
        return;
      }
      const point = editor.screenToPage({ x: event.clientX, y: event.clientY });
      // Only cancel on empty canvas; clicking material should keep the thread.
      if (editor.getShapeAtPoint(point, { hitInside: true })) return;
      cancelComposing();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [composing, cancelComposing, editor]);

  const toggleCollapsed = () => {
    const headerHeight = headerRef.current?.offsetHeight ?? AI_BLOB_HEADER_HEIGHT;
    if (collapsed) {
      // A hand-sized card comes back at the height the user chose.
      const restore =
        shape.props.userSized && shape.props.userHeight > 0
          ? shape.props.userHeight
          : undefined;
      editor.updateShape<AiBlobShape>({
        id: shape.id,
        type: "ai-blob",
        props: restore
          ? { collapsed: false, h: restore }
          : { collapsed: false },
      });
      return;
    }
    editor.updateShape<AiBlobShape>({
      id: shape.id,
      type: "ai-blob",
      props: { collapsed: true, h: headerHeight + AI_BLOB_COLLAPSED_EXTRA },
    });
  };

  /** Back to the default width with content-driven height. */
  const resetSize = () => {
    const headerHeight = headerRef.current?.offsetHeight ?? AI_BLOB_HEADER_HEIGHT;
    editor.updateShape<AiBlobShape>({
      id: shape.id,
      type: "ai-blob",
      props: {
        userSized: false,
        userHeight: 0,
        w: AI_BLOB_WIDTH,
        h: Math.max(AI_BLOB_MIN_HEIGHT, headerHeight + 120),
      },
    });
  };

  const remove = () => {
    cancelAsk(shape.id);
    // Keep the blob → region → arrow cascade as a single undo step (P5).
    editor.markHistoryStoppingPoint("delete-thread");
    editor.run(() => editor.deleteShapes([shape.id]));
  };

  const send = (question: string, options?: { label?: string; hidden?: boolean }) => {
    if (streaming) return;
    setDraftBoth("");
    sendQuestion(editor, shape.id, question, options);
  };

  const submit = () => {
    if (streaming) return;
    const text = draftRef.current.trim();
    if (!text) {
      // Empty Enter only means something while composing (addendum-2 3.2):
      // a follow-up turn needs actual words.
      if (!composing) return;
      send(DEFAULT_QUESTION, { hidden: true });
      return;
    }
    send(text);
  };

  const patchMessage = (index: number, props: Partial<ChatMessage>) => {
    const current = editor.getShape<AiBlobShape>(shape.id);
    if (!current) return;
    const next = current.props.messages.map((message, at) =>
      at === index ? { ...message, ...props } : message,
    );
    editor.updateShape<AiBlobShape>({
      id: shape.id,
      type: "ai-blob",
      props: { messages: next },
    });
  };

  const postFeedback = (
    index: number,
    rating: "up" | "down",
    reason?: string,
    comment?: string,
  ) => {
    const message = messages[index];
    if (!message || message.role !== "assistant") return;

    let question = "";
    for (let at = index - 1; at >= 0; at -= 1) {
      if (messages[at].role === "user") {
        question = messages[at].content;
        break;
      }
    }

    void sendFeedback({
      messageId: `${shape.id}:${index}`,
      rating,
      reason,
      comment,
      answer: message.content,
      question,
      ts: new Date().toISOString(),
    });
  };

  const rateUp = (index: number) => {
    if (messages[index]?.feedback === "up") {
      patchMessage(index, {
        feedback: undefined,
        feedbackReason: undefined,
        feedbackComment: undefined,
      });
      return;
    }
    patchMessage(index, {
      feedback: "up",
      feedbackReason: undefined,
      feedbackComment: undefined,
    });
    if (downForm === index) setDownForm(null);
    postFeedback(index, "up");
  };

  const rateDown = (index: number) => {
    const message = messages[index];
    if (!message) return;

    if (message.feedback === "down") {
      patchMessage(index, {
        feedback: undefined,
        feedbackReason: undefined,
        feedbackComment: undefined,
      });
      setDownForm(null);
      return;
    }

    setDownForm(index);
    setDownReason(message.feedbackReason ?? "");
    setDownComment(message.feedbackComment ?? "");
  };

  const submitDown = (index: number) => {
    if (!downReason) return;
    const comment = downComment.trim();
    patchMessage(index, {
      feedback: "down",
      feedbackReason: downReason,
      feedbackComment: comment || undefined,
    });
    setDownForm(null);
    postFeedback(index, "down", downReason, comment || undefined);
  };

  const toggleMore = (index: number) => {
    const next = { ...moreOpen, [index]: !moreOpen[index] };
    editor.updateShape<AiBlobShape>({
      id: shape.id,
      type: "ai-blob",
      props: { moreOpen: next },
    });
  };

  // tldraw listens for wheel natively on the canvas, so React's synthetic
  // handlers are too late; the card owns the wheel instead (addendum-2 3.1).
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const onWheel = (event: WheelEvent) => {
      const pinching = event.ctrlKey || event.metaKey;
      if (!pinching) {
        // Plain wheel: the answer scrolls, the board never pans or zooms.
        event.stopPropagation();
        return;
      }
      // Ctrl/Cmd + wheel must never reach the browser's page-zoom handler;
      // it zooms the board around the pointer instead.
      event.preventDefault();
      event.stopPropagation();
      if (!event.deltaY) return;
      const bounds = editor.getContainer().getBoundingClientRect();
      const point = new Vec(
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      );
      if (event.deltaY < 0) editor.zoomIn(point);
      else editor.zoomOut(point);
    };

    // A native drag starting inside the card must never happen: the browser
    // would drag the selected answer text (or a link) out of the shape instead
    // of letting the header move the card. Capture phase, because the body's
    // React handler alone only stops propagation and leaves the drag alive.
    const onDragStart = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    card.addEventListener("wheel", onWheel, { passive: false });
    card.addEventListener("dragstart", onDragStart, true);
    return () => {
      card.removeEventListener("wheel", onWheel);
      card.removeEventListener("dragstart", onDragStart, true);
    };
  }, [editor]);

  // A stream cannot outlive its request. Restoring a deleted thread with undo
  // brings back `status: "streaming"` with no request behind it, which would
  // leave the card stuck on "Thinking…" forever.
  useEffect(() => {
    if (status !== "streaming" || hasActiveStream(shape.id)) return;
    const trimmed = messages.filter(
      (message, index, all) =>
        !(index === all.length - 1 && message.role === "assistant" && !message.content),
    );
    editor.updateShape<AiBlobShape>({
      id: shape.id,
      type: "ai-blob",
      props: { status: "idle", messages: trimmed },
    });
  }, [editor, shape.id, status, messages]);

  const stopAll = {
    onPointerDown: stopEventPropagation,
    onPointerUp: stopEventPropagation,
    onClick: stopEventPropagation,
    onDoubleClick: stopEventPropagation,
    onContextMenu: stopEventPropagation,
  };

  const lastMessage = messages[messages.length - 1];
  const collapsedPreview =
    lastMessage && lastMessage.role === "assistant"
      ? firstLine(lastMessage.content)
      : lastMessage
        ? lastMessage.label ?? firstLine(lastMessage.content)
        : "Waiting for a question…";

  return (
    <div
      ref={cardRef}
      className="ai-blob-card"
      style={{
        height: shape.props.h,
        pointerEvents: "all",
        borderColor: `${accent.accent}55`,
      }}
    >
      <div
        ref={headerRef}
        className="ai-blob-header"
        style={{ borderTop: `3px solid ${accent.accent}` }}
      >
        {detached && shape.props.regionImage ? (
          <img
            className="ai-blob-thumb"
            src={shape.props.regionImage}
            alt="Selected region"
            draggable={false}
          />
        ) : null}
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: accent.accent }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
          AI
        </span>
        {streaming && <Typing />}
        {status === "error" && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-red-500">
            error
          </span>
        )}
        <span className="flex-1" />
        {shape.props.userSized && !collapsed ? (
          <button
            type="button"
            title="Reset size"
            aria-label="Reset size"
            className="ai-blob-icon-btn"
            {...stopAll}
            onClick={(event) => {
              stopEventPropagation(event);
              resetSize();
            }}
          >
            <ResetSizeIcon />
          </button>
        ) : null}
        <button
          type="button"
          title={collapsed ? "Expand" : "Collapse"}
          aria-label={collapsed ? "Expand" : "Collapse"}
          className="ai-blob-icon-btn"
          {...stopAll}
          onClick={(event) => {
            stopEventPropagation(event);
            toggleCollapsed();
          }}
        >
          <ChevronIcon up={collapsed} />
        </button>
        <button
          type="button"
          title="Delete thread"
          aria-label="Delete thread"
          className="ai-blob-icon-btn ai-blob-icon-btn-danger"
          {...stopAll}
          onClick={(event) => {
            stopEventPropagation(event);
            remove();
          }}
        >
          <TrashIcon />
        </button>
      </div>

      {collapsed ? (
        <div
          className="ai-blob-collapsed"
          {...stopAll}
          style={{ borderLeft: `3px solid ${accent.accent}` }}
        >
          <span className="truncate">{collapsedPreview}</span>
        </div>
      ) : (
        <>
          <div
            ref={bodyRef}
            className="ai-blob-body"
            // Inline so no tldraw rule can make the answer unselectable (P1).
            style={{
              userSelect: "text",
              WebkitUserSelect: "text",
              cursor: "text",
            }}
            onPointerDown={stopEventPropagation}
            onPointerUp={stopEventPropagation}
            onPointerMove={stopEventPropagation}
            onDoubleClick={stopEventPropagation}
            onContextMenu={stopEventPropagation}
            onDragStart={stopEventPropagation}
            draggable={false}
          >
            <div ref={contentRef}>
              {messages.length === 0 && !composing && (
                <div className="text-xs text-neutral-500">Ask about this part.</div>
              )}

              {messages.map((message, index) => {
                if (message.role === "user") {
                  if (message.hidden) return null;
                  return (
                    <div key={index} className="ai-msg ai-msg-user">
                      {message.label ?? message.content}
                    </div>
                  );
                }

                const { main, more } = splitAnswer(message.content);
                const isLast = index === messages.length - 1;
                const open = Boolean(moreOpen[index]);

                return (
                  <div key={index} className="ai-msg ai-msg-assistant">
                    {main ? (
                      <Markdown>{main}</Markdown>
                    ) : streaming && isLast ? (
                      <Typing />
                    ) : null}

                    {more !== null && (
                      <div className="ai-more">
                        <button
                          type="button"
                          className="ai-more-toggle"
                          {...stopAll}
                          onClick={(event) => {
                            stopEventPropagation(event);
                            toggleMore(index);
                          }}
                        >
                          {open ? "More ▴" : "More ▾"}
                        </button>
                        {open && (
                          <div className="ai-more-body">
                            <Markdown>{more}</Markdown>
                          </div>
                        )}
                      </div>
                    )}

                    {streaming && isLast && main ? <span className="ai-caret" /> : null}

                    {message.content.trim() && !(streaming && isLast) ? (
                      <div className="ai-feedback">
                        <button
                          type="button"
                          title="Good answer"
                          aria-label="Good answer"
                          aria-pressed={message.feedback === "up"}
                          className={`ai-feedback-btn${message.feedback === "up" ? " ai-feedback-btn-up" : ""}`}
                          {...stopAll}
                          onClick={(event) => {
                            stopEventPropagation(event);
                            rateUp(index);
                          }}
                        >
                          <ThumbIcon down={false} />
                        </button>
                        <button
                          type="button"
                          title="Bad answer"
                          aria-label="Bad answer"
                          aria-pressed={message.feedback === "down"}
                          className={`ai-feedback-btn${message.feedback === "down" ? " ai-feedback-btn-down" : ""}`}
                          {...stopAll}
                          onClick={(event) => {
                            stopEventPropagation(event);
                            rateDown(index);
                          }}
                        >
                          <ThumbIcon down />
                        </button>
                      </div>
                    ) : null}

                    {downForm === index ? (
                      <div className="ai-feedback-form">
                        <div className="ai-feedback-reasons">
                          {FEEDBACK_REASONS.map((reason) => (
                            <button
                              key={reason}
                              type="button"
                              className={`ai-feedback-reason${
                                downReason === reason ? " ai-feedback-reason-on" : ""
                              }`}
                              {...stopAll}
                              onClick={(event) => {
                                stopEventPropagation(event);
                                setDownReason((current) =>
                                  current === reason ? "" : reason,
                                );
                              }}
                            >
                              {reason}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="ai-feedback-comment"
                          rows={2}
                          maxLength={300}
                          value={downComment}
                          placeholder="Anything else? (optional)"
                          onChange={(event) => setDownComment(event.target.value)}
                          onPointerDown={stopEventPropagation}
                          onKeyDown={stopEventPropagation}
                          onPaste={stopEventPropagation}
                        />
                        <div className="ai-feedback-actions">
                          <button
                            type="button"
                            disabled={!downReason}
                            className="ai-feedback-send"
                            {...stopAll}
                            onClick={(event) => {
                              stopEventPropagation(event);
                              submitDown(index);
                            }}
                          >
                            Send
                          </button>
                          <button
                            type="button"
                            className="ai-feedback-cancel"
                            {...stopAll}
                            onClick={(event) => {
                              stopEventPropagation(event);
                              setDownForm(null);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {status === "error" &&
              lastMessage?.role === "assistant" &&
              lastMessage.content ? (
                <div className="ai-cutoff">(cut off)</div>
              ) : null}

              {status === "error" && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] leading-relaxed text-red-700">
                  <div className="font-medium">Couldn’t get an answer</div>
                  <div className="mt-0.5 break-words text-red-600/90">
                    {error || "Something went wrong. Try again."}
                  </div>
                  <button
                    type="button"
                    className="mt-1.5 rounded border border-red-300 bg-white px-2 py-0.5 text-[11.5px] font-medium text-red-700 transition hover:bg-red-100"
                    {...stopAll}
                    onClick={(event) => {
                      stopEventPropagation(event);
                      retryAsk(editor, shape.id);
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            ref={footerRef}
            className="ai-blob-footer"
            onPointerDown={stopEventPropagation}
            onPointerUp={stopEventPropagation}
            onPointerMove={stopEventPropagation}
            onDoubleClick={stopEventPropagation}
            onContextMenu={stopEventPropagation}
          >
            {showChips && (
              <div className="ai-chips">
                {QUICK_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    className="ai-chip"
                    style={{ borderColor: `${accent.accent}66` }}
                    {...stopAll}
                    onClick={(event) => {
                      stopEventPropagation(event);
                      send(chip.prompt, { label: chip.label });
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            <form
              className="flex items-end gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <textarea
                ref={inputRef}
                className="ai-blob-input"
                rows={1}
                value={draft}
                onChange={(event) => setDraftBoth(event.target.value)}
                onKeyDown={(event) => {
                  stopEventPropagation(event);
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                  if (event.key === "Escape" && composing) {
                    event.preventDefault();
                    cancelComposing();
                  }
                }}
                onKeyUp={stopEventPropagation}
                onKeyPress={stopEventPropagation}
                onPointerDown={stopEventPropagation}
                onPointerUp={stopEventPropagation}
                onClick={stopEventPropagation}
                onDoubleClick={stopEventPropagation}
                onPaste={stopEventPropagation}
                placeholder={
                  streaming
                    ? "Thinking…"
                    : composing
                      ? "Ask anything, or press Enter"
                      : "Ask a follow-up…"
                }
                disabled={streaming}
                aria-label="Question"
              />
              <button
                type="submit"
                aria-label="Send question"
                disabled={streaming || !draft.trim()}
                className="ai-blob-send"
              >
                <SendIcon />
              </button>
            </form>

            {composing ? (
              <div className="ai-blob-note">
                AI can be wrong. Double-check important steps.
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
