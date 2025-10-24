"use client";

import React from "react";
import type { ResultItem } from "../lib/transcode";
import { humanSize } from "../lib/transcode";

type Props = {
  results: ResultItem[];
};

export default function Outputs({ results }: Props) {
  if (!results || results.length === 0) {
    return (
      <div className="text-sm text-zinc-600 dark:text-zinc-400">
        No results yet. Choose a file and click Transcode.
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {results.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {r.name}
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              {r.label} • {humanSize(r.size)}
            </div>
          </div>
          <a
            href={r.url}
            download={r.name}
            className="shrink-0 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}
