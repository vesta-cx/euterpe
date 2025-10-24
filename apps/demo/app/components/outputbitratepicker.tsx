"use client";

import { ButtonGroup } from "../../components/ui/button-group";
import { Button } from "../../components/ui/button";

type Props = {
  bitrates: number[];
  selected: number | null;
  hidden?: boolean;
  isDisabled?: boolean;
  onSelect: (kbps: number) => void;
};

export default function OutputBitratePicker({
  bitrates,
  selected,
  hidden = false,
  isDisabled = false,
  onSelect,
}: Props) {
  if (hidden) return null;

  const has = (v: number) => bitrates.includes(v);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Output bitrate (kbps)
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Low */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Low
          </div>
          <ButtonGroup orientation="vertical" className="w-full">
            {[16, 24, 32].filter(has).map((kbps) => {
              const isChecked = selected === kbps;
              return (
                <Button
                  key={kbps}
                  type="button"
                  variant="outline"
                  className={`justify-between ${isChecked ? "border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40" : ""}`}
                  aria-pressed={isChecked}
                  onClick={() => onSelect(kbps)}
                  disabled={isDisabled}
                >
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">
                    {kbps}
                  </span>
                </Button>
              );
            })}
          </ButtonGroup>
        </div>

        {/* Medium */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Medium
          </div>
          <ButtonGroup orientation="vertical" className="w-full">
            {[48, 64, 96].filter(has).map((kbps) => {
              const isChecked = selected === kbps;
              return (
                <Button
                  key={kbps}
                  type="button"
                  variant="outline"
                  className={`justify-between ${isChecked ? "border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40" : ""}`}
                  aria-pressed={isChecked}
                  onClick={() => onSelect(kbps)}
                  disabled={isDisabled}
                >
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">
                    {kbps}
                  </span>
                </Button>
              );
            })}
          </ButtonGroup>
        </div>

        {/* High */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            High
          </div>
          <ButtonGroup orientation="vertical" className="w-full">
            {[128, 160, 192].filter(has).map((kbps) => {
              const isChecked = selected === kbps;
              return (
                <Button
                  key={kbps}
                  type="button"
                  variant="outline"
                  className={`justify-between ${isChecked ? "border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40" : ""}`}
                  aria-pressed={isChecked}
                  onClick={() => onSelect(kbps)}
                  disabled={isDisabled}
                >
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">
                    {kbps}
                  </span>
                </Button>
              );
            })}
          </ButtonGroup>
        </div>

        {/* Very high */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Very high
          </div>
          <ButtonGroup orientation="vertical" className="w-full">
            {[256, 320].filter(has).map((kbps) => {
              const isChecked = selected === kbps;
              return (
                <Button
                  key={kbps}
                  type="button"
                  variant="outline"
                  className={`justify-between ${isChecked ? "border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40" : ""}`}
                  aria-pressed={isChecked}
                  onClick={() => onSelect(kbps)}
                  disabled={isDisabled}
                >
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">
                    {kbps}
                  </span>
                </Button>
              );
            })}
          </ButtonGroup>
        </div>
      </div>
    </div>
  );
}
