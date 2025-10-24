"use client";

import { persistentAtom } from "@nanostores/persistent";
import type { CodecKey } from "../../lib/transcode";

export const selectedCodecsStore = persistentAtom<string>(
  "selectedCodecs",
  JSON.stringify(["mp3", "opus"]),
);

export const selectedBitratesStore = persistentAtom<string>(
  "selectedBitrates",
  JSON.stringify([96, 128, 160]),
);
