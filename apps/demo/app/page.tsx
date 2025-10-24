"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useStore } from "@nanostores/react";
import { ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { Button } from "../components/ui/button";
import { Toaster } from "../components/ui/sonner";
import ABTesting from "./components/abtesting";
import BitratePicker from "./components/bitratepicker";
import CodecPicker from "./components/codecpicker";
import Outputs from "./components/outputs";
import {
    BITRATES_KBPS,
    CODECS,
    CodecKey,
    Job,
    ResultItem,
    needsBitrateButNoneSelected as checkNeedsBitrate,
    createJobsFromSelections,
    selectedCodecOptions as getSelectedCodecOptions,
    humanSize,
    probeEncodingSupport,
    revokeResults,
    transcodeFileToJobsInWorkers,
} from "./lib/transcode";
import { selectedBitratesStore, selectedCodecsStore } from "./stores/selections";

export default function Home() {
    const [file, setFile] = useState<File | null>(null);
    const [theme, setTheme] = useState<"light" | "dark">("light");
    const codecsJson = useStore(selectedCodecsStore);
    const bitratesJson = useStore(selectedBitratesStore);
    const [stage, setStage] = useState<"configure" | "run">("configure");

    // Selections
    const [selectedCodecs, setSelectedCodecs] = useState<Set<CodecKey>>(() => {
        try {
            return new Set<CodecKey>(JSON.parse(codecsJson || "[]"));
        } catch {
            return new Set<CodecKey>(["mp3", "opus"]);
        }
    });

    const [selectedBitrates, setSelectedBitrates] = useState<Set<number>>(() => {
        try {
            return new Set<number>(JSON.parse(bitratesJson || "[]"));
        } catch {
            return new Set<number>([96, 128, 160]);
        }
    });

    // Environment probing

    const [isProbing, setIsProbing] = useState(true);

    const [support, setSupport] = useState<Record<string, boolean>>({});

    // Transcoding state

    const [isTranscoding, setIsTranscoding] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const [progress, setProgress] = useState<Record<string, number>>({});

    const [results, setResults] = useState<ResultItem[]>([]);
    const [isProgressCollapsed, setIsProgressCollapsed] = useState(false);

    const [errors, setErrors] = useState<Record<string, string>>({});
    const currentHashRef = useRef<string | null>(null);

    const objectUrlsRef = useRef<string[]>([]);
    const progressScrollRef = useRef<HTMLDivElement | null>(null);
    const [progAtTop, setProgAtTop] = useState(true);
    const [progAtBottom, setProgAtBottom] = useState(true);
    const onProgressScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const { scrollTop, scrollHeight, clientHeight } = el;
        setProgAtTop(scrollTop <= 0);
        setProgAtBottom(scrollTop + clientHeight >= scrollHeight - 1);
    };

    useEffect(() => {
        let cancelled = false;
        async function probeSupport() {
            setIsProbing(true);
            const result = await probeEncodingSupport();
            if (!cancelled) {
                setSupport(result);
                setIsProbing(false);
            }
        }

        probeSupport();

        return () => {
            cancelled = true;
        };
    }, []);

    // Theme init from localStorage or system preference
    useEffect(() => {
        try {
            const stored = localStorage.getItem("theme");
            const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
            const next = stored === "dark" || (!stored && prefersDark) ? "dark" : "light";
            setTheme(next);
            document.documentElement.classList.toggle("dark", next === "dark");
        } catch {}
    }, []);

    function toggleTheme() {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        try {
            localStorage.setItem("theme", next);
        } catch {}
        document.documentElement.classList.toggle("dark", next === "dark");
    }

    // Clean up object URLs on unmount
    useEffect(() => {
        return () => {
            objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));

            objectUrlsRef.current = [];
        };
    }, []);

    // Helpers: hashing and base64 for caching
    async function computeFileHash(blob: Blob): Promise<string> {
        const buf = await blob.arrayBuffer();
        const hash = await crypto.subtle.digest("SHA-256", buf);
        const bytes = new Uint8Array(hash);
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    function blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("read error"));
            reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
            reader.readAsDataURL(blob);
        });
    }

    function base64ToBlob(b64: string, mime: string): Blob {
        const bin = atob(b64);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }

    type CachedItem = {
        id: string;
        name: string;
        size: number;
        mime: string;
        label: string;
        b64: string;
    };

    // IndexedDB cache for encoded outputs (binary blobs)
    const idbRef = useRef<IDBDatabase | null>(null);

    type EncodedRecord = {
        key: string; // `${hash}:${id}`
        hash: string;
        id: string;
        name: string;
        size: number;
        mime: string;
        label: string;
        blob: Blob;
    };

    function ensureDb(): Promise<IDBDatabase | null> {
        return new Promise((resolve) => {
            if (typeof window === "undefined") return resolve(null);
            if (idbRef.current) {
                const hasStore = idbRef.current.objectStoreNames.contains("encoded");
                if (hasStore) return resolve(idbRef.current);
                try {
                    idbRef.current.close();
                } catch {}
                idbRef.current = null;
            }
            // First open to inspect existing version/stores
            const open1 = indexedDB.open("transcode-cache");
            open1.onsuccess = () => {
                const db = open1.result;
                const hasStore = db.objectStoreNames.contains("encoded");
                if (hasStore) {
                    idbRef.current = db;
                    return resolve(db);
                }
                const nextVersion = (db.version || 1) + 1;
                try {
                    db.close();
                } catch {}
                const open2 = indexedDB.open("transcode-cache", nextVersion);
                open2.onupgradeneeded = () => {
                    const udb = open2.result;
                    if (!udb.objectStoreNames.contains("encoded")) {
                        const store = udb.createObjectStore("encoded", { keyPath: "key" });
                        store.createIndex("by_hash", "hash", { unique: false });
                    }
                };
                open2.onsuccess = () => {
                    idbRef.current = open2.result;
                    resolve(open2.result);
                };
                open2.onerror = () => resolve(null);
            };
            open1.onupgradeneeded = () => {
                const db = open1.result;
                if (!db.objectStoreNames.contains("encoded")) {
                    const store = db.createObjectStore("encoded", { keyPath: "key" });
                    store.createIndex("by_hash", "hash", { unique: false });
                }
            };
            open1.onerror = () => resolve(null);
        });
    }

    async function idbGetByHash(hash: string): Promise<EncodedRecord[]> {
        const db = await ensureDb();
        if (!db) return [];
        return new Promise((resolve) => {
            const tx = db.transaction("encoded", "readonly");
            const store = tx.objectStore("encoded");
            const idx = store.index("by_hash");
            const req = idx.getAll(hash);
            req.onsuccess = () => resolve((req.result as EncodedRecord[]) || []);
            req.onerror = () => resolve([]);
        });
    }

    async function idbPutMany(records: EncodedRecord[]): Promise<void> {
        const db = await ensureDb();
        if (!db || records.length === 0) return;
        return new Promise((resolve) => {
            const tx = db.transaction("encoded", "readwrite");
            const store = tx.objectStore("encoded");
            for (const rec of records) store.put(rec);
            tx.oncomplete = () => resolve();
            tx.onabort = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    function cacheKeyFor(hash: string) {
        return `cachedResults:${hash}`;
    }

    function loadCachedResultsSync(hash: string): CachedItem[] | null {
        try {
            const raw = localStorage.getItem(cacheKeyFor(hash));
            if (!raw) return null;
            return JSON.parse(raw) as CachedItem[];
        } catch {
            return null;
        }
    }

    function storeCachedResultsSync(hash: string, items: CachedItem[]) {
        try {
            localStorage.setItem(cacheKeyFor(hash), JSON.stringify(items));
        } catch {}
    }

    async function materializeCachedToUI(hash: string): Promise<Record<string, ResultItem>> {
        // Try IndexedDB first
        const encoded = await idbGetByHash(hash);
        let realized: ResultItem[] = [];
        const map: Record<string, ResultItem> = {};
        if (encoded.length > 0) {
            for (const rec of encoded) {
                const url = URL.createObjectURL(rec.blob);
                const item: ResultItem = {
                    id: rec.id,
                    name: rec.name,
                    size: rec.size,
                    url,
                    mime: rec.mime,
                    label: rec.label,
                };
                realized.push(item);
                map[rec.id] = item;
            }
        } else {
            // Fallback to legacy localStorage base64
            const cached = loadCachedResultsSync(hash);
            if (!cached || cached.length === 0) return {};
            for (const c of cached) {
                const blob = base64ToBlob(c.b64, c.mime);
                const url = URL.createObjectURL(blob);
                const item: ResultItem = {
                    id: c.id,
                    name: c.name,
                    size: blob.size,
                    url,
                    mime: c.mime,
                    label: c.label,
                };
                realized.push(item);
                map[c.id] = item;
            }
        }
        // replace current results
        setResults((prev) => {
            revokeResults(prev);
            return realized;
        });
        objectUrlsRef.current = realized.map((r) => r.url);
        return map;
    }

    async function writeResultsToCache(hash: string, items: ResultItem[]) {
        const out: CachedItem[] = [];
        const idbRecords: EncodedRecord[] = [];
        for (const r of items) {
            try {
                const res = await fetch(r.url);
                const blob = await res.blob();
                // For IndexedDB (binary)
                idbRecords.push({
                    key: `${hash}:${r.id}`,
                    hash,
                    id: r.id,
                    name: r.name,
                    size: blob.size,
                    mime: r.mime,
                    label: r.label,
                    blob,
                });
                // For legacy localStorage (base64)
                const b64 = await blobToBase64(blob);
                out.push({
                    id: r.id,
                    name: r.name,
                    size: blob.size,
                    mime: r.mime,
                    label: r.label,
                    b64,
                });
            } catch {}
        }
        if (idbRecords.length) await idbPutMany(idbRecords);
        if (out.length) storeCachedResultsSync(hash, out);
        try {
            localStorage.setItem("lastResultsHash", hash);
        } catch {}
    }

    async function clearEncodedCacheIDB() {
        const db = await ensureDb();
        if (!db) return;
        return new Promise<void>((resolve) => {
            const tx = db.transaction("encoded", "readwrite");
            const store = tx.objectStore("encoded");
            store.clear();
            tx.oncomplete = () => resolve();
            tx.onabort = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    // On mount, reuse previous run outputs if present
    useEffect(() => {
        try {
            const last = localStorage.getItem("lastResultsHash");
            if (!last) return;
            materializeCachedToUI(last);
        } catch {}
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Selections handlers

    function toggleCodec(key: CodecKey) {
        setSelectedCodecs((prev) => {
            const next = new Set(prev);

            if (next.has(key)) next.delete(key);
            else next.add(key);

            try {
                selectedCodecsStore.set(JSON.stringify(Array.from(next)));
            } catch {}
            return next;
        });
    }

    function selectAllCodecs() {
        const all = new Set(CODECS.map((c) => c.key));
        setSelectedCodecs(all);
        try {
            selectedCodecsStore.set(JSON.stringify(Array.from(all)));
        } catch {}
    }

    function clearCodecs() {
        setSelectedCodecs(new Set());
        try {
            selectedCodecsStore.set(JSON.stringify([]));
        } catch {}
    }

    function toggleBitrate(kbps: number) {
        setSelectedBitrates((prev) => {
            const next = new Set(prev);

            if (next.has(kbps)) next.delete(kbps);
            else next.add(kbps);

            try {
                selectedBitratesStore.set(JSON.stringify(Array.from(next)));
            } catch {}
            return next;
        });
    }

    function selectAllBitrates() {
        const all = new Set(BITRATES_KBPS);
        setSelectedBitrates(all);
        try {
            selectedBitratesStore.set(JSON.stringify(Array.from(all)));
        } catch {}
    }

    function clearBitrates() {
        setSelectedBitrates(new Set());
        try {
            selectedBitratesStore.set(JSON.stringify([]));
        } catch {}
    }

    function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];

        if (f) {
            setFile(f);

            clearOutputs();
            setStage("configure");
            setStage("configure");
        }
    }

    async function clearOutputs() {
        setResults((prev) => {
            revokeResults(prev);
            return [];
        });
        objectUrlsRef.current = [];
        setProgress({});
        setErrors({});
        // clear cached results entirely
        try {
            const keys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith("cachedResults:")) keys.push(k);
            }
            keys.forEach((k) => localStorage.removeItem(k));
            localStorage.removeItem("lastResultsHash");
        } catch {}
        // clear IDB encoded cache as well
        try {
            await clearEncodedCacheIDB();
        } catch {}
    }

    // Compute selected codecs metadata
    const selectedOptions = useMemo(() => getSelectedCodecOptions(selectedCodecs), [selectedCodecs]);

    // Create jobs from selections
    const jobs: Job[] = useMemo(() => {
        return createJobsFromSelections(selectedOptions, selectedBitrates, isProbing ? undefined : support);
    }, [selectedOptions, selectedBitrates, support, isProbing]);

    // Initialize scroll fade state once jobs exist
    useEffect(() => {
        const el = progressScrollRef.current;
        if (!el) return;
        const { scrollTop, scrollHeight, clientHeight } = el;
        setProgAtTop(scrollTop <= 0);
        setProgAtBottom(scrollTop + clientHeight >= scrollHeight - 1);
    }, [jobs.length, isTranscoding, progress]);

    const needsBitrateButNoneSelected = useMemo(
        () => checkNeedsBitrate(selectedOptions, selectedBitrates),
        [selectedOptions, selectedBitrates],
    );

    const canStart = !!file && jobs.length > 0 && !isProbing && !isTranscoding;

    async function transcode() {
        if (!file || jobs.length === 0) return;

        // Pre-check cache coverage before starting: auto-use cache when possible
        const preHash = await computeFileHash(file);
        currentHashRef.current = preHash;
        try {
            localStorage.setItem("lastResultsHash", preHash);
        } catch {}
        const cachedList = loadCachedResultsSync(preHash) || [];
        if (cachedList.length > 0) {
            const cachedIds = new Set(cachedList.map((c) => c.id));
            const preMissingJobs = jobs.filter((j) => !cachedIds.has(j.id));
            if (preMissingJobs.length === 0) {
                await materializeCachedToUI(preHash);
                setStage("run");
                return; // fully cached; skip workers entirely
            }
        }

        setIsTranscoding(true);
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();
        setIsProgressCollapsed(false);
        setStage("run");

        setProgress({});
        setErrors({});

        setResults((prev) => {
            revokeResults(prev);
            return [];
        });
        objectUrlsRef.current = [];

        const cores =
            typeof navigator !== "undefined" && (navigator as any).hardwareConcurrency
                ? (navigator as any).hardwareConcurrency
                : 2;
        const concurrency = Math.max(1, Math.min(cores - 1, 3));

        // Use precomputed hash and materialize any cached outputs before starting missing jobs
        const cachedMap = await materializeCachedToUI(preHash);
        const missingJobs = jobs.filter((j) => !cachedMap[j.id]);
        if (missingJobs.length === 0) {
            setIsTranscoding(false);
            return; // nothing to do
        }

        let newResultsAcc: ResultItem[] = Object.values(cachedMap);
        const { results: newResults, errors: runErrors } = await transcodeFileToJobsInWorkers(
            file,
            missingJobs,
            concurrency,
            (jobId, p) => setProgress((prev) => ({ ...prev, [jobId]: p })),
            (_jobId, result) => {
                setResults((prev) => [...prev, result]);
                objectUrlsRef.current.push(result.url);
                try {
                    toast.success(`${result.label} finished`);
                } catch {}
                newResultsAcc.push(result);
            },
            (jobId, message) => {
                setErrors((prev) => ({ ...prev, [jobId]: message }));
            },
            abortControllerRef.current.signal,
        );

        // Merge any remaining errors (results are pushed incrementally above)
        if (Object.keys(runErrors).length) {
            setErrors((prev) => ({ ...prev, ...runErrors }));
        }

        // write cache of all currently realized results
        if (currentHashRef.current) {
            await writeResultsToCache(currentHashRef.current, newResultsAcc);
        }

        setIsTranscoding(false);
        setIsProgressCollapsed(true);
    }

    function cancelTranscode() {
        try {
            abortControllerRef.current?.abort();
        } catch {}
        setIsTranscoding(false);
    }

    return (
        <div className="flex min-h-screen items-start justify-center bg-zinc-50 dark:bg-black">
            <main className="mx-auto w-full max-w-4xl p-6 sm:p-10">
                <header className="mb-8 flex flex-col gap-2">
                    <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                        Audio Transcoder (Mediabunny)
                    </h1>

                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Choose a local file, select target codec(s) and bitrate(s), then transcode — all in your
                        browser.
                    </p>

                    <div className="flex items-start justify-end">
                        <Button variant="outline" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
                            {theme === "dark" ? "Light mode" : "Dark mode"}
                        </Button>
                    </div>
                </header>

                {/* File picker */}

                <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-1 flex-col gap-2">
                            <label htmlFor="file" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                                Pick an audio (or video) file
                            </label>

                            <input
                                id="file"
                                type="file"
                                accept="audio/*,video/*"
                                onChange={onPickFile}
                                disabled={isTranscoding}
                                className="block w-full cursor-pointer rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-800 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-200 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:file:bg-zinc-700 dark:file:text-zinc-100 dark:hover:file:bg-zinc-600"
                            />

                            {file && (
                                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                    Selected: {file.name} — {humanSize(file.size)}
                                </div>
                            )}
                        </div>

                        <div className="mt-2 flex gap-2 sm:mt-7">
                            <button
                                type="button"
                                onClick={clearOutputs}
                                disabled={isTranscoding || results.length === 0}
                                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                            >
                                Clear cache
                            </button>

                            {isProbing && (
                                <span className="self-center text-xs text-zinc-600 dark:text-zinc-400">
                                    Probing codec support…
                                </span>
                            )}
                        </div>
                    </div>
                </section>

                {/* Settings: Codec and Bitrate (configure stage, only after file pick) */}

                <section suppressHydrationWarning className="mb-6">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Settings</h2>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                onClick={transcode}
                                disabled={!canStart}
                                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white ${
                                    canStart
                                        ? "bg-black hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                                        : "cursor-not-allowed bg-zinc-300 dark:bg-zinc-700"
                                }`}
                            >
                                Transcode
                                <ArrowRightIcon className="size-4" />
                            </Button>
                            {isTranscoding && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={cancelTranscode}
                                    aria-label="Cancel transcoding"
                                >
                                    Cancel
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <CodecPicker
                            options={CODECS}
                            selected={selectedCodecs}
                            support={support}
                            isProbing={isProbing}
                            isTranscoding={isTranscoding}
                            onToggle={toggleCodec}
                            onSelectAll={selectAllCodecs}
                            onClear={clearCodecs}
                        />
                        <BitratePicker
                            bitrates={BITRATES_KBPS}
                            selected={selectedBitrates}
                            isTranscoding={isTranscoding}
                            onToggle={toggleBitrate}
                            onSelectAll={selectAllBitrates}
                            onClear={clearBitrates}
                            needsBitrateButNoneSelected={needsBitrateButNoneSelected}
                        />
                    </div>
                </section>

                {/* Progress - collapsible; stays after completion */}
                {(isTranscoding || (!isTranscoding && Object.keys(progress).length > 0)) && (
                    <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Progress</h2>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsProgressCollapsed((v) => !v)}
                                aria-label={isProgressCollapsed ? "Expand progress" : "Collapse progress"}
                            >
                                {isProgressCollapsed ? "Expand" : "Collapse"}
                            </Button>
                        </div>
                        {!isProgressCollapsed && (
                            <div className="flex flex-col gap-3 max-h-64 overflow-auto pr-1">
                                {jobs
                                    .slice()
                                    .sort((a, b) => {
                                        const av = Math.floor((progress[a.id] ?? 0) * 100);
                                        const bv = Math.floor((progress[b.id] ?? 0) * 100);
                                        const aDone = av >= 100 || errors[a.id];
                                        const bDone = bv >= 100 || errors[b.id];
                                        if (aDone === bDone) return 0;
                                        return aDone ? 1 : -1; // finished to bottom
                                    })
                                    .map((j) => {
                                        const value = Math.floor((progress[j.id] ?? 0) * 100);
                                        const err = errors[j.id];
                                        return (
                                            <div key={j.id} className="flex flex-col">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-zinc-800 dark:text-zinc-200">
                                                        {j.label}
                                                    </span>
                                                    <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                                                        {err ? "Error" : `${value}%`}
                                                    </span>
                                                </div>
                                                <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                                                    <div
                                                        className={`h-full transition-all ${err ? "bg-red-500" : value === 100 ? "bg-green-600" : "bg-zinc-900 dark:bg-zinc-100"}`}
                                                        style={{ width: `${err ? 100 : value}%` }}
                                                    />
                                                </div>
                                                {err && (
                                                    <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                                                        {err}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </section>
                )}

                {/* Outputs & A/B testing - collapsed by default */}
                <Accordion type="single" collapsible defaultValue="">
                    <AccordionItem
                        value="ab"
                        className="mb-4 rounded-xl border border-zinc-200 bg-white px-5 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                        <AccordionTrigger className="py-3">A/B testing</AccordionTrigger>
                        <AccordionContent>
                            <ABTesting results={results} />
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem
                        value="outputs"
                        className="rounded-xl border border-zinc-200 bg-white px-5 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                        <AccordionTrigger className="py-3">Outputs</AccordionTrigger>
                        <AccordionContent>
                            <Outputs results={results} />
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                <footer className="mb-10 text-center text-xs text-zinc-500 dark:text-zinc-500">
                    Powered by Mediabunny — All conversions happen in your browser.
                </footer>
            </main>
            <Toaster position="top-right" richColors />
        </div>
    );
}
