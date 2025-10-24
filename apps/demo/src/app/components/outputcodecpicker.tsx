"use client";

import type { CodecKey } from "../../lib/transcode";
import { ButtonGroup } from "@/app/components/ui/button-group";
import { Button } from "@/app/components/ui/button";

type Option = {
  key: CodecKey;
  label: string;
  ext: string;
};

type Props = {
  options: Option[];
  selected: CodecKey | null;
  isDisabled?: boolean;
  onSelect: (key: CodecKey) => void;
};

export default function OutputCodecPicker({
  options,
  selected,
  isDisabled = false,
  onSelect,
}: Props) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Output codec
        </h3>
      </div>

      <ButtonGroup orientation="vertical" className="w-full">
        {options.map((c) => {
          const isChecked = selected === c.key;
          return (
            <Button
              key={c.key}
              type="button"
              variant="outline"
              className={`justify-between py-8 ${isChecked ? "border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40" : ""}`}
              aria-pressed={isChecked}
              onClick={() => onSelect(c.key)}
              disabled={isDisabled}
            >
              <div className="flex flex-col text-left">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {c.label}
                </span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  .{c.ext}
                </span>
              </div>
            </Button>
          );
        })}
      </ButtonGroup>
    </div>
  );
}
