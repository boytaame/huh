"use client";

import { useState } from "react";
import { clearByok, saveByok, useByok } from "@/lib/byok";
import type { LLMProvider } from "@/lib/llm";

const PROVIDERS: { id: LLMProvider; label: string }[] = [
  { id: "gemini", label: "Gemini" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
];

const CONTROL_CLASS =
  "rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 shadow-sm outline-none transition focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:focus:border-neutral-500";

/**
 * Top-right BYOK control. The key is stored only in this browser's
 * localStorage; requests then go straight from the browser to the provider.
 */
export function ByokPanel() {
  const saved = useByok();
  const [provider, setProvider] = useState<LLMProvider>(saved?.provider ?? "gemini");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const save = () => {
    const key = value.trim();
    if (!key) {
      setError("Paste an API key first.");
      return;
    }
    saveByok(provider, key);
    setValue("");
    setError("");
  };

  return (
    <div className="flex items-center gap-1.5">
      {saved ? (
        <>
          <span
            title={`Stored in this browser only. Requests go straight to ${saved.provider}.`}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
          >
            ✓ Your {PROVIDERS.find((p) => p.id === saved.provider)?.label} key
          </span>
          <button
            type="button"
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs font-medium text-neutral-500 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            onClick={() => {
              clearByok();
              setError("");
            }}
          >
            Remove
          </button>
        </>
      ) : (
        <>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as LLMProvider)}
            className={CONTROL_CLASS}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="password"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError("");
            }}
            placeholder="Paste your API key"
            title="Stored only in this browser (localStorage). Requests go straight to the provider; this site's server never sees your key."
            className={`${CONTROL_CLASS} w-40`}
            onKeyDown={(event) => {
              // Keep tldraw's canvas shortcuts from reacting while typing.
              if (event.key === "Escape") return;
              event.stopPropagation();
              if (event.key === "Enter") save();
            }}
            onPointerDown={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            onClick={save}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Use my key
          </button>
          {error && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </span>
          )}
        </>
      )}
    </div>
  );
}
