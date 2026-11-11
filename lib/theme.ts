"use client";

import { useSyncExternalStore } from "react";

/**
 * Theme preference (spec-addendum-4 E5).
 *
 * The stored value is a preference (`system` by default), never a resolved
 * colour. "system" resolves live from `prefers-color-scheme`, and the result is
 * applied as a `dark` class on `<html>` before first paint by the inline boot
 * script in `app/layout.tsx`. tldraw is told the same preference separately.
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "huh.theme";
export const THEME_EVENT = "huh:theme";

const listeners = new Set<() => void>();
let cached: ThemePreference | null = null;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function readStorage(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    // Private mode / storage blocked: follow the OS for this session.
    return "system";
  }
}

function ensureInitialised(): void {
  if (cached !== null) return;
  cached = readStorage();
}

function prefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") return prefersDark() ? "dark" : "light";
  return pref;
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  // Tells the browser how to paint native widgets (scrollbars, form controls).
  root.style.colorScheme = theme;
}

export function applyThemePreference(pref: ThemePreference): void {
  applyResolvedTheme(resolveTheme(pref));
}

/** Stable snapshot for useSyncExternalStore. */
export function getThemeSnapshot(): ThemePreference {
  ensureInitialised();
  return cached ?? "system";
}

export function subscribeTheme(listener: () => void): () => void {
  ensureInitialised();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setThemePreference(pref: ThemePreference): void {
  cached = pref;
  try {
    window.localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked: the choice still applies to this session.
  }
  applyThemePreference(pref);
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    () => "system" as ThemePreference,
  );
}

/** Follow the OS live while the preference is "system". */
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getThemeSnapshot() === "system") {
      applyThemePreference("system");
      listeners.forEach((listener) => listener());
    }
  };
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", onChange);
  } else {
    // Safari < 14.
    (media as unknown as { addListener?: (cb: () => void) => void }).addListener?.(
      onChange,
    );
  }
}
