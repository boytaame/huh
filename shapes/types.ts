import type { TLBaseShape } from "tldraw";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskRegionProps = {
  w: number;
  h: number;
  /** Cached PNG crop of this region, reused for follow-ups. */
  imageDataUrl: string;
};

export type AiBlobProps = {
  w: number;
  h: number;
  /** Shape this thread was asked about ("" for none). */
  parentId: string;
  collapsed: boolean;
  messages: ChatMessage[];
  status: "idle" | "streaming" | "error";
  /** PNG crop of the selection, re-sent with every request. */
  regionImage: string;
  error: string;
};

// tldraw 5 requires custom shapes to be registered so they become part of the
// editor's TLShape union (and so typed getShape<T>() calls work).
declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    "ask-region": AskRegionProps;
    "ai-blob": AiBlobProps;
  }
}

/** Yellow box drawn with the Ask tool. */
export type AskRegionShape = TLBaseShape<"ask-region", AskRegionProps>;

/** Persistent AI thread anchored beside a selection. */
export type AiBlobShape = TLBaseShape<"ai-blob", AiBlobProps>;

export const AI_BLOB_WIDTH = 400;
export const AI_BLOB_HEADER_HEIGHT = 40;
export const AI_BLOB_MAX_BODY_HEIGHT = 600;
export const AI_BLOB_INITIAL_HEIGHT = 170;
export const DEFAULT_QUESTION =
  "Explain this part step by step, focusing on what is likely confusing.";
