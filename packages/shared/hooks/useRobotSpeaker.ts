// packages/shared/hooks/useRobotSpeaker.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { speakRobot, SpeakReq, SpeakResp, Viseme } from '../api/ttsAvatarApi';




type State = SpeakResp | null;
const COOLDOWN_MS = 2500; // wait after any failure before trying again
const DEDUPE_WINDOW_MS = 10_000; // 10s grace for identical payloads
const NS = '[robotSpeaker]';

// ── DEDUPE + HASH HELPERS (module scope) ─────────────────────────────────────
async function sha1Hex(str: string): Promise<string> {
  // Prefer WebCrypto; safe fallback for RN/Node
  try {
    const subtle = (globalThis as any)?.crypto?.subtle;
    if (subtle?.digest) {
      const buf = await subtle.digest('SHA-1', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {}
  // FNV-1a 32-bit fallback (short, but stable)
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

const inflightByHash = new Map<string, Promise<SpeakResp>>();
let lastHash = '';
let lastResp: SpeakResp | null = null;

async function speakWithDedupe(
  backendBase: string | URL,
  payload: SpeakReq,
  token?: string,
  timeoutMs?: number,
  signal?: AbortSignal
): Promise<SpeakResp> {
  const rate  = payload.rate  ?? '0%';
  const pitch = payload.pitch ?? '+0st';
  const voice = String(payload.voiceName || '');
  const ssml  = String(payload.ssml || '');
  const hash  = await sha1Hex(`${voice}|${rate}|${pitch}|${ssml}`);

  // Fast return: identical to last success
  if (hash === lastHash && lastResp) return lastResp;

  // Coalesce concurrent identical calls
  const pending = inflightByHash.get(hash);
  if (pending) return pending;

  const p = (async () => {
    const data = await speakRobot(backendBase, payload, token, { timeoutMs, signal });
    lastHash = hash;
    lastResp = data ?? null;
    return data;
  })().finally(() => inflightByHash.delete(hash));

  inflightByHash.set(hash, p);
  return p;
}


// Best-effort extractor for { error: "CODE" } from backend errors (or wrapped errors)
function extractErrorCode(err: any): string | undefined {
  if (!err) return undefined;
  if (typeof err.code === 'string') return err.code;
  if (typeof err.body === 'string') {
    try { const j = JSON.parse(err.body); if (typeof j?.error === 'string') return j.error; } catch {}
  }
  const msg = String(err.message || '');
  const m = msg.match(/"error"\s*:\s*"([^"]+)"/);
  if (m?.[1]) return m[1];
  try {
    const start = msg.indexOf('{');
    if (start >= 0) {
      const maybeJson = JSON.parse(msg.slice(start));
      if (typeof maybeJson?.error === 'string') return maybeJson.error;
    }
  } catch {}
  return undefined;
}

function toFriendlyError(code?: string, fallback = 'Text-to-speech failed. Please retry.') {
  switch (code) {
    case 'EMPTY_TEXT':
      return 'Please enter some text to synthesize.';
    case 'AZURE_EMPTY_AUDIO':
    case 'TTS_EMPTY_AUDIO_AFTER_RETRY':
      return 'Speech service returned empty audio. Try again in a moment.';
    case 'SPEAK_API_ERROR':
    case 'SYNTH_FAILED':
      return 'Speech service had a temporary issue. Please retry.';
    case 'UNEXPECTED':
      return 'Unexpected error while generating speech.';
    default:
      return fallback;
  }
}

export function useRobotSpeaker() {
  const [data, setData] = useState<State>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep visemes in a ref for fast lookup (component re-renders not required)
  const visemesRef = useRef<Viseme[]>([]);

  // Concurrency / lifecycle
  const inflightRef = useRef(false);
  const lastFailAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const callSeqRef = useRef(0); // increments per request to ignore stale responses

  // Dedupe tracking: last successful body signature + when it succeeded
  const lastBodySigRef = useRef<string>('');
  const lastOkAtRef = useRef(0);

  const setFromResponse = useCallback((resp: SpeakResp, callId: number) => {
    // Drop stale results (in case an older request resolves after a newer one)
    if (callId !== callSeqRef.current) {
      // eslint-disable-next-line no-console
      console.debug(NS, 'DROP stale response', { callId, current: callSeqRef.current });
      return;
    }
    const keys = resp ? Object.keys(resp).sort() : [];
    // eslint-disable-next-line no-console
    console.debug(NS, 'SET response', {
      callId,
      keys,
      wordsLen: (resp as any)?.words?.length ?? 0,
      visemesLen: (resp as any)?.visemes?.length ?? 0,
      hasVttInline: !!(resp as any)?.vtt,
      hasSrtInline: !!(resp as any)?.srt,
      hasSubVttUrl: !!(resp as any)?.subtitleVttUrl,
      hasSubSrtUrl: !!(resp as any)?.subtitleSrtUrl,
      url: !!(resp as any)?.url,
      streamPath: (resp as any)?.streamPath || null,
      cached: (resp as any)?.cached ?? null,
    });
    if (resp.visemes?.length) visemesRef.current = resp.visemes;
    setData(resp);
  }, []);

  /**
   * Request speech from backend.
   * @param backendUrl e.g. "http://localhost:4000" or new URL("https://api.example.com")
   * @param body Speak payload (text/ssml/voiceName/rate/pitch)
   * @param token Optional JWT for Authorization header
   * @param timeoutMs Optional request timeout (default 30s)
   */
  const requestSpeech = useCallback(
    async (backendUrl: string | URL, body: SpeakReq, token?: string, timeoutMs = 30_000) => {
      const ssmlLen = body?.ssml ? String(body.ssml).length : 0;
      const textLen = body?.text ? String(body.text).length : 0;

     

      // Cooldown after a failure
      const sinceFail = Date.now() - lastFailAtRef.current;
      if (sinceFail < COOLDOWN_MS) {
        // eslint-disable-next-line no-console
        console.debug(NS, 'COOLDOWN skip', { remainingMs: COOLDOWN_MS - sinceFail });
        return;
      }

      // Create a cheap, stable signature without storing raw SSML
      const bodySig = JSON.stringify({
        v: body?.voiceName || '',
        r: body?.rate || '',
        p: body?.pitch || '',
        // only lengths here to avoid huge strings in memory
        sl: String(body?.ssml || '').length,
        tl: String(body?.text || '').length,
      });

      // If identical to the last successful request and still fresh, skip
      const now = Date.now();
      if (
        bodySig === lastBodySigRef.current &&
        data &&
        now - lastOkAtRef.current < DEDUPE_WINDOW_MS
      ) {
        // eslint-disable-next-line no-console
        console.debug(NS, 'DEDUPE skip: same payload within window');
        return;
      }

      const callId = ++callSeqRef.current;
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // eslint-disable-next-line no-console
      console.debug(NS, 'REQUEST start', {
        callId,
        base: String(backendUrl),
        voice: body?.voiceName || null,
        ssmlLen,
        textLen,
        timeoutMs,
      });

      const t0 = performance.now();
      setLoading(true);
      setError(null);
      inflightRef.current = true;

      try {
       const resp = await speakWithDedupe(backendUrl, body, token, timeoutMs, ctrl.signal);


        const t1 = performance.now();
        // eslint-disable-next-line no-console
        console.debug(NS, 'REQUEST ok', {
          callId,
          ms: Math.round(t1 - t0),
          hasResp: !!resp,
        });

        setFromResponse(resp, callId);

        // Mark this signature as the last successful one
        lastBodySigRef.current = bodySig;
        lastOkAtRef.current = Date.now();
      } catch (e: any) {
        // If we aborted due to a new call/unmount, don't surface an error
        if (e?.name === 'AbortError') {
          // eslint-disable-next-line no-console
          console.debug(NS, 'REQUEST aborted', { callId, reason: e?.message || 'AbortError' });
          return;
        }

        lastFailAtRef.current = Date.now();
        const code = extractErrorCode(e);
        const friendly = toFriendlyError(code, e?.message || '');
        // eslint-disable-next-line no-console
        console.warn(NS, 'REQUEST error', {
          callId,
          code,
          message: e?.message || String(e),
        });
        setError(friendly);
      } finally {
        if (callId === callSeqRef.current) {
          inflightRef.current = false;
          setLoading(false);
        }
        // eslint-disable-next-line no-console
        console.debug(NS, 'REQUEST end', { callId, active: callSeqRef.current });
      }
    },
    [data, setFromResponse]
  );

  /** Convenience alias for requestSpeech */
  const speak = useCallback(
    async (backendUrl: string | URL, opts: SpeakReq, token?: string, timeoutMs?: number) =>
      requestSpeech(backendUrl, opts, token, timeoutMs),
    [requestSpeech]
  );

  /** Get the current viseme for t (seconds). Returns the last viseme whose time <= t (binary search). */
  const getCurrentViseme = useCallback((tSec: number) => {
    const arr = visemesRef.current;
    if (!arr.length) return undefined;
    let lo = 0, hi = arr.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].time <= tSec) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return arr[ans];
  }, []);

  /** ✅ Expose current visemes array for consumers (e.g., useWordSync fallback on cache hits). */
  const getVisemes = useCallback(() => visemesRef.current, []);

  const reset = useCallback(() => {
    // eslint-disable-next-line no-console
    console.debug(NS, 'RESET');
    // abortRef.current?.abort('reset');
    setData(null);
    setError(null);
    setLoading(false);
    visemesRef.current = [];
    lastFailAtRef.current = 0;
    inflightRef.current = false;
    // Clear dedupe so next request with same payload will go through
    lastBodySigRef.current = '';
    lastOkAtRef.current = 0;
  }, []);

  // Abort on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line no-console
      console.debug(NS, 'UNMOUNT abort');
      // abortRef.current?.abort('unmount');
    };
  }, []);

  return useMemo(
    () => ({
      data,              // SpeakResp | null
      loading,           // boolean
      error,             // string | null (human-friendly)
      requestSpeech,     // (backendUrl, body, token?, timeoutMs?) => Promise<void>
      speak,             // alias
      getCurrentViseme,  // (t: number) => Viseme | undefined
      getVisemes,        // () => Viseme[]
      reset,             // () => void
    }),
    [data, loading, error, requestSpeech, speak, getCurrentViseme, getVisemes, reset]
  );
}
