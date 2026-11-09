import { useSyncExternalStore } from "react";
import { DEFAULT_MODELS, type LLMConfig, type LLMProvider } from "@/lib/llm";

/**
 * Client-side BYOK (bring your own key) store.
 *
 * The key lives in localStorage and never touches this app's server: when a
 * BYOK config is present, the browser calls the LLM provider directly.
 */
export type ByokState = { provider: LLMProvider; apiKey: string };

const STORAGE_KEY = "ai-canvas-byok-v1";

const listeners = new Set<() => void>();
let cached: ByokState | null = null;
let initialised = false;

function isValidProvider(value: unknown): value is LLMProvider {
  return typeof value === "string" && value in DEFAULT_MODELS;
}

function readStorage(): ByokState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const provider = parsed.provider;
    const apiKey = parsed.apiKey;
    if (!isValidProvider(provider) || typeof apiKey !== "string" || !apiKey.trim()) {
      return null;
    }
    return { provider, apiKey };
  } catch {
    return null;
  }
}

function ensureInitialised(): void {
  if (initialised) return;
  initialised = true;
  cached = readStorage();
}

function write(state: ByokState | null): void {
  cached = state;
  try {
    if (state) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or storage disabled: keep the in-memory value for this session.
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  ensureInitialised();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stable snapshot for useSyncExternalStore. */
export function getSnapshot(): ByokState | null {
  ensureInitialised();
  return cached;
}

/** Current BYOK config, or null when the caller should use the hosted path. */
export function getByokConfig(): LLMConfig | null {
  const state = getSnapshot();
  if (!state) return null;
  return { provider: state.provider, apiKey: state.apiKey };
}

export function saveByok(provider: LLMProvider, apiKey: string): void {
  write({ provider, apiKey: apiKey.trim() });
}

export function clearByok(): void {
  write(null);
}

/** React hook mirroring the store. Server snapshot is always null (no storage). */
export function useByok(): ByokState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
