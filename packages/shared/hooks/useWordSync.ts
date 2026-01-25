// packages/shared/hooks/useWordSync.ts
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useRobotSpeaker } from './useRobotSpeaker';
import type { WordTiming, SpeakResp } from '../api/ttsAvatarApi';
import { bestAudioUrl } from '../api/ttsAvatarApi';
import { decodeHtmlEntities, looksLikeEscapedSsml, ssmlToPlainText } from '../utils/ssmlText';

/* ─────────────────────────────────────────────────────────
   Types / guards
────────────────────────────────────────────────────────── */
type Viseme = { time: number; id: number };

type RobotSpeaker = {
  speak: (backendBase: string, ...rest: unknown[]) => Promise<unknown>;
  requestSpeech?: (backendBase: string, ...rest: unknown[]) => Promise<unknown>;
  loading: boolean;
  error: string | null;
  data?: SpeakResp | null;
  getVisemes?: () => Viseme[] | undefined;
};

type ExtendedSpeakResp = SpeakResp & { ssml?: string; text?: string; rawText?: string };
type TtsMark = { i: number; t: number; w: string };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const isWordTimingArray = (arr: unknown[]): arr is WordTiming[] =>
  Array.isArray(arr) &&
  arr.length > 0 &&
  typeof (arr[0] as any)?.start === 'number' &&
  typeof (arr[0] as any)?.text === 'string';
const isTtsMarkArray = (arr: unknown[]): arr is TtsMark[] =>
  Array.isArray(arr) &&
  arr.length > 0 &&
  typeof (arr[0] as any)?.t === 'number' &&
  typeof (arr[0] as any)?.w === 'string';

/* ─────────────────────────────────────────────────────────
   Time helpers
────────────────────────────────────────────────────────── */
function indexAtTime(arr: WordTiming[], tSec: number): number {
  let lo = 0,
    hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = arr[mid];
    if (tSec < w.start) hi = mid - 1;
    else if (tSec >= w.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

function marksToTimings(marks: TtsMark[], durationHintSec?: number): WordTiming[] {
  if (!marks?.length) return [];
  const sorted = [...marks].sort((a, b) => a.i - b.i);
  const eps = 0.06;
  const starts = sorted.map((m) => Math.max(0, (m.t || 0) / 1000));
  const out: WordTiming[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = starts[i];
    const end =
      i < sorted.length - 1
        ? Math.max(start + eps, starts[i + 1] - eps)
        : Number.isFinite(durationHintSec) && (durationHintSec as number) > 0
          ? Math.max(start + eps, durationHintSec as number)
          : start + 0.18;
    out.push({ start, end, text: sorted[i].w || '…' });
  }
  return out;
}

/* Basic, robust VTT/SRT → line timings (only used as fallback) */
function parseSimpleVttOrSrt(text: string): WordTiming[] {
  const lines = text.split(/\r?\n/);
  const out: WordTiming[] = [];
  let i = 0;
  const ts =
    /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{1,3})/;
  const toSec = (h?: string, m?: string, s?: string, ms?: string) =>
    Number(h || 0) * 3600 + Number(m || 0) * 60 + Number(s || 0) + Number(ms || 0) / 1000;
  while (i < lines.length) {
    const m = lines[i].match(ts);
    if (m) {
      const start = toSec(m[1], m[2], m[3], m[4]);
      const end = toSec(m[5], m[6], m[7], m[8]);
      i++;
      let textLine = '';
      while (i < lines.length && lines[i].trim()) {
        textLine += (textLine ? ' ' : '') + lines[i].trim();
        i++;
      }
      out.push({ start, end, text: textLine || '…' });
    }
    i++;
  }
  return out;
}

/* Normalization for crude fallbacks only (never touch precise timings) */
function normalizeTextForFallback(input?: string): string {
  if (!input) return '';
  return decodeHtmlEntities(String(input))
    .replace(/&nbsp;/g, ' ')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ssmlVisibleText(input?: string): string {
  if (!input) return '';
  if (/<\s*(speak|break|prosody|mark|p|s)\b/i.test(input) || looksLikeEscapedSsml(input)) {
    return ssmlToPlainText(input);
  }
  return normalizeTextForFallback(input);
}

function decorateTimingsFromSource(timings: WordTiming[], sourceText?: string): WordTiming[] {
  if (!timings?.length || !sourceText) return timings;

  // If timings already have punctuation/symbols, don't touch them.
  const timingsHavePunc = timings.some((w) => {
    const t = (w?.text || '').trim();
    if (!t) return false;
    if (/^[\p{P}\p{S}]+$/u.test(t)) return true;
    return /[.!?…,:;(){}\[\]]/.test(t);
  });
  if (timingsHavePunc) return timings;

  const visible = ssmlVisibleText(sourceText);
  if (!visible) return timings;

  const rawTokens = visible.split(/\s+/).filter(Boolean);
  const ssmlWordRe = /^(?:lt|gt|break|prosody|speak|mark|bookmark|mstts)$/i;
  const isDebrisToken = (token: string, prev?: string, next?: string) => {
    const t = token.trim();
    if (!t) return true;
    if (/[<>]/.test(t)) return true;
    if (/time\s*=\s*["']?\d+ms["']?/i.test(t)) return true;
    if (ssmlWordRe.test(t)) {
      const prevMatch = !!prev && ssmlWordRe.test(prev.trim());
      const nextMatch = !!next && ssmlWordRe.test(next.trim());
      if (prevMatch || nextMatch) return true;
    }
    return false;
  };
  const tokens = rawTokens.filter(
    (tok, idx, arr) => !isDebrisToken(tok, arr[idx - 1], arr[idx + 1])
  );
  if (!tokens.length) return timings;

  const norm = (s: string) =>
    (s || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}']/gu, '');

  const isPuncOnly = (t: string) => norm(t) === '' && /[\p{P}\p{S}]/u.test(t);

  const peel = (t: string) => {
    const leading = t.match(/^[\p{P}\p{S}]+/u)?.[0] ?? '';
    const trailing = t.match(/[\p{P}\p{S}]+$/u)?.[0] ?? '';
    const core = t.slice(leading.length, t.length - trailing.length);
    return { leading, core, trailing };
  };

  const out = timings.map((w) => ({ ...w }));
  let j = 0;
  let lastMatched = -1;

  for (let i = 0; i < out.length; i++) {
    const base = norm(out[i]?.text || '');
    if (!base) continue;

    // Attach punctuation-only tokens that appear before the next word
    while (j < tokens.length && isPuncOnly(tokens[j])) {
      const p = tokens[j];
      if (lastMatched >= 0) out[lastMatched].text = (out[lastMatched].text || '') + p;
      else out[i].text = p + (out[i].text || '');
      j++;
    }

    // Advance until we find a token whose CORE matches the current timing word
    while (j < tokens.length) {
      const tok = tokens[j];
      if (!tok) {
        j++;
        continue;
      }
      if (isPuncOnly(tok)) break;
      const { core } = peel(tok);
      if (norm(core) === base) break;
      j++;
    }

    const tok = tokens[j];
    if (tok && !isPuncOnly(tok)) {
      const { leading, core, trailing } = peel(tok);
      out[i].text = `${leading}${core}${trailing}`;
      lastMatched = i;
      j++;

      // Immediately attach punctuation-only tokens after the word
      while (j < tokens.length && isPuncOnly(tokens[j])) {
        out[i].text = (out[i].text || '') + tokens[j];
        j++;
      }
    }
  }

  return out;
}

function approximateFromVisemes(visemes: Viseme[] | undefined, ssmlOrText?: string): WordTiming[] {
  if (!visemes?.length) return [];
  const plain = ssmlVisibleText(ssmlOrText);
  const words = plain ? plain.split(/\s+/) : [];
  const lastTime = visemes[visemes.length - 1]?.time ?? 0;
  const dur = Math.max(0.5, lastTime + 0.25);
  const chunks = Math.max(1, words.length || Math.ceil(visemes.length / 2));
  const per = dur / chunks;
  let t = 0;
  const out: WordTiming[] = [];
  for (let i = 0; i < chunks; i++) {
    const start = t;
    const end = Math.min(dur, start + per);
    out.push({ start, end, text: words[i] ?? '…' });
    t = end;
  }
  return out;
}

function spreadEvenly(wordsText: string, durationSec: number): WordTiming[] {
  const tokens = wordsText.replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const dur = Math.max(0.5, durationSec);
  const per = dur / tokens.length;
  const out: WordTiming[] = [];
  let t = 0;
  for (let i = 0; i < tokens.length; i++) {
    const start = t;
    const end = i === tokens.length - 1 ? dur : start + per;
    out.push({ start, end, text: tokens[i] });
    t = end;
  }
  return out;
}

/* Sentences for UI rendering (no paragraphs) */
export type SentenceTiming = {
  text: string;
  start: number;
  end: number;
  indices: number[];
};
function groupWordsBySentence(words: WordTiming[], maxChars: number): SentenceTiming[] {
  const sentences: SentenceTiming[] = [];
  let buf = '',
    start = 0;
  let idxs: number[] = [];
  const isEnd = (t: string) => /[\.!\?…]["']?$/.test(t);
  words.forEach((w, i) => {
    const piece = (buf ? ' ' : '') + w.text;
    if (!buf) start = w.start;
    buf += piece;
    idxs.push(i);
    if (isEnd(w.text) || buf.length >= maxChars) {
      sentences.push({
        text: buf.trim(),
        start,
        end: w.end,
        indices: idxs,
      });
      buf = '';
      idxs = [];
    }
  });
  if (buf && idxs.length) {
    sentences.push({
      text: buf.trim(),
      start,
      end: words[idxs[idxs.length - 1]].end,
      indices: idxs,
    });
  }
  return sentences;
}

/* Absolute URL helper for sidecar captions */
function toAbsolute(base?: string, path?: string) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (!base) return path;
  const b = String(base).replace(/\/+$/, '');
  return `${b}${path.startsWith('/') ? '' : '/'}${path}`;
}

/* ─────────────────────────────────────────────────────────
   Audio clock helpers
────────────────────────────────────────────────────────── */
type AudioTimestampLike = {
  contextTime?: number;
  performanceTime?: number;
};
function getOutputTimestampSafe(ctx?: AudioContext | null): Required<AudioTimestampLike> {
  let contextTime = 0;
  let performanceTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const ts =
      ctx && 'getOutputTimestamp' in ctx
        ? (ctx as unknown as { getOutputTimestamp: () => AudioTimestampLike }).getOutputTimestamp()
        : undefined;
    if (typeof ts?.contextTime === 'number' && Number.isFinite(ts.contextTime))
      contextTime = ts.contextTime;
    if (typeof ts?.performanceTime === 'number' && Number.isFinite(ts.performanceTime))
      performanceTime = ts.performanceTime;
  } catch {}
  return { contextTime, performanceTime };
}

function getApproxOutputLatencySec(ctx?: AudioContext | null): number {
  if (!ctx) return 0;
  try {
    const { contextTime } = getOutputTimestampSafe(ctx);
    const current = (ctx as any).currentTime ?? 0;
    const base = (ctx as any).baseLatency || 0;
    const out = (ctx as any).outputLatency || 0;
    const fromTS = current - (typeof contextTime === 'number' ? contextTime : 0);
    const est = Number.isFinite(fromTS) && fromTS > 0 ? fromTS : base + out;
    return Math.min(0.35, Math.max(0, est));
  } catch {
    return 0;
  }
}

/* ─────────────────────────────────────────────────────────
   Hook
────────────────────────────────────────────────────────── */
const DEFAULT_UI_LEAD_MS = 0; // visual lead (not persisted)
const EMA_ALPHA = 0.1; // skew EMA
const MICRO_SKEW_LIMIT_S = 0.35;
const MICRO_SCALE_MIN = 0.99;
const MICRO_SCALE_MAX = 1.01;

export function useWordSync() {
  const robot = useRobotSpeaker() as unknown as RobotSpeaker;

  const [words, setWords] = useState<WordTiming[]>([]);
  const wordsRef = useRef<WordTiming[]>([]);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [endedTick, setEndedTick] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);

  const audioEl = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // output latency snapshot + smoothed dynamic latency
  const outLat0Ref = useRef(0);
  const outLatSmoothRef = useRef(0);

  // volume (persisted)
  const [volume, setVolumeState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('classroomVolume');
      const v = raw == null ? NaN : parseFloat(raw);
      return Number.isFinite(v) ? clamp01(v) : 1;
    } catch {
      return 1;
    }
  });

  // persisted skew (ms) aligns to first word start (no UI lead baked in)
  const [syncSkewMs, setSyncSkewMs] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('classroomSyncSkewMs') ?? 0);
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('classroomSyncSkewMs', String(syncSkewMs));
    } catch {}
  }, [syncSkewMs]);

  // micro-PLL state: skew (seconds) + scale (dimensionless)
  const microSkewRef = useRef(0);
  const microScaleRef = useRef(1);

  // anchor on play: map media time → word time linearly
  const anchorMediaRef = useRef(0); // a.currentTime - outputLatency at onplay
  const anchorWordRef = useRef(0); // words[0].start at onplay

  // last base used to compute bestAudioUrl
  const lastBaseRef = useRef<string>('');
  const lastRespRef = useRef<SpeakResp | null>(null);
  const lastTimingSigRef = useRef<string>('');

  // duration derived from timing
  const durationFromWords = useMemo(
    () => (words.length ? Math.max(...words.map((w) => w.end || 0)) : 0),
    [words]
  );

  // Average word duration → decide when to use block (sentence) highlighting
  const avgWordDurSec = useMemo(() => {
    if (!words.length || !durationFromWords) return 0;
    return durationFromWords / words.length;
  }, [words, durationFromWords]);

  // e.g. if average word is < 130ms, treat it as fast → use sentence blocks
  const useSentenceBlocks = avgWordDurSec > 0 && avgWordDurSec < 0.13;

  /* Public setters/utilities */
  const setTime = (tSec: number) => {
    const arr = wordsRef.current;
    if (!arr.length) return;
    const idx = indexAtTime(arr, tSec);
    if (idx !== -1) {
      if (idx !== currentIndex) setCurrentIndex(idx);
    } else {
      if (tSec <= (arr[0]?.start ?? 0)) setCurrentIndex(0);
      else setCurrentIndex(arr.length - 1);
    }
  };

  const getTimeForWord = (i: number) => Math.max(0, wordsRef.current[i]?.start ?? 0);

  const retimeEvenly = (targetDurationSec: number) => {
    const arr = wordsRef.current;
    if (!arr.length || !Number.isFinite(targetDurationSec) || targetDurationSec <= 0) return;
    const currentDur = durationFromWords || (arr[arr.length - 1]?.end ?? 0) || 0;
    if (!currentDur) return;
    const scale = targetDurationSec / currentDur;
    const retimed = arr.map((w) => ({
      text: w.text,
      start: (w.start ?? 0) * scale,
      end: (w.end ?? w.start ?? 0) * scale,
    }));
    setWords(retimed);
    setCurrentIndex(0);
  };

  const markEnded = () => {
    setIsPlaying(false);
    setEndedTick((n) => n + 1);
  };

  const speak = useCallback(
    async (backendBase: string, ...rest: unknown[]) => {
      lastBaseRef.current = backendBase;
      return robot.speak(backendBase, ...rest);
    },
    [robot]
  );

  const requestSpeech = useCallback(
    async (backendBase: string, ...rest: unknown[]) => {
      lastBaseRef.current = backendBase;
      return robot.requestSpeech?.(backendBase, ...rest);
    },
    [robot]
  );

  // create the audio element once
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const a = document.createElement('audio');
    a.preload = 'auto';
    a.crossOrigin = 'anonymous';
    a.muted = false;
    a.volume = clamp01(volume);
    a.setAttribute('playsinline', 'true');
    a.setAttribute('x-webkit-airplay', 'deny');

    a.onvolumechange = () => {
      const v = clamp01(a.volume ?? 1);
      setVolumeState(v);
      try {
        localStorage.setItem('classroomVolume', String(v));
      } catch {}
    };

    a.onplay = () => {
      const arr = wordsRef.current;
      if (!arr.length) return;
      const firstStart = arr[0]?.start ?? 0;
      // Persisted skew aligns to first token; visual lead is applied only when reading.
      setSyncSkewMs(Math.round(-firstStart * 1000));
      // Reset PLL & set anchors
      microSkewRef.current = 0;
      microScaleRef.current = 1;
      outLat0Ref.current = getApproxOutputLatencySec(audioCtxRef.current);
      outLatSmoothRef.current = outLat0Ref.current;
      anchorMediaRef.current = (a.currentTime || 0) - outLat0Ref.current;
      anchorWordRef.current = firstStart;
    };

    a.onended = () => {
      setIsPlaying(false);
      setEndedTick((n) => n + 1);
    };

    a.onerror = () => {
      try {
        const src = a.currentSrc || a.src || '';
        const base = lastBaseRef.current;
        const data = lastRespRef.current;
        if (base && data) {
          const preferred = bestAudioUrl(base, data);
          if (preferred && preferred !== src) {
            a.src = preferred;
            try {
              a.load();
            } catch {}
          }
        }
      } catch {}
    };

    // Re-anchor on seek
    a.onseeked = () => {
      const arr = wordsRef.current;
      if (!arr.length) return;
      const i = indexAtTime(arr, Math.max(0, (a.currentTime || 0) - outLatSmoothRef.current));
      const w = arr[Math.max(0, i === -1 ? 0 : i)];
      outLat0Ref.current = getApproxOutputLatencySec(audioCtxRef.current);
      anchorMediaRef.current = (a.currentTime || 0) - outLat0Ref.current;
      anchorWordRef.current = w?.start ?? 0;
      microSkewRef.current = 0;
      microScaleRef.current = 1;
    };

    // Re-anchor on playback rate change
    a.onratechange = () => {
      outLat0Ref.current = getApproxOutputLatencySec(audioCtxRef.current);
      anchorMediaRef.current = (a.currentTime || 0) - outLat0Ref.current;
      microSkewRef.current = 0;
      microScaleRef.current = 1;
    };

    audioEl.current = a;
    return () => {
      try {
        a.pause();
      } catch {}
      audioEl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // volume persistence
  useEffect(() => {
    const a = audioEl.current;
    if (a) a.volume = clamp01(volume);
    try {
      localStorage.setItem('classroomVolume', String(clamp01(volume)));
    } catch {}
  }, [volume]);

  // Ensure AudioContext
  const ensureAudioContext = async (): Promise<AudioContext | null> => {
    if (audioCtxRef.current) return audioCtxRef.current;
    if (typeof window === 'undefined') return null;
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AC = w.AudioContext || w.webkitAudioContext;
    if (AC) {
      try {
        audioCtxRef.current = new AC();
      } catch {}
    }
    return audioCtxRef.current;
  };

  const resumeAudioContext = async () => {
    const ctx = await ensureAudioContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {}
    }
  };

  const play = async () => {
    await resumeAudioContext();
    const a = audioEl.current;
    if (!a) return;
    await a.play();
    setIsPlaying(true);
  };

  const pause = () => {
    try {
      audioEl.current?.pause();
    } finally {
      setIsPlaying(false);
    }
  };

  const seekToWord = (i: number) => {
    const a = audioEl.current;
    const w = words[i];
    if (!a || !w) return;
    a.currentTime = Math.max(0, w.start + 0.001);
    setCurrentIndex(i);
    // re-anchor to reduce post-seek jitter
    outLat0Ref.current = getApproxOutputLatencySec(audioCtxRef.current);
    anchorMediaRef.current = (a.currentTime || 0) - outLat0Ref.current;
    anchorWordRef.current = w.start;
    microSkewRef.current = 0;
    microScaleRef.current = 1;
  };

  // rAF ticker with micro-PLL (skew + scale) + block mode
  const rafId = useRef<number | null>(null);
  const prevErrRef = useRef<{ tWall: number; err: number } | null>(null);

  // Smooth the mapped time slightly to avoid boundary chatter
  const T_SMOOTH_ALPHA = 0.25;
  const tSmoothRef = useRef(0);

  // track word entry hysteresis
  const lastIdxSwitchRef = useRef<{ i: number; at: number } | null>(null);

  // Sentences for UI (and for block mode)
  const sentenceGroups = useMemo(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const cap = isMobile ? 32 : 48;
    return groupWordsBySentence(words, cap);
  }, [words]);

  useEffect(() => {
    // allow at most 8ms backstep in smoothed time (prevents boundary ping-pong)
    const ALLOW_BACKSTEP_S = 0.008;
    // how much of the new word we must spend before switching
    const ENTER_FRAC = 0.25; // 25% of the word’s duration
    const HYST_MS_MIN = 55;
    const HYST_MS_MAX = 140;

    function indexSentenceAtTime(sentences: SentenceTiming[], tSec: number): number {
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i];
        if (tSec >= s.start && tSec < s.end) return i;
      }
      if (sentences.length && tSec >= sentences[sentences.length - 1].end) {
        return sentences.length - 1;
      }
      return -1;
    }

    function onFrame() {
      const a = audioEl.current;
      const arr = wordsRef.current;
      if (a && arr.length) {
        // dynamic output latency (smoothed)
        const ctx = audioCtxRef.current;
        let outLatDyn = 0;
        if (ctx) {
          const { contextTime } = getOutputTimestampSafe(ctx);
          const cur = (ctx as any).currentTime ?? 0;
          const raw = cur - (Number.isFinite(contextTime) ? contextTime : 0);
          outLatDyn = Math.max(
            0,
            Math.min(0.35, Number.isFinite(raw) ? raw : outLatSmoothRef.current)
          );
        }
        outLatSmoothRef.current = 0.92 * outLatSmoothRef.current + 0.08 * outLatDyn;

        const mediaT = (a.currentTime || 0) - outLatSmoothRef.current;
        const anchored =
          anchorWordRef.current + microScaleRef.current * (mediaT - anchorMediaRef.current);

        const tRaw =
          anchored + syncSkewMs / 1000 + microSkewRef.current + DEFAULT_UI_LEAD_MS / 1000;

        // Exponential smoothing on time (mostly non-decreasing)
        const prevSm = tSmoothRef.current || tRaw;
        let tSmoothed = (1 - T_SMOOTH_ALPHA) * prevSm + T_SMOOTH_ALPHA * tRaw;
        if (tSmoothed < prevSm - ALLOW_BACKSTEP_S) {
          tSmoothed = prevSm - ALLOW_BACKSTEP_S;
        }

        // Hard cap: never show UI ahead of audible audio
        const tAudioNow = mediaT;
        const MAX_LEAD_S = 0.006; // ~6ms
        tSmoothed = Math.min(tSmoothed, tAudioNow - MAX_LEAD_S);

        if (tSmoothed < 0) tSmoothed = 0;
        tSmoothRef.current = tSmoothed;

        const tSec = tSmoothed;
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

        // Per-word index from timings (for PLL + fallback)
        const idxWord = indexAtTime(arr, tSec);

        // Decide the *highlight* index
        let nextIndex: number | null = null;

        if (useSentenceBlocks && sentenceGroups.length) {
          // BLOCK MODE: pick the sentence that contains this time,
          // then use the FIRST word index of that sentence.
          const sIdx = indexSentenceAtTime(sentenceGroups, tSec);
          if (sIdx !== -1) {
            const sent = sentenceGroups[sIdx];
            if (sent.indices.length) {
              nextIndex = sent.indices[0];
            }
          }
        }

        if (nextIndex == null && idxWord !== -1) {
          // Fallback to per-word mapping
          nextIndex = idxWord;
        }

        if (idxWord !== -1 && nextIndex != null) {
          // Hysteresis + gating based on the *highlight* index
          const gateIdx = nextIndex;
          const gateWord = arr[Math.max(0, gateIdx)];
          const wDur = Math.max(0.06, gateWord.end - gateWord.start);
          const HYST_MS = Math.min(HYST_MS_MAX, Math.max(HYST_MS_MIN, ENTER_FRAC * wDur * 1000));

          if (gateIdx !== currentIndex) {
            const entered = Math.max(0, tSec - gateWord.start);
            const stayedMs =
              lastIdxSwitchRef.current?.i === gateIdx ? nowMs - lastIdxSwitchRef.current.at : 0;
            if (entered * 1000 > HYST_MS || stayedMs > HYST_MS) {
              setCurrentIndex(gateIdx);
              lastIdxSwitchRef.current = { i: gateIdx, at: nowMs };
            }
          } else if (!lastIdxSwitchRef.current || lastIdxSwitchRef.current.i !== gateIdx) {
            lastIdxSwitchRef.current = { i: gateIdx, at: nowMs };
          }

          // PLL toward the *true* per-word mid (smoother audio lock)
          const pllWord = arr[idxWord];
          const mid = (pllWord.start + pllWord.end) * 0.5;
          const err = mid - tSec; // +ve: UI behind, -ve: UI ahead
          const gainAhead = err < -0.03 ? 1.8 : 1.0; // stronger if >30ms ahead
          const nextSkew = microSkewRef.current + gainAhead * EMA_ALPHA * err;
          microSkewRef.current = Math.max(
            -MICRO_SKEW_LIMIT_S,
            Math.min(MICRO_SKEW_LIMIT_S, nextSkew)
          );

          const now2 = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (prevErrRef.current) {
            const dt = Math.max(1e-3, (now2 - prevErrRef.current.tWall) / 1000);
            const derr = err - prevErrRef.current.err;
            const slope = derr / dt; // s/s
            const SCALE_ALPHA_GENTLE = 0.03; // gentler than 0.06
            const target = microScaleRef.current - SCALE_ALPHA_GENTLE * slope;
            microScaleRef.current = Math.max(MICRO_SCALE_MIN, Math.min(MICRO_SCALE_MAX, target));
          }
          prevErrRef.current = { tWall: now2, err };
        }
      }
      rafId.current = requestAnimationFrame(onFrame);
    }
    rafId.current = requestAnimationFrame(onFrame);
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = null;
    };
  }, [currentIndex, syncSkewMs, useSentenceBlocks, sentenceGroups]);

  // Reset between sessions (no duplication, no drift carryover)
  // Reset between sessions (no duplication, no drift carryover)
  const clearForNewSession = useCallback(() => {
    lastTimingSigRef.current = '';
    microSkewRef.current = 0;
    microScaleRef.current = 1;
    anchorMediaRef.current = 0;
    anchorWordRef.current = 0;

    // Only clear if there's something to clear
    setWords((prev) => (prev.length ? [] : prev));
    setCurrentIndex((prev) => (prev !== 0 ? 0 : prev));

    const el = audioEl.current;
    if (el) {
      try {
        el.pause();
      } catch {}
      try {
        el.removeAttribute('src');
      } catch {}
      try {
        el.load();
      } catch {}
    }
  }, []);

  /* ─── Apply fresh TTS response → choose timing source; lock audio; retime if needed ─── */
  useEffect(() => {
    const resp: SpeakResp | null = robot.data ?? null;
    lastRespRef.current = resp;

    if (!resp) {
      setAudioUrl(null);
      setWords([]);
      setCurrentIndex(0);
      lastTimingSigRef.current = '';
      return;
    }

    const sig =
      (resp as any).cacheKey ??
      (resp as any).streamPath ??
      (resp as any).url ??
      (resp as any).subtitleVttUrl ??
      (resp as any).subtitleSrtUrl ??
      `len:${(resp as any).ssml?.length ?? (resp as any).text?.length ?? 0}`;

    if (lastTimingSigRef.current === sig) return;

    let cancelled = false;
    const apply = async () => {
      let nextWords: WordTiming[] = [];
      let source: 'words' | 'marks' | 'subtitles' | 'fallback' = 'fallback';

      if ((resp as any).words?.length) {
        const arr = (resp as any).words as unknown[];
        if (isWordTimingArray(arr)) {
          nextWords = arr as WordTiming[];
          source = 'words';
        } else if (isTtsMarkArray(arr)) {
          const durHint =
            audioEl.current && Number.isFinite(audioEl.current.duration)
              ? audioEl.current.duration
              : undefined;
          nextWords = marksToTimings(arr as TtsMark[], durHint);
          source = 'marks';
        }
      } else if ((resp as any).subtitleVttUrl || (resp as any).subtitleSrtUrl) {
        const base = lastBaseRef.current;
        const url = toAbsolute(base, (resp as any).subtitleVttUrl || (resp as any).subtitleSrtUrl!);
        if (url) {
          try {
            const r = await fetch(url);
            const txt = await r.text();
            nextWords = parseSimpleVttOrSrt(txt);
            source = 'subtitles';
          } catch {
            /* ignore; fallback later */
          }
        }
      }

      if (!nextWords.length) {
        const ex: ExtendedSpeakResp = resp as ExtendedSpeakResp;
        const vs =
          (resp as any).visemes ||
          (typeof robot.getVisemes === 'function' ? robot.getVisemes() : []);
        const plain = ssmlVisibleText(ex.ssml ?? ex.text ?? ex.rawText ?? '');
        const wordCount = plain ? plain.split(/\s+/).filter(Boolean).length : 0;

        // If we already know audio duration, use it. Otherwise rough-estimate.
        const durationHint =
          audioEl.current && Number.isFinite(audioEl.current.duration)
            ? audioEl.current.duration
            : Math.max(1.5, wordCount * 0.23); // ~230ms per word as a safe guess

        nextWords = vs?.length
          ? approximateFromVisemes(vs, plain)
          : spreadEvenly(plain, durationHint);

        source = 'fallback';
      }

      if (cancelled) return;

      const ex: ExtendedSpeakResp = resp as ExtendedSpeakResp;
      const sourceText = ex.ssml ?? ex.text ?? ex.rawText ?? '';

      nextWords = decorateTimingsFromSource(nextWords, sourceText);

      setWords(nextWords);
      setCurrentIndex(0);

      // Preferred audio URL
      let src: string | null = null;
      try {
        src = bestAudioUrl(lastBaseRef.current, resp);
      } catch {
        src = (resp as any).url ?? null;
      }
      setAudioUrl(src);

      // Load into element and retime if audio duration mismatches timing tail
      const a = audioEl.current;
      if (a && src) {
        if (a.src !== src) {
          a.src = src;
          try {
            a.load();
          } catch {}
        }

        // keep a tiny guard so we don't scale repeatedly for the same src
        const retimedForSrcRef = { current: '' as string };
        const adjustIfNeeded = () => {
          if (!nextWords.length) return;
          const dur = Number(a.duration || 0);
          const lastEnd = Number(nextWords[nextWords.length - 1]?.end || 0);
          if (!(Number.isFinite(dur) && dur > 0 && Number.isFinite(lastEnd) && lastEnd > 0)) return;

          // stricter retiming gates
          const TH_ABS = 0.05; // 50ms
          const TH_REL = 0.01; // 1%
          const gap = dur - lastEnd;
          const rel = Math.abs(gap) / Math.max(0.5, dur);

          if (retimedForSrcRef.current !== src && (Math.abs(gap) > TH_ABS || rel > TH_REL)) {
            const scale = dur / lastEnd;
            const scaled = nextWords.map((w) => ({
              text: w.text,
              start: (w.start ?? 0) * scale,
              end: (w.end ?? w.start ?? 0) * scale,
            }));
            setWords(scaled);
            setCurrentIndex(0);
            retimedForSrcRef.current = src;
          }

          // align persisted skew to first token (no UI lead)
          const firstStart = nextWords[0]?.start ?? 0;
          setSyncSkewMs(Math.round(-firstStart * 1000));
          // reset PLL anchors
          outLat0Ref.current = getApproxOutputLatencySec(audioCtxRef.current);
          anchorMediaRef.current = (a.currentTime || 0) - outLat0Ref.current;
          anchorWordRef.current = firstStart;
          microSkewRef.current = 0;
          microScaleRef.current = 1;
        };

        a.onloadedmetadata = adjustIfNeeded;
        a.ondurationchange = null;
        if (a.readyState >= 1 && Number.isFinite(a.duration) && a.duration > 0) adjustIfNeeded();
      }

      lastTimingSigRef.current = sig;
    };

    apply();
    return () => {
      cancelled = true;
    };
  }, [robot.data, syncSkewMs]);

  /* Public volume API */
  const setVolume = (v: number) => {
    const vv = clamp01(v);
    setVolumeState(vv);
    const a = audioEl.current;
    if (a) a.volume = vv;
    try {
      localStorage.setItem('classroomVolume', String(vv));
    } catch {}
  };

  return {
    // TTS actions
    speak,
    requestSpeech,
    clearForNewSession,

    // timing utilities
    setTime,
    getTimeForWord,
    durationFromWords,
    retimeEvenly,
    markEnded,

    // state
    loading: robot.loading,
    error: robot.error,

    // timings
    words,
    sentences: sentenceGroups,
    sentenceGroups,

    // playback
    isPlaying,
    currentIndex,
    play,
    pause,
    seekToWord,

    // media
    resumeAudioContext,
    audioUrl,
    endedTick,

    // volume
    volume,
    setVolume,

    // sync skew (persisted)
    syncSkewMs,
    setSyncSkewMs,
  };
}

/* ─────────────────────────────────────────────────────────
   Re-exports for tests/consumers
────────────────────────────────────────────────────────── */
export {
  parseSimpleVttOrSrt,
  approximateFromVisemes,
  spreadEvenly,
  groupWordsBySentence,
  indexAtTime,
  marksToTimings,
};
