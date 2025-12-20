// packages/shared/api/ttsAvatarApi.ts

// -------------------- Types --------------------
export type Viseme = { time: number; id: number };
export type WordTiming = { start: number; end: number; text: string };
export type Bookmark = { time: number; text?: string };

export type SpeakReq = {
  ssml?: string;
  text?: string;
  voiceName?: string;
  rate?: string; // e.g. "0%", "+10%", "-15%"
  pitch?: string; // e.g. "0st", "+2st", "-3st"
};

export type SpeakResp = {
  url: string; // Cloudinary URL (or absolute)
  streamPath?: string; // e.g. "/api/ttsAvatar/stream/<cacheKey>"
  cacheKey: string;
  cached: boolean;

  visemes?: Viseme[];
  words?: WordTiming[];
  bookmarks?: Bookmark[];

  // inline text (when server sends them)
  vtt?: string;
  srt?: string;

  // url variants (when served from cache/CDN)
  subtitleVttUrl?: string;
  subtitleSrtUrl?: string;
};

export type TtsVoiceInfo = {
  name: string;
  languageCodes: string[];
  ssmlGender: 'MALE' | 'FEMALE' | 'NEUTRAL' | 'SSML_VOICE_GENDER_UNSPECIFIED' | string;
  naturalSampleRateHertz?: number | null;
};

// -------------------- Helpers --------------------
export function normalizeBase(backendUrl: string | URL | null | undefined) {
  if (!backendUrl) throw new Error('Missing backendUrl');
  const s = backendUrl instanceof URL ? backendUrl.toString() : String(backendUrl);
  return s.replace(/\/+$/, '');
}

/** Join base + relative safely */
function toAbsolute(base: string, maybeRelative?: string) {
  if (!maybeRelative) return '';
  // If it's already absolute (http/https), return as-is
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  // Ensure single slash between base and path
  return `${normalizeBase(base)}${maybeRelative.startsWith('/') ? '' : '/'}${maybeRelative}`;
}

/** Build the stream proxy path from a cacheKey (fallback if server didn't include streamPath) */
export function buildStreamPath(cacheKey: string) {
  const id = (cacheKey || '').replace(/^\/+|\/+$/g, '');
  return `/api/ttsAvatar/stream/${id}`;
}

export class SpeakApiError extends Error {
  code?: string;
  status: number;
  statusText: string;
  body?: string;
  constructor(message: string, status: number, statusText: string, body?: string, code?: string) {
    super(message);
    this.name = 'SpeakApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    if (code) this.code = code;
  }
}

type SpeakOptions = {
  /** Request timeout in ms (default 30000) */
  timeoutMs?: number;
  /** Optionally pass your own AbortSignal to chain cancellation */
  signal?: AbortSignal;
};

/** Create a cross-env AbortError for controller.abort(reason) */
function makeAbortError(message = 'Timeout'): any {
  try {
    // Browser / modern runtimes

    return new DOMException(message, 'AbortError');
  } catch {
    const err: any = new Error(message);
    err.name = 'AbortError';
    return err;
  }
}

// -------------------- API --------------------
/**
 * POST /api/ttsAvatar/speak
 * Returns MP3 url + (optionally) visemes & captions.
 */
export async function speakRobot(
  backendUrl: string | URL,
  body: SpeakReq,
  token?: string,
  options?: SpeakOptions
): Promise<SpeakResp> {
  const base = normalizeBase(backendUrl);
  const url = `${base}/api/ttsAvatar/speak`;

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 30_000;

  // If caller provided a signal, cancel our controller when theirs aborts
  if (options?.signal) {
    if ((options.signal as AbortSignal).aborted) {
      controller.abort((options.signal as any).reason);
    } else {
      options.signal.addEventListener(
        'abort',
        () => controller.abort((options.signal as any).reason),
        { once: true }
      );
    }
  }

  const timeoutId = setTimeout(() => controller.abort(makeAbortError('Timeout')), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await res.text().catch(() => '');
  let parsed: any = undefined;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  if (text && isJson) {
    try {
      parsed = JSON.parse(text);
    } catch {
      /* ignore parse errors */
    }
  }

  if (!res.ok) {
    const err = new SpeakApiError(
      `speakRobot failed: ${res.status} ${res.statusText}`,
      res.status,
      res.statusText,
      text,
      parsed?.error
    );
    throw err;
  }

  // If server returned non-JSON (shouldn't), still avoid crashing
  return (parsed ?? {}) as SpeakResp;
}

/**
 * Pick the best audio URL to hand to <audio>, preferring the local proxy stream when available.
 * Falls back to building a stream path from cacheKey if server didn’t include one,
 * and finally to the direct Cloudinary `url`.
 */
export function bestAudioUrl(backendUrl: string | URL, resp: SpeakResp): string {
  const base = normalizeBase(backendUrl);
  if (resp.streamPath) return toAbsolute(base, resp.streamPath);
  if (resp.cacheKey) return toAbsolute(base, buildStreamPath(resp.cacheKey));
  return resp.url;
}

export async function listTtsVoices(
  backendBase: string | URL,
  opts?: { lang?: string; onlyWavenet?: boolean; token?: string; timeoutMs?: number }
): Promise<TtsVoiceInfo[]> {
  const base = String(backendBase).replace(/\/+$/, '');
  const u = new URL(`${base}/api/ttsAvatar/voices`);
  if (opts?.lang) u.searchParams.set('lang', opts.lang);
  if (opts?.onlyWavenet !== false) u.searchParams.set('onlyWavenet', '1');
  else u.searchParams.set('onlyWavenet', '0');

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), Math.max(10_000, opts?.timeoutMs || 10_000));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;

  try {
    const r = await fetch(u.toString(), { method: 'GET', headers, signal: ctrl.signal });
    if (!r.ok) throw new Error(`listTtsVoices HTTP ${r.status}`);
    const j = (await r.json()) as { voices?: TtsVoiceInfo[] };
    return Array.isArray(j.voices) ? j.voices : [];
  } finally {
    clearTimeout(to);
  }
}
