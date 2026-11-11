"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "tldraw";
import { track } from "@/lib/analytics";

/**
 * Autosave indicator (spec-addendum-4 E4).
 *
 * tldraw persists the board itself through its `persistenceKey`; this hook only
 * reports status. `scope: "document"` ignores camera/instance changes, so
 * panning never shows "Saving…". There is no persistence completion hook, so
 * "Saved" is approximated: 500ms after the last document change we probe
 * localStorage (the same storage class the browser exposes to the app). A
 * quota/blocked-storage failure surfaces the failure state.
 */

export type SaveState = "idle" | "saving" | "saved" | "failed";

const DEBOUNCE_MS = 500;
const PROBE_KEY = "huh.save-probe";

function probeStorage(): boolean {
  try {
    window.localStorage.setItem(PROBE_KEY, String(Date.now()));
    window.localStorage.removeItem(PROBE_KEY);
    return true;
  } catch (error) {
    // Error name only: never board content.
    console.error(
      "[autosave] storage write failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return false;
  }
}

export function useAutosave(editor: Editor): SaveState {
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const dispose = editor.store.listen(
      () => {
        setState("saving");
        clearTimer();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          if (probeStorage()) {
            setState("saved");
          } else {
            track("save_failed");
            setState("failed");
          }
        }, DEBOUNCE_MS);
      },
      { scope: "document", source: "user" },
    );

    return () => {
      dispose();
      clearTimer();
    };
  }, [editor]);

  return state;
}
