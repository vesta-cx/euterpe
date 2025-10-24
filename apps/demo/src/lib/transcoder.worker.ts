// Worker that runs a single transcode job and reports progress and results

import {
  Input,
  Output,
  BufferTarget,
  BlobSource,
  Conversion,
  ALL_FORMATS,
  Mp3OutputFormat,
  WebMOutputFormat,
  WavOutputFormat,
} from "mediabunny";

type CodecKey = "mp3" | "opus" | "wav";

type Job = {
  id: string;
  codecKey: CodecKey;
  bitrateKbps?: number;
  ext: string;
  mime: string;
  label: string;
  copySource?: boolean;
};

type RunMessage = {
  type: "run";
  file: File | Blob;
  job: Job;
};

function buildAudioConfig(job: Job) {
  if (job.codecKey === "wav") return {} as Record<string, unknown>;
  const codec = job.codecKey as "mp3" | "opus";
  return {
    codec,
    bitrate: job.bitrateKbps ? job.bitrateKbps * 1000 : undefined,
  } as Record<string, unknown>;
}

self.onmessage = async (e: MessageEvent<RunMessage>) => {
  const data = e.data;
  if (!data || data.type !== "run") return;
  const { file, job } = data;

  try {
    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });
    if (job.copySource) {
      const url = URL.createObjectURL(file);
      (self as unknown as Worker).postMessage({
        type: "result",
        jobId: job.id,
        result: {
          id: job.id,
          label: job.label,
          name: `output.${job.ext}`,
          size: (file as Blob).size,
          url,
          mime: job.mime,
        },
      });
      (self as unknown as Worker).postMessage({ type: "done", jobId: job.id });
      return;
    }
    const target = new BufferTarget();
    const output = new Output({
      format:
        job.codecKey === "mp3"
          ? new Mp3OutputFormat()
          : job.codecKey === "opus"
            ? new WebMOutputFormat()
            : new WavOutputFormat(),
      target,
    });

    const conversion = await Conversion.init({
      input,
      output,
      audio: buildAudioConfig(job),
    });
    conversion.onProgress = (p: number) => {
      // stream progress up
      (self as unknown as Worker).postMessage({
        type: "progress",
        jobId: job.id,
        progress: p,
      });
    };

    await conversion.execute();

    const raw = (
      target as unknown as { buffer: ArrayBuffer | Uint8Array<ArrayBufferLike> }
    ).buffer;
    const blob = new Blob([raw as ArrayBuffer], { type: job.mime });
    const url = URL.createObjectURL(blob);

    (self as unknown as Worker).postMessage({
      type: "result",
      jobId: job.id,
      result: {
        id: job.id,
        label: job.label,
        name: `output.${job.ext}`,
        size: blob.size,
        url,
        mime: job.mime,
      },
    });
    (self as unknown as Worker).postMessage({ type: "done", jobId: job.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transcode failed";
    (self as unknown as Worker).postMessage({
      type: "error",
      jobId: job.id,
      message,
    });
    (self as unknown as Worker).postMessage({ type: "done", jobId: job.id });
  }
};
