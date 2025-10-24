/* Mediabunny helpers, types, selection utilities, and transcode job runner */

import {
  Input,
  Output,
  BufferTarget,
  BlobSource,
  Conversion,
  ALL_FORMATS,
  Mp3OutputFormat,
  OggOutputFormat,
  WebMOutputFormat,
  FlacOutputFormat,
  WavOutputFormat,
  canEncodeAudio,
} from "mediabunny";

import type { ConversionAudioOptions } from "mediabunny";
import { registerMp3Encoder } from "@mediabunny/mp3-encoder";

/* Types */

export type CodecKey = "mp3" | "opus" | "wav";

export type CodecOption = {
  key: CodecKey;

  label: string;

  ext: string;

  mime: string;

  usesBitrate: boolean;

  makeFormat:
    | (() => Mp3OutputFormat)
    | (() => OggOutputFormat)
    | (() => WebMOutputFormat)
    | (() => FlacOutputFormat)
    | (() => WavOutputFormat);

  probeKey?: Exclude<CodecKey, "wav">;
};

export type Job = {
  id: string;

  codecKey: CodecKey;

  bitrateKbps?: number;

  ext: string;

  mime: string;

  label: string;

  makeFormat:
    | (() => Mp3OutputFormat)
    | (() => OggOutputFormat)
    | (() => WebMOutputFormat)
    | (() => FlacOutputFormat)
    | (() => WavOutputFormat);
  /** When true, skip encoding and copy the source file as-is. */
  copySource?: boolean;
};

export type ResultItem = {
  id: string;

  name: string;

  size: number;

  url: string;

  mime: string;

  label: string;
};

export type SupportMap = Record<string, boolean>;

/* Constants */

export const CODECS: CodecOption[] = [
  {
    key: "wav",

    label: "Lossless",

    ext: "wav",

    mime: "audio/wav",

    usesBitrate: false,

    makeFormat: () => new WavOutputFormat(),
  },

  {
    key: "mp3",

    label: "MP3",

    ext: "mp3",

    mime: "audio/mpeg",

    usesBitrate: true,

    makeFormat: () => new Mp3OutputFormat(),

    probeKey: "mp3",
  },

  {
    key: "opus",

    label: "Opus",

    ext: "webm",

    mime: "audio/webm",

    usesBitrate: true,

    makeFormat: () => new WebMOutputFormat(),

    probeKey: "opus",
  },
];

export const BITRATES_KBPS = [16, 24, 32, 48, 64, 96, 128, 160, 192, 256, 320];

/* Selection helpers */

export function selectedCodecOptions(selected: Set<CodecKey>): CodecOption[] {
  const list = CODECS.filter((c) => selected.has(c.key));
  // keep wav first if selected
  return list.sort((a, b) => (a.key === "wav" ? -1 : b.key === "wav" ? 1 : 0));
}

export function computeUnsupported(
  selectedOptions: CodecOption[],

  support?: SupportMap,
): CodecOption[] {
  if (!support) return [];

  return selectedOptions.filter(
    (c) => c.probeKey && support[c.probeKey] === false,
  );
}

export function needsBitrateButNoneSelected(
  selectedOptions: CodecOption[],

  selectedBitrates: Set<number>,
): boolean {
  const anyBitrateCodec = selectedOptions.some((c) => c.usesBitrate);

  return anyBitrateCodec && selectedBitrates.size === 0;
}

export function createJobsFromSelections(
  selectedOptions: CodecOption[],

  selectedBitrates: Set<number>,

  support?: SupportMap,
): Job[] {
  const wavJobs: Job[] = [];
  const lossyJobs: Job[] = [];

  // Separate lossless vs lossy, respecting support
  for (const c of selectedOptions) {
    if (support && c.probeKey && support[c.probeKey] === false) continue;
    if (c.usesBitrate) {
      const sortedBitrates = Array.from(selectedBitrates).sort((a, b) => a - b);
      for (const kbps of sortedBitrates) {
        lossyJobs.push({
          id: `${c.key}-${kbps}`,
          codecKey: c.key,
          bitrateKbps: kbps,
          ext: c.ext,
          mime: c.mime,
          label: `${c.label} — ${kbps} kbps`,
          makeFormat: c.makeFormat,
        });
      }
    } else {
      wavJobs.push({
        id: `${c.key}-lossless`,
        codecKey: c.key,
        ext: c.ext,
        mime: c.mime,
        label: c.label,
        makeFormat: c.makeFormat,
        copySource: true,
      });
    }
  }

  // Sort lossy across codecs by bitrate ascending; stable secondary sort by codec key
  lossyJobs.sort((a, b) => {
    const ak = a.bitrateKbps ?? 0;
    const bk = b.bitrateKbps ?? 0;
    if (ak !== bk) return ak - bk;
    return a.codecKey.localeCompare(b.codecKey);
  });

  // Keep lossless jobs first as before, followed by bitrate-sorted lossy jobs
  return [...wavJobs, ...lossyJobs];
}

/* Environment probing */

export async function probeEncodingSupport(): Promise<SupportMap> {
  const result: SupportMap = {};

  const probeKeys = Array.from(
    new Set(CODECS.map((c) => c.probeKey).filter(Boolean)),
  ) as NonNullable<CodecOption["probeKey"]>[];

  for (const key of probeKeys) {
    try {
      result[key] = await canEncodeAudio(key);
    } catch {
      result[key] = false;
    }
  }

  // Fallback: register WASM MP3 encoder if native unsupported

  if (result.mp3 === false) {
    try {
      registerMp3Encoder();

      result.mp3 = true;
    } catch {
      // keep false on failure
    }
  }

  return result;
}

/* Transcode runner */

export type JobProgressHandler = (jobId: string, progress: number) => void;

function buildAudioConfig(job: Job): ConversionAudioOptions {
  if (job.codecKey === "wav") {
    return {};
  }

  const codec = job.codecKey as "mp3" | "opus";
  return {
    codec,
    bitrate: job.bitrateKbps ? job.bitrateKbps * 1000 : undefined,
  };
}

function baseNameFromFile(file: File | Blob, fallback: string): string {
  const name = (file as File).name;

  if (!name) return fallback;

  return name.replace(/\.[^/.]+$/, "");
}

export async function transcodeFileToJobs(
  file: File | Blob,

  jobs: Job[],

  onProgress?: JobProgressHandler,

  onResult?: (jobId: string, result: ResultItem) => void,

  onError?: (jobId: string, message: string) => void,
): Promise<{ results: ResultItem[]; errors: Record<string, string> }> {
  const results: ResultItem[] = [];

  const errors: Record<string, string> = {};

  for (const job of jobs) {
    try {
      const input = new Input({
        source: new BlobSource(file),

        formats: ALL_FORMATS,
      });

      const target = new BufferTarget();

      const output = new Output({
        format: job.makeFormat(),

        target,
      });

      const conversion = await Conversion.init({
        input,

        output,

        audio: buildAudioConfig(job),
      });

      conversion.onProgress = (p: number) => {
        onProgress?.(job.id, p);
      };

      await conversion.execute();

      const raw = (
        target as unknown as {
          buffer: ArrayBuffer | Uint8Array<ArrayBufferLike>;
        }
      ).buffer;
      const blob = new Blob([raw as ArrayBuffer], { type: job.mime });

      const url = URL.createObjectURL(blob);

      const base = baseNameFromFile(file, "output");

      const name = `${base}.${job.ext}`;

      const resultItem: ResultItem = {
        id: job.id,

        label: job.label,

        name,

        size: blob.size,

        url,

        mime: job.mime,
      };

      results.push(resultItem);
      onResult?.(job.id, resultItem);

      onProgress?.(job.id, 1);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An error occurred during transcoding. Try a different setting.";

      errors[job.id] = message;

      onError?.(job.id, message);
      onProgress?.(job.id, 1); // mark as complete for UI bars
    }
  }

  return { results, errors };
}

/**
 * Run transcodes in parallel with a concurrency limit.
 * Defaults to 2 concurrent jobs to balance CPU usage and responsiveness.
 */
export async function transcodeFileToJobsParallel(
  file: File | Blob,

  jobs: Job[],

  concurrency = 2,

  onProgress?: JobProgressHandler,

  onResult?: (jobId: string, result: ResultItem) => void,

  onError?: (jobId: string, message: string) => void,
  signal?: AbortSignal,
): Promise<{ results: ResultItem[]; errors: Record<string, string> }> {
  const results: ResultItem[] = [];
  const errors: Record<string, string> = {};

  let cursor = 0;

  async function runOne() {
    if (signal?.aborted) return;
    const job = jobs[cursor++];
    if (!job) return;

    try {
      const input = new Input({
        source: new BlobSource(file),
        formats: ALL_FORMATS,
      });

      if (job.copySource) {
        const base = baseNameFromFile(file, "output");
        const name = `${base}.${job.ext}`;
        const blob =
          file instanceof Blob
            ? file
            : new Blob([file as any], { type: job.mime });
        const url = URL.createObjectURL(blob);
        const resultItem: ResultItem = {
          id: job.id,
          label: job.label,
          name,
          size: blob.size,
          url,
          mime: job.mime,
        };
        results.push(resultItem);
        onResult?.(job.id, resultItem);
        onProgress?.(job.id, 1);
        return; // end this worker iteration
      }

      const target = new BufferTarget();
      const output = new Output({
        format: job.makeFormat(),
        target,
      });

      const conversion = await Conversion.init({
        input,
        output,
        audio: buildAudioConfig(job),
      });

      conversion.onProgress = (p: number) => {
        onProgress?.(job.id, p);
      };

      if (signal?.aborted) return;
      await conversion.execute();

      const raw = (
        target as unknown as {
          buffer: ArrayBuffer | Uint8Array<ArrayBufferLike>;
        }
      ).buffer;
      const blob = new Blob([raw as ArrayBuffer], { type: job.mime });
      const url = URL.createObjectURL(blob);

      const base = baseNameFromFile(file, "output");
      const name = `${base}.${job.ext}`;

      const resultItem: ResultItem = {
        id: job.id,
        label: job.label,
        name,
        size: blob.size,
        url,
        mime: job.mime,
      };

      results.push(resultItem);
      onResult?.(job.id, resultItem);
      onProgress?.(job.id, 1);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An error occurred during transcoding. Try a different setting.";
      errors[job.id] = message;
      onError?.(job.id, message);
      onProgress?.(job.id, 1);
    } finally {
      // Start next job in chain until queue is empty
      if (cursor < jobs.length && !signal?.aborted) {
        await runOne();
      }
    }
  }

  const workers = Math.max(1, Math.min(concurrency, jobs.length));
  const promises: Promise<void>[] = [];
  for (let i = 0; i < workers; i++) {
    promises.push(runOne());
  }
  await Promise.all(promises);

  return { results, errors };
}

/**
 * Worker-backed parallel transcode with concurrency cap.
 * Falls back to in-thread when Worker fails to instantiate.
 */
export async function transcodeFileToJobsInWorkers(
  file: File | Blob,

  jobs: Job[],

  concurrency = 2,

  onProgress?: JobProgressHandler,

  onResult?: (jobId: string, result: ResultItem) => void,

  onError?: (jobId: string, message: string) => void,
  signal?: AbortSignal,
): Promise<{ results: ResultItem[]; errors: Record<string, string> }> {
  try {
    const workers: Worker[] = [];
    const results: ResultItem[] = [];
    const errors: Record<string, string> = {};

    let cursor = 0;
    const pending: Promise<void>[] = [];
    let aborted = false;

    const handleAbort = () => {
      if (aborted) return;
      aborted = true;
      for (const w of workers) {
        try { w.terminate(); } catch {}
      }
    };
    if (signal) {
      if (signal.aborted) handleAbort();
      else signal.addEventListener("abort", handleAbort, { once: true });
    }

    const startWorker = (): Promise<void> =>
      new Promise((resolve) => {
        if (aborted) return resolve();
        const job = jobs[cursor++];
        if (!job) return resolve();
        const url = new URL("./transcoder.worker.ts", import.meta.url);
        const worker = new Worker(url, { type: "module" });
        workers.push(worker);

        worker.onmessage = (e: MessageEvent) => {
          const msg = e.data as any;
          if (msg?.type === "progress") onProgress?.(msg.jobId, msg.progress);
          else if (msg?.type === "result") onResult?.(msg.jobId, msg.result);
          else if (msg?.type === "error") {
            errors[msg.jobId] = msg.message;
            onError?.(msg.jobId, msg.message);
          } else if (msg?.type === "done") {
            // chain next job on this worker
            if (aborted) { try { worker.terminate(); } catch {}; return resolve(); }
            const next = jobs[cursor++];
            if (next) worker.postMessage({ type: "run", file, job: next });
            else { worker.terminate(); resolve(); }
          }
        };

        if (aborted) { try { worker.terminate(); } catch {}; return resolve(); }
        worker.postMessage({ type: "run", file, job });
      });

    const workersToStart = Math.max(1, Math.min(concurrency, jobs.length));
    for (let i = 0; i < workersToStart; i++) pending.push(startWorker());
    await Promise.all(pending);
    return { results, errors };
  } catch {
    // Fallback to same-thread parallel helper
    return transcodeFileToJobsParallel(
      file,
      jobs,
      concurrency,
      onProgress,
      onResult,
      onError,
      signal,
    );
  }
}

/* Utilities */

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];

  let i = -1;

  let val = bytes;

  do {
    val = val / 1024;

    i++;
  } while (val >= 1024 && i < units.length - 1);

  return `${val.toFixed(val >= 10 ? 0 : 1)} ${units[i]}`;
}

export function revokeResults(results: Pick<ResultItem, "url">[]) {
  for (const r of results) {
    try {
      URL.revokeObjectURL(r.url);
    } catch {
      // ignore
    }
  }
}
