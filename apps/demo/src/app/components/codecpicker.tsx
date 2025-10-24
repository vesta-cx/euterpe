"use client";

import { useMemo, useState, useEffect } from "react";
import type { CodecKey, CodecOption, SupportMap } from "../../lib/transcode";

type Props = {
  options: CodecOption[];
  selected: Set<CodecKey>;
  support: SupportMap;
  isProbing: boolean;
  isTranscoding: boolean;
  onToggle: (key: CodecKey) => void;
  onSelectAll: () => void;
  onClear: () => void;
};

export default function CodecPicker({
  options,
  selected,
  support,
  isProbing,
  isTranscoding,
  onToggle,
  onSelectAll,
  onClear,
}: Props) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const unsupportedSelected = useMemo(() => {
    if (isProbing) return [] as CodecOption[];
    return options.filter(
      (c) => selected.has(c.key) && c.probeKey && support[c.probeKey] === false,
    );
  }, [options, selected, support, isProbing]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Codecs
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={isTranscoding}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            All
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={isTranscoding}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            None
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {options.map((c) => {
          const isChecked = selected.has(c.key);
          const isUnsupported =
            !isProbing && c.probeKey ? support[c.probeKey] === false : false;
          const isDisabled = isTranscoding;

          return (
            <label
              key={c.key}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 ${
                isChecked
                  ? "border-zinc-400 dark:border-zinc-600"
                  : "border-zinc-200 dark:border-zinc-800"
              } ${
                isUnsupported
                  ? "opacity-60"
                  : isChecked
                    ? "bg-zinc-50 dark:bg-zinc-800/40"
                    : "bg-white dark:bg-zinc-900"
              } ${isDisabled ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isChecked}
                  disabled={isTranscoding}
                  onChange={() => onToggle(c.key)}
                />
                <div className="flex flex-col">
                  <span
                    className={`text-sm font-medium text-zinc-900 dark:text-zinc-100 ${hydrated ? (!isChecked ? "opacity-80" : "") : ""}`}
                  >
                    {c.label}
                  </span>
                  <span
                    className={`text-xs text-zinc-600 dark:text-zinc-400 ${hydrated ? (!isChecked ? "opacity-80" : "") : ""}`}
                  >
                    .{c.ext}
                  </span>
                </div>
              </div>
              {isUnsupported && (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  Unsupported
                </span>
              )}
            </label>
          );
        })}
      </div>

      {unsupportedSelected.length > 0 && (
        <div className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          Some selected codecs are unsupported in this browser and will be
          skipped: {unsupportedSelected.map((c) => c.label).join(", ")}.
        </div>
      )}
    </div>
  );
}
