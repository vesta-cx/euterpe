"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  bitrates: number[];
  selected: Set<number>;
  isTranscoding: boolean;
  onToggle: (kbps: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  note?: string;
  needsBitrateButNoneSelected?: boolean;
};

export default function BitratePicker({
  bitrates,
  selected,
  isTranscoding,
  onToggle,
  onSelectAll,
  onClear,
  note = "Applies to codecs that use bitrate (MP3, Ogg Vorbis, WebM Opus). Ignored for FLAC and WAV.",
  needsBitrateButNoneSelected = false,
}: Props) {
  const low = [16, 24, 32];
  const medium = [48, 64, 96];
  const high = [128, 160, 192];
  const veryHigh = [256, 320];

  function groupAllSelected(group: number[]) {
    return group.every((v) => selected.has(v));
  }
  function groupNoneSelected(group: number[]) {
    return group.every((v) => !selected.has(v));
  }
  function groupPartial(group: number[]) {
    return !groupNoneSelected(group) && !groupAllSelected(group);
  }

  const lowRef = useRef<HTMLInputElement | null>(null);
  const mediumRef = useRef<HTMLInputElement | null>(null);
  const highRef = useRef<HTMLInputElement | null>(null);
  const veryHighRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (lowRef.current) lowRef.current.indeterminate = groupPartial(low);
    if (mediumRef.current)
      mediumRef.current.indeterminate = groupPartial(medium);
    if (highRef.current) highRef.current.indeterminate = groupPartial(high);
    if (veryHighRef.current)
      veryHighRef.current.indeterminate = groupPartial(veryHigh);
  }, [selected]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Bitrates (kbps)
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

      {/* Grouped by perceived quality with header checkbox to toggle group */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Low */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input
              ref={lowRef}
              type="checkbox"
              className="h-3.5 w-3.5 accent-black dark:accent-white"
              checked={groupAllSelected(low)}
              disabled={isTranscoding}
              onChange={() => {
                const all = groupAllSelected(low);
                low.forEach((kbps) => {
                  const has = selected.has(kbps);
                  if (all && has) onToggle(kbps);
                  if (!all && !has) onToggle(kbps);
                });
              }}
            />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Low
            </span>
          </label>
          {low.map((kbps) => {
            const isChecked = selected.has(kbps);
            return (
              <label
                key={kbps}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 ${
                  isChecked
                    ? "border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isChecked}
                    disabled={isTranscoding}
                    onChange={() => onToggle(kbps)}
                  />
                  <span
                    className={`text-sm text-zinc-900 dark:text-zinc-100 ${hydrated ? (!isChecked ? "opacity-80" : "") : ""}`}
                  >
                    {kbps}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        {/* Medium */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input
              ref={mediumRef}
              type="checkbox"
              className="h-3.5 w-3.5 accent-black dark:accent-white"
              checked={groupAllSelected(medium)}
              disabled={isTranscoding}
              onChange={() => {
                const all = groupAllSelected(medium);
                medium.forEach((kbps) => {
                  const has = selected.has(kbps);
                  if (all && has) onToggle(kbps);
                  if (!all && !has) onToggle(kbps);
                });
              }}
            />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Medium
            </span>
          </label>
          {medium.map((kbps) => {
            const isChecked = selected.has(kbps);
            return (
              <label
                key={kbps}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 ${
                  isChecked
                    ? "border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isChecked}
                    disabled={isTranscoding}
                    onChange={() => onToggle(kbps)}
                  />
                  <span
                    className={`text-sm text-zinc-900 dark:text-zinc-100 ${!isChecked ? "opacity-80" : ""}`}
                  >
                    {kbps}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        {/* High */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input
              ref={highRef}
              type="checkbox"
              className="h-3.5 w-3.5 accent-black dark:accent-white"
              checked={groupAllSelected(high)}
              disabled={isTranscoding}
              onChange={() => {
                const all = groupAllSelected(high);
                high.forEach((kbps) => {
                  const has = selected.has(kbps);
                  if (all && has) onToggle(kbps);
                  if (!all && !has) onToggle(kbps);
                });
              }}
            />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              High
            </span>
          </label>
          {high.map((kbps) => {
            const isChecked = selected.has(kbps);
            return (
              <label
                key={kbps}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 ${
                  isChecked
                    ? "border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isChecked}
                    disabled={isTranscoding}
                    onChange={() => onToggle(kbps)}
                  />
                  <span
                    className={`text-sm text-zinc-900 dark:text-zinc-100 ${!isChecked ? "opacity-80" : ""}`}
                  >
                    {kbps}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        {/* Very high */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input
              ref={veryHighRef}
              type="checkbox"
              className="h-3.5 w-3.5 accent-black dark:accent-white"
              checked={groupAllSelected(veryHigh)}
              disabled={isTranscoding}
              onChange={() => {
                const all = groupAllSelected(veryHigh);
                veryHigh.forEach((kbps) => {
                  const has = selected.has(kbps);
                  if (all && has) onToggle(kbps);
                  if (!all && !has) onToggle(kbps);
                });
              }}
            />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Very high
            </span>
          </label>
          {veryHigh.map((kbps) => {
            const isChecked = selected.has(kbps);
            return (
              <label
                key={kbps}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 ${
                  isChecked
                    ? "border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isChecked}
                    disabled={isTranscoding}
                    onChange={() => onToggle(kbps)}
                  />
                  <span
                    className={`text-sm text-zinc-900 dark:text-zinc-100 ${!isChecked ? "opacity-80" : ""}`}
                  >
                    {kbps}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {note && (
        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">{note}</p>
      )}

      {needsBitrateButNoneSelected && (
        <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Select at least one bitrate for the chosen codec(s).
        </div>
      )}
    </div>
  );
}
