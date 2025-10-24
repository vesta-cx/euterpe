"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ResultItem } from "../lib/transcode";
import { CODECS } from "../lib/transcode";
import type { CodecKey } from "../lib/transcode";
import OutputCodecPicker from "./outputcodecpicker";
import OutputBitratePicker from "./outputbitratepicker";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Slider } from "../../components/ui/slider";
import { PauseIcon, PlayIcon, Volume2Icon } from "lucide-react";

type Props = {
    results: ResultItem[];
};

function parseId(id: string): { codec: CodecKey; bitrate: number | null } | null {
    const idx = id.lastIndexOf("-");
    if (idx <= 0) return null;
    const codec = id.slice(0, idx) as CodecKey;
    const tail = id.slice(idx + 1);
    if (tail === "lossless") return { codec, bitrate: null };
    const kbps = Number(tail);
    if (Number.isFinite(kbps)) return { codec, bitrate: kbps };
    return null;
}

export default function ABTesting({ results }: Props) {
    const playable = useMemo(() => results.filter((r) => r.mime.startsWith("audio/")), [results]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);

    // Web Audio API graph
    const ctxRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const currentSourceGainRef = useRef<GainNode | null>(null);
    const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());

    // Playback timeline management
    const startTimeRef = useRef(0); // context time when current play started
    const startOffsetRef = useRef(0); // seconds into buffer where play started
    const rafRef = useRef<number | null>(null);

    function resetAudioGraph() {
        try {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        } catch {}
        rafRef.current = null;
        try {
            const src = currentSourceRef.current;
            if (src) {
                try {
                    src.onended = null;
                } catch {}
                try {
                    src.stop();
                } catch {}
            }
        } catch {}
        try {
            currentSourceRef.current?.disconnect();
        } catch {}
        try {
            currentSourceGainRef.current?.disconnect();
        } catch {}
        currentSourceRef.current = null;
        currentSourceGainRef.current = null;
        try {
            masterGainRef.current?.disconnect();
        } catch {}
        try {
            ctxRef.current?.close();
        } catch {}
        ctxRef.current = null;
        masterGainRef.current = null;
        try {
            buffersRef.current.clear();
        } catch {}
        startTimeRef.current = 0;
        startOffsetRef.current = 0;
        setIsPlaying(false);
        setTime(0);
        setDuration(0);
    }

    // Build available map of codec -> {bitrates, items}
    const available = useMemo(() => {
        const byCodec = new Map<CodecKey, { bitrates: Set<number>; items: ResultItem[] }>();
        for (const r of playable) {
            const p = parseId(r.id);
            if (!p) continue;
            if (!byCodec.has(p.codec)) byCodec.set(p.codec, { bitrates: new Set<number>(), items: [] });
            const entry = byCodec.get(p.codec)!;
            if (p.bitrate != null) entry.bitrates.add(p.bitrate);
            entry.items.push(r);
        }
        return byCodec;
    }, [playable]);

    const codecOptions = useMemo(() => {
        const opts: { key: CodecKey; label: string; ext: string }[] = [];
        for (const c of CODECS) {
            if (available.has(c.key)) opts.push({ key: c.key, label: c.label, ext: c.ext });
        }
        return opts;
    }, [available]);

    const [selectedCodec, setSelectedCodec] = useState<CodecKey | null>(null);
    const [selectedBitrate, setSelectedBitrate] = useState<number | null>(null);
    const lastBitrateByCodecRef = useRef<Map<CodecKey, number>>(new Map());

    // Initialize selection when results change
    useEffect(() => {
        if (codecOptions.length === 0) {
            setSelectedCodec(null);
            setSelectedBitrate(null);
            return;
        }
        setSelectedCodec((prev) => (prev && available.has(prev) ? prev : codecOptions[0].key));
    }, [codecOptions, available]);

    // Keep bitrate aligned with selected codec, remembering prior choice for each codec
    useEffect(() => {
        if (!selectedCodec) return;
        const entry = available.get(selectedCodec);
        if (!entry) return;
        const codecUsesBitrate = CODECS.find((c) => c.key === selectedCodec)?.usesBitrate ?? false;
        if (!codecUsesBitrate) return; // do not modify bitrate for lossless selections
        if (selectedBitrate != null && entry.bitrates.has(selectedBitrate)) return;
        const remembered = lastBitrateByCodecRef.current.get(selectedCodec);
        if (remembered != null && entry.bitrates.has(remembered)) {
            setSelectedBitrate(remembered);
            return;
        }
        const first = Array.from(entry.bitrates).sort((a, b) => a - b)[0];
        setSelectedBitrate(first ?? null);
    }, [selectedCodec, available, selectedBitrate]);

    const usesBitrate = useMemo(() => {
        return selectedCodec ? (CODECS.find((c) => c.key === selectedCodec)?.usesBitrate ?? false) : false;
    }, [selectedCodec]);

    // Remember last bitrate when switching away from a lossy codec
    useEffect(() => {
        if (!selectedCodec) return;
        const lossy = CODECS.find((c) => c.key === selectedCodec)?.usesBitrate ?? false;
        if (lossy && selectedBitrate != null) {
            lastBitrateByCodecRef.current.set(selectedCodec, selectedBitrate);
        }
    }, [selectedCodec, selectedBitrate]);

    const bitratesForSelected = useMemo(() => {
        if (!selectedCodec) return [] as number[];
        const entry = available.get(selectedCodec);
        if (!entry) return [] as number[];
        return Array.from(entry.bitrates).sort((a, b) => a - b);
    }, [available, selectedCodec]);

    function selectedResult(): ResultItem | null {
        if (!selectedCodec) return null;
        const entry = available.get(selectedCodec);
        if (!entry) return null;
        if (!usesBitrate) return entry.items.find((r) => parseId(r.id)?.bitrate == null) ?? null;
        if (selectedBitrate == null) return null;
        return entry.items.find((r) => parseId(r.id)?.bitrate === selectedBitrate) ?? null;
    }

    function ensureContext(): AudioContext | null {
        if (typeof window === "undefined") return null;
        if (!ctxRef.current) {
            const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!AC) return null;
            const ctx: AudioContext = new AC();
            const gain = ctx.createGain();
            gain.gain.value = uiToGain(volume);
            gain.connect(ctx.destination);
            ctxRef.current = ctx;
            masterGainRef.current = gain;
        }
        return ctxRef.current;
    }

    function uiToGain(ui: number): number {
        const clamped = Math.min(1, Math.max(0, ui));
        if (clamped <= 0) return 0;
        const minDb = -60; // from mute to 0 dB
        const db = minDb + (0 - minDb) * clamped;
        return Math.pow(10, db / 20);
    }

    async function loadBufferFor(id: string, url: string): Promise<AudioBuffer | null> {
        const ctx = ensureContext();
        if (!ctx) return null;
        // Use in-memory prepared buffer if available
        const existing = (buffersRef as any)?.current as Map<string, AudioBuffer> | undefined;
        if (existing && existing.has(id)) return existing.get(id)!;
        try {
            const res = await fetch(url);
            const ab = await res.arrayBuffer();
            const buf: AudioBuffer = await ctx.decodeAudioData(ab.slice(0));
            try {
                existing?.set(id, buf);
            } catch {}
            return buf;
        } catch {
            return null;
        }
    }

    function scheduleEqualPowerCrossfade(
        oldGain: GainNode | null,
        newGain: GainNode,
        startTime: number,
        duration: number,
    ) {
        const ctx = ctxRef.current;
        if (!ctx) return;
        const steps = 256;
        const inCurve = new Float32Array(steps);
        const outCurve = new Float32Array(steps);
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            inCurve[i] = Math.sin((t * Math.PI) / 2);
            outCurve[i] = Math.cos((t * Math.PI) / 2);
        }
        const dur = Math.max(0.005, duration);
        // New fades in (0->1 equal-power)
        try {
            newGain.gain.cancelScheduledValues(startTime);
            newGain.gain.setValueAtTime(0, startTime);
            newGain.gain.setValueCurveAtTime(inCurve, startTime, dur);
        } catch {}
        // Old fades out (1->0 equal-power)
        if (oldGain) {
            try {
                oldGain.gain.cancelScheduledValues(startTime);
                oldGain.gain.setValueAtTime(oldGain.gain.value, startTime);
                oldGain.gain.setValueCurveAtTime(outCurve, startTime, dur);
            } catch {}
        }
    }

    function getCurrentPosition(ctx: AudioContext): number {
        if (!isPlaying) return startOffsetRef.current;
        const pos = startOffsetRef.current + (ctx.currentTime - startTimeRef.current);
        return Math.max(0, pos);
    }

    function stopCurrentWithFade(fadeSec: number) {
        const ctx = ctxRef.current;
        if (!ctx) return;
        const src = currentSourceRef.current;
        const g = currentSourceGainRef.current;
        if (!src || !g) return;
        const now = ctx.currentTime;
        const currentVal = g.gain.value;
        g.gain.setValueAtTime(currentVal, now);
        g.gain.linearRampToValueAtTime(0, now + fadeSec);
        try {
            src.stop(now + fadeSec);
        } catch {}
        currentSourceRef.current = null;
        currentSourceGainRef.current = null;
    }

    async function startSelectedAt(offsetSec: number) {
        const sel = selected;
        const ctx = ensureContext();
        const destGain = masterGainRef.current;
        if (!sel || !ctx || !destGain) return;
        // Establish a timeline baseline now so rAF keeps advancing even while decoding
        const baselineNow = ctx.currentTime;
        const baselineOffset = Math.max(0, offsetSec);
        startTimeRef.current = baselineNow;
        startOffsetRef.current = baselineOffset;

        // Begin crossfade out of old source immediately
        const fade = 0.04; // 40ms
        const oldSrc = currentSourceRef.current;
        const oldGain = currentSourceGainRef.current;
        if (oldGain && oldSrc) {
            // prevent stale onended from flipping state
            try {
                oldSrc.onended = null;
            } catch {}
            // Outgoing part of crossfade scheduled below together with incoming
            try {
                oldSrc.stop(baselineNow + fade + 0.005);
            } catch {}
        }

        // Load/ensure buffer; compensate for time elapsed during decode
        const buf = await loadBufferFor(sel.id, sel.url);
        if (!buf) return;
        const now = ctx.currentTime;
        const elapsed = now - baselineNow;
        const alignedStart = Math.min(Math.max(0, baselineOffset + elapsed), buf.duration);

        // Prepare new source and fade in
        const newSrc = ctx.createBufferSource();
        newSrc.buffer = buf;
        const newGain = ctx.createGain();
        newGain.gain.setValueAtTime(0, now);
        newSrc.connect(newGain);
        newGain.connect(destGain);
        // Equal-power crossfade for pop-free seamless switch
        scheduleEqualPowerCrossfade(oldGain ?? null, newGain, now, fade);
        try {
            newSrc.start(now, alignedStart);
        } catch {}

        currentSourceRef.current = newSrc;
        currentSourceGainRef.current = newGain;
        // Keep the same baseline timeline (startTimeRef/startOffsetRef were set earlier)
        setIsPlaying(true);

        // Update duration from buffer
        setDuration(Number.isFinite(buf.duration) ? buf.duration : 0);

        newSrc.onended = () => {
            // only update if this source is still current
            if (currentSourceRef.current === newSrc) setIsPlaying(false);
        };
    }

    useEffect(() => {
        const ctx = ensureContext();
        const gain = masterGainRef.current;
        if (!ctx || !gain) return;
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(uiToGain(volume), now);
    }, [volume]);

    const selected = selectedResult();

    // Keep duration in sync with selected buffer; preload when selection changes
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!selected) {
                setDuration(0);
                return;
            }
            const buf = await loadBufferFor(selected.id, selected.url);
            if (cancelled) return;
            if (buf) setDuration(Number.isFinite(buf.duration) ? buf.duration : 0);
        })();
        return () => {
            cancelled = true;
        };
    }, [selected?.id]);

    // Update current time via rAF while playing
    useEffect(() => {
        const ctx = ctxRef.current;
        if (!ctx) return;
        const tick = () => {
            const d = duration || 0;
            const pos = Math.min(d, getCurrentPosition(ctx));
            setTime(pos);
            if (isPlaying) rafRef.current = requestAnimationFrame(tick);
        };
        if (isPlaying) {
            rafRef.current = requestAnimationFrame(tick);
            return () => {
                if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            };
        }
    }, [isPlaying, duration]);

    // Reset audio graph when playable outputs are cleared (e.g., on new input selection)
    useEffect(() => {
        if (playable.length === 0) {
            resetAudioGraph();
        }
    }, [playable.length]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            resetAudioGraph();
        };
    }, []);

    const onSeek = (val: number[]) => {
        const t = Math.max(0, val[0] ?? 0);
        const ctx = ensureContext();
        if (!ctx) {
            setTime(t);
            return;
        }
        if (isPlaying) {
            // Restart selected at new offset seamlessly
            startSelectedAt(t);
        } else {
            startOffsetRef.current = Math.min(t, duration || t);
            setTime(startOffsetRef.current);
        }
    };

    const toggle = async () => {
        const ctx = ensureContext();
        if (!ctx) return;
        if (!selected) return;
        // ensure audio context is running
        try {
            await ctx.resume();
        } catch {}
        if (isPlaying) {
            // Pause: store position and stop with tiny fade
            const pos = getCurrentPosition(ctx);
            startOffsetRef.current = pos;
            stopCurrentWithFade(0.03);
            setIsPlaying(false);
        } else {
            await startSelectedAt(startOffsetRef.current);
        }
    };

    // Seamless switch when selection changes while playing
    useEffect(() => {
        if (!isPlaying) return;
        const ctx = ctxRef.current;
        if (!ctx) return;
        const pos = getCurrentPosition(ctx);
        startSelectedAt(pos);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.id]);

  // Prepare (decode) all playable sources as soon as they are available.
  // Decoding is done in small batches to avoid saturating the main thread.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (playable.length === 0) return;
      const batchSize = 3;
      const items = playable.slice();
      while (items.length && !cancelled) {
        const batch = items.splice(0, batchSize);
        await Promise.all(
          batch.map(async (p) => {
            try {
              await loadBufferFor(p.id, p.url);
            } catch {}
          }),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playable]);

    // Removed decoded-audio preloading and caching

    if (playable.length === 0 || codecOptions.length === 0) return null;

    return (
        <div>
            <div className="mb-3">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">A/B testing</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <OutputCodecPicker options={codecOptions} selected={selectedCodec} onSelect={setSelectedCodec} />
                    <OutputBitratePicker
                        bitrates={bitratesForSelected}
                        selected={selectedBitrate}
                        hidden={!usesBitrate}
                        onSelect={(v) => {
                            setSelectedBitrate(v);
                            if (selectedCodec != null && v != null) {
                                lastBitrateByCodecRef.current.set(selectedCodec, v);
                            }
                        }}
                    />
                </div>
            </div>

            <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={toggle} aria-label={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </Button>

                <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 w-28">
                    <span className="tabular-nums">{Math.floor(time).toString().padStart(2, "0")}s</span>
                    <span>/</span>
                    <span className="tabular-nums">{Math.floor(duration).toString().padStart(2, "0")}s</span>
                </div>

                <div className="flex-1">
                    <Slider
                        value={[Math.min(time, duration || 0)]}
                        max={duration || 0}
                        step={0.01}
                        onValueChange={onSeek}
                    />
                </div>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" aria-label="Volume">
                            <Volume2Icon />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="center" className="w-auto p-3">
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400">Volume</span>
                            <Slider
                                orientation="vertical"
                                className="h-40"
                                value={[volume]}
                                max={1}
                                min={0}
                                step={0.01}
                                onValueChange={(v) => setVolume(v[0] ?? 1)}
                            />
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {/* Web Audio API: no <audio> element needed */}
        </div>
    );
}
