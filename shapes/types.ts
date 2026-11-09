import type { TLBaseShape } from "tldraw";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Chip label shown instead of the prompt (e.g. "Why?"). */
  label?: string;
  /** Prompt we sent on the user's behalf (empty input): kept for context, never rendered. */
  hidden?: boolean;
};

/** A rect expressed as fractions (0..1) of an anchor shape's page bounds. */
export type RelativeRect = { x: number; y: number; w: number; h: number };

export type Point = { x: number; y: number };

export type AskRegionProps = {
  w: number;
  h: number;
  /** Cached PNG crop of this region, reused for every request. */
  imageDataUrl: string;
  /** Shape the box was drawn over (null = free-floating). */
  anchorId: string | null;
  /** Region bounds as fractions of the anchor's bounds. */
  rel: RelativeRect | null;
  /** Thread palette id shared with the blob/arrow. */
  color: string;
};

export type AiBlobProps = {
  w: number;
  h: number;
  /** Shape this thread was asked about ("" for none). */
  parentId: string;
  collapsed: boolean;
  messages: ChatMessage[];
  status: "composing" | "idle" | "streaming" | "error";
  /** PNG crop of the selection, re-sent with every request. */
  regionImage: string;
  error: string;
  /** Blob position relative to its region, in page units (null = detached). */
  offsetFromRegion: Point | null;
  /** True once the blob no longer follows a region / the problem. */
  detached: boolean;
  /** Per-message "More" toggle state, keyed by message index. */
  moreOpen: Record<string, boolean>;
  /** Thread palette id shared with the region/arrow. */
  color: string;
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
export const AI_BLOB_DETACHED_HEADER_HEIGHT = 68;
export const AI_BLOB_MAX_BODY_HEIGHT = 600;
export const AI_BLOB_INITIAL_HEIGHT = 190;
export const AI_BLOB_COLLAPSED_EXTRA = 26;
