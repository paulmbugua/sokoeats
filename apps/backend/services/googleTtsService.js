// apps/backend/services/googleTtsService.js
import crypto from 'node:crypto';
import textToSpeech from '@google-cloud/text-to-speech';

const DEBUG = process.env.DEBUG_TTS === '1';
const CACHE_VER = process.env.TTS_CACHE_VER || 'v1';
const dlog = (...a) => {
  if (DEBUG) console.log('[ttsSvc]', ...a);
};

// Optional de-echo feature flag (carried over from Azure version)
const DEECHO_TEXT = process.env.AZURE_TTS_DEECHO === '1';

// ─────────────────────────────────────────────────────────
// Google TTS client & config
// ─────────────────────────────────────────────────────────

const DEFAULT_VOICE = process.env.GOOGLE_TTS_VOICE || 'en-US-Wavenet-C';
const DEFAULT_LANG = process.env.GOOGLE_TTS_LANG || 'en-US';
const AUDIO_ENCODING = 'MP3';

// Google hard limit is 5000 bytes; stay under that
const MAX_TTS_INPUT_BYTES = 4800;

// Prefer v1beta1 if available (timepoint support is here)
const tts = textToSpeech?.v1beta1?.TextToSpeechClient
  ? new textToSpeech.v1beta1.TextToSpeechClient()
  : new textToSpeech.TextToSpeechClient();

// ─────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────

const byteLen = (s) => Buffer.byteLength(String(s || ''), 'utf8');

function parsePitch(pitch = '+0st') {
  const m = String(pitch).match(/(-?\d+(\.\d+)?)\s*st/i);
  return m ? Number(m[1]) : 0;
}

function parseRate(rate = '0%') {
  const m = String(rate).match(/(-?\d+(\.\d+)?)\s*%/);
  return m ? 1 + Number(m[1]) / 100 : 1.0;
}

function deriveLang(voiceName) {
  const v = String(voiceName || '').trim() || DEFAULT_VOICE;
  const parts = v.split('-');
  if (
    parts.length >= 2 &&
    /^[a-z]{2,3}$/i.test(parts[0]) &&
    /^[A-Z]{2}$/.test(parts[1])
  ) {
    return `${parts[0]}-${parts[1]}`;
  }
  return DEFAULT_LANG;
}

// Simple SSML tag stripper → plain text (for approx timings)
function stripTextFromSsml(ssml) {
  return String(ssml || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Optional de-echo (remove duplicated sentences)
function deEchoSentences(plain) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const parts = String(plain || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/);

  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i]?.trim();
    if (!cur) continue;
    const prev = out[out.length - 1] || '';
    const A = norm(prev);
    const B = norm(cur);

    if (A && A === B) continue;

    if (A && (A.includes(B) || B.includes(A))) {
      if (B.length > A.length) out[out.length - 1] = cur;
      continue;
    }

    out.push(cur);
  }
  return out.join(' ');
}

// Cache key over everything that affects audio bits
function makeKey({ voiceName, speakingRateMult, pitchSt, textOrSsml }) {
  const h = crypto.createHash('sha1');
  h.update(
    JSON.stringify({
      ver: CACHE_VER,
      voiceName,
      speakingRateMult,
      pitchSt,
      textOrSsml,
    }),
  );
  return h.digest('hex');
}

const wrapSpeak = (inner) => `<speak>${inner}</speak>`;
const unwrapSpeak = (s) =>
  String(s || '')
    .replace(/^\s*<speak[^>]*>/i, '')
    .replace(/<\/speak>\s*$/i, '');

// ─────────────────────────────────────────────────────────
// Chunking helpers (SSML + plain text)
// ─────────────────────────────────────────────────────────

/**
 * Split SSML into chunks that are each under maxBytes (including <speak> wrapper).
 * We:
 *  - strip the outer <speak>
 *  - split into tags vs text nodes
 *  - pack tokens into chunks <= maxBytes
 *  - wrap each chunk back in <speak>...</speak>
 */
function splitSsmlSmart(fullSsml, maxBytes = MAX_TTS_INPUT_BYTES) {
  const inner = unwrapSpeak(fullSsml.trim());
  const tokens = inner.split(/(<[^>]+>)/g).filter(Boolean);
  const chunks = [];
  let cur = '';
  const overhead = byteLen('<speak></speak>');

  const flush = () => {
    const t = cur.trim();
    if (t) chunks.push(wrapSpeak(t));
    cur = '';
  };

  for (const token of tokens) {
    const nextLen = byteLen(cur + token) + overhead;

    if (nextLen <= maxBytes) {
      cur += token;
      continue;
    }

    // Long text token (not a tag) → split on punctuation/whitespace
    if (!/^<[^>]+>$/.test(token) && byteLen(token) + overhead > maxBytes) {
      const parts = token.split(/(\.|\?|!|;|,|\s+)/g).filter(Boolean);
      let piece = '';
      for (const p of parts) {
        if (byteLen(cur + piece + p) + overhead <= maxBytes) {
          piece += p;
        } else {
          cur += piece;
          flush();
          piece = p;
        }
      }
      cur += piece;
      continue;
    }

    // Otherwise flush current and start new chunk with this token
    flush();
    if (byteLen(token) + overhead > maxBytes) {
      // Very rare: tag itself too large → force as its own chunk
      chunks.push(wrapSpeak(token));
    } else {
      cur = token;
    }
  }

  flush();
  return chunks;
}

/**
 * Split plain text into chunks under maxBytes, on word boundaries.
 */
function splitTextSmart(fullText, maxBytes = MAX_TTS_INPUT_BYTES) {
  const words = String(fullText || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [' '];

  const chunks = [];
  let cur = '';

  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (byteLen(candidate) > maxBytes) {
      if (cur) chunks.push(cur);
      // If single word is too large (very rare), force as its own chunk
      cur = byteLen(w) > maxBytes ? w.slice(0, maxBytes) : w;
    } else {
      cur = candidate;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ─────────────────────────────────────────────────────────
// Approximate timings + captions (no STT / aligner)
// ─────────────────────────────────────────────────────────

function approxFromPlain(plain, rateMult = 1) {
  const rawWords = String(plain || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  // Base ~220ms/word at 1.0x → ~270 wpm; adjust by rateMult
  const BASE_STEP_MS = 220;
  const step = Math.max(80, Math.round(BASE_STEP_MS / Math.max(rateMult, 0.25)));

  let t = 0;
  const wordsJson = rawWords.map((w, i) => {
    const obj = { i, t, w };
    t += step;
    return obj;
  });

  return { wordsJson };
}

// ─────────────────────────────────────────────────────────
// Core Google synth (chunked)  +  SSML_MARK timepoints
// ─────────────────────────────────────────────────────────

async function synthesizeGoogleAudio({
  ssml,
  plainText,
  voice,
  langCode,
  rateMult,
  pitchSt,
}) {
  const audioBuffers = [];
  const allMarks = []; // collect SSML_MARK timepoints across chunks

  if (ssml && String(ssml).trim().length) {
    // SSML path
    const fullSsml = ssml.trim();
    const ssmlBytes = byteLen(fullSsml);

    const ssmlChunks =
      ssmlBytes > MAX_TTS_INPUT_BYTES
        ? splitSsmlSmart(fullSsml, MAX_TTS_INPUT_BYTES)
        : [fullSsml];

    dlog('google synth (ssml)', {
      chunks: ssmlChunks.length,
      totalBytes: ssmlBytes,
    });

    for (let i = 0; i < ssmlChunks.length; i++) {
      const chunkSsml = ssmlChunks[i];

      const req = {
        input: { ssml: chunkSsml },
        voice: { name: voice, languageCode: langCode },
        audioConfig: {
          audioEncoding: AUDIO_ENCODING, // 'MP3'
          speakingRate: rateMult, // numeric (e.g. 0.93 for -7%)
          pitch: pitchSt, // numeric semitones
        },
        // Ask Google to return SSML <mark> timepoints
        enableTimePointing: ['SSML_MARK'],
      };

      try {
        const t1 = process.hrtime.bigint();
        const [resp] = await tts.synthesizeSpeech(req);

        // Collect timepoints, if any <mark> tags are present in SSML
        const marks = Array.isArray(resp.timepoints) ? resp.timepoints : [];
        if (marks.length) {
          dlog('google timepoints (sample)', marks.slice(0, 5));
          for (const m of marks) {
            allMarks.push({
              markName: m.markName,
              timeSeconds: m.timeSeconds,
              chunk: i, // optional: which chunk (0-based)
            });
          }
        }

        const b64 = resp.audioContent || '';
        const buf = Buffer.from(b64, 'base64');
        if (!buf.length) {
          throw Object.assign(new Error('TTS_EMPTY_AUDIO_CHUNK'), {
            code: 'TTS_EMPTY_AUDIO_CHUNK',
          });
        }

        audioBuffers.push(buf);

        dlog('chunk OK', {
          chunk: i + 1,
          of: ssmlChunks.length,
          bytes: buf.length,
          ms: Number(process.hrtime.bigint() - t1) / 1e6,
        });
      } catch (e) {
        console.error('[ttsSvc] GCP synth ERROR (ssml chunk)', {
          chunk: i + 1,
          of: ssmlChunks.length,
          name: e?.name,
          code: e?.code,
          message: e?.message,
          langCode,
          voice,
        });
        throw e;
      }
    }
  } else {
    // Plain text path (no SSML marks)
    const fullText = (plainText || ' ').trim();
    const textBytes = byteLen(fullText);

    const textChunks =
      textBytes > MAX_TTS_INPUT_BYTES
        ? splitTextSmart(fullText, MAX_TTS_INPUT_BYTES)
        : [fullText];

    dlog('google synth (text)', {
      chunks: textChunks.length,
      totalBytes: textBytes,
    });

    for (let i = 0; i < textChunks.length; i++) {
      const chunkText = textChunks[i];

      const req = {
        input: { text: chunkText },
        voice: { name: voice, languageCode: langCode },
        audioConfig: {
          audioEncoding: AUDIO_ENCODING,
          speakingRate: rateMult,
          pitch: pitchSt,
        },
      };

      try {
        const t1 = process.hrtime.bigint();
        const [resp] = await tts.synthesizeSpeech(req);
        const b64 = resp.audioContent || '';
        const buf = Buffer.from(b64, 'base64');
        if (!buf.length) {
          throw Object.assign(new Error('TTS_EMPTY_AUDIO_CHUNK'), {
            code: 'TTS_EMPTY_AUDIO_CHUNK',
          });
        }
        audioBuffers.push(buf);
        dlog('chunk OK', {
          chunk: i + 1,
          of: textChunks.length,
          bytes: buf.length,
          ms: Number(process.hrtime.bigint() - t1) / 1e6,
        });
      } catch (e) {
        console.error('[ttsSvc] GCP synth ERROR (text chunk)', {
          chunk: i + 1,
          of: textChunks.length,
          name: e?.name,
          code: e?.code,
          message: e?.message,
          langCode,
          voice,
        });
        throw e;
      }
    }
  }

  const audioBuffer = Buffer.concat(audioBuffers);
  if (!audioBuffer.length) {
    throw Object.assign(new Error('TTS_EMPTY_AUDIO'), { code: 'TTS_EMPTY_AUDIO' });
  }

  return {
    audioBuffer,
    timepoints: allMarks, // [] for plain text or SSML with no <mark>
  };
}

// ─────────────────────────────────────────────────────────
// Public: synthesizeTtsLocalFirst (simple + fast)
// Shape kept close to old version for controller compatibility
// ─────────────────────────────────────────────────────────

export async function synthesizeTtsLocalFirst({
  ssml,
  text,
  voiceName,
  speakingRate = '0%',
  pitch = '+0st',
}) {
  const t0 = process.hrtime.bigint();

  const voice = voiceName || DEFAULT_VOICE;
  const langCode = deriveLang(voice);
  const rateMult = parseRate(speakingRate);
  const pitchSt = parsePitch(pitch);

  // Build plain text for approximate timings
  const haveText = text && String(text).trim().length > 0;
  let plain = haveText ? String(text).trim() : stripTextFromSsml(ssml);

  if (DEECHO_TEXT && plain) {
    const cleaned = deEchoSentences(plain);
    if (cleaned && cleaned !== plain) plain = cleaned;
  }

  const textOrSsml = ssml || text || '';
  const cacheKey = makeKey({
    voiceName: voice,
    speakingRateMult: rateMult,
    pitchSt,
    textOrSsml,
  });

  dlog('begin', {
    voice,
    speakingRate,
    pitch,
    langCode,
    textLen: plain?.length || 0,
    ssmlLen: (ssml || '').length || 0,
    keyHead: cacheKey.slice(0, 8),
  });

  // No Cloudinary lookups here → faster
  const { wordsJson } = approxFromPlain(plain || text || '', rateMult);

  // Google synth in chunks (with SSML_MARK timepoints when SSML)
  const { audioBuffer, timepoints } = await synthesizeGoogleAudio({
    ssml,
    plainText: plain || text || '',
    voice,
    langCode,
    rateMult,
    pitchSt,
  });

  const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log('[ttsSvc] OUT', {
    keyHead: cacheKey.slice(0, 8),
    ms: Math.round(totalMs),
    bytes: audioBuffer.length,
    words: wordsJson.length,
    timepoints: Array.isArray(timepoints) ? timepoints.length : 0,
  });

  return {
    cached: false,            // we no longer use Cloudinary cache here
    cacheKey,
    mp3Buffer: audioBuffer,   // main payload
    wordsJson,                // approx timings for words
    visemesJson: [],          // still empty – can be filled in later if needed
    bookmarksJson: Array.isArray(timepoints) ? timepoints : [], // real SSML marks
    vttText: null,            // no VTT/SRT generation for speed
    srtText: null,
    ids: {
      audioId: cacheKey,
    },
  };
}

// ─────────────────────────────────────────────────────────
// Public: legacy synthesizeTtsWithVisemes
// Simple wrapper kept for compatibility if anything uses it.
// (NO Cloudinary upload here now – keep uploads in controllers)
// ─────────────────────────────────────────────────────────

export async function synthesizeTtsWithVisemes(opts) {
  const out = await synthesizeTtsLocalFirst(opts || {});
  return {
    urlPath: null,           // no direct URL; controller decides how to expose it
    subtitleVttUrl: null,
    subtitleSrtUrl: null,
    visemes: [],
    words: out.wordsJson || [],
    bookmarks: out.bookmarksJson || [],
    cacheKey: out.cacheKey,
    cached: out.cached === true,
    mp3Buffer: out.mp3Buffer,
  };
}

// ─────────────────────────────────────────────────────────
// Voice listing (for UI)
// ─────────────────────────────────────────────────────────

function normalizeVoices(list = []) {
  const arr = list.map((v) => ({
    name: v.name,
    languageCodes: Array.isArray(v.languageCodes) ? v.languageCodes : [],
    ssmlGender:
      v.ssmlGender || v.gender || 'SSML_VOICE_GENDER_UNSPECIFIED',
    naturalSampleRateHertz:
      v.naturalSampleRateHertz || v.sampleRateHertz || null,
  }));
  arr.sort((a, b) => {
    const la = (a.languageCodes[0] || '').localeCompare(
      b.languageCodes[0] || '',
    );
    if (la) return la;
    return a.name.localeCompare(b.name);
  });
  return arr;
}

export async function listGoogleVoices({
  languageCode,
  onlyWavenet = true,
  force = false,
} = {}) {
  // Simple in-memory cache
  if (!listGoogleVoices.__cache) {
    listGoogleVoices.__cache = { at: 0, list: [] };
  }
  const VOICES_TTL_MS = 12 * 60 * 60 * 1000;
  const now = Date.now();
  const cache = listGoogleVoices.__cache;

  if (!force && cache.list.length && now - cache.at < VOICES_TTL_MS) {
    let out = cache.list;
    if (languageCode)
      out = out.filter((v) => v.languageCodes.includes(languageCode));
    if (onlyWavenet) out = out.filter((v) => /wavenet/i.test(v.name));
    return out;
  }

  let resp;
  try {
    const req = {};
    if (languageCode) req.languageCode = languageCode;
    [resp] = await tts.listVoices(req);
  } catch (e) {
    console.error('[ttsSvc] listVoices ERROR', {
      code: e?.code,
      message: e?.message,
    });
    throw e;
  }

  const norm = normalizeVoices(resp?.voices || []);
  cache.at = now;
  cache.list = norm;

  let out = norm;
  if (languageCode)
    out = out.filter((v) => v.languageCodes.includes(languageCode));
  if (onlyWavenet) out = out.filter((v) => /wavenet/i.test(v.name));
  return out;
}

// Optional self-test: sanity-check that GCP TTS works
export async function ttsSelfTest(voiceName = DEFAULT_VOICE) {
  try {
    const [resp] = await tts.synthesizeSpeech({
      input: { text: 'This is a Google Text-to-Speech probe.' },
      voice: { name: voiceName, languageCode: deriveLang(voiceName) },
      audioConfig: { audioEncoding: AUDIO_ENCODING },
    });
    const ok = !!resp?.audioContent;
    console.log('[tts/selftest]', { voice: voiceName, ok });
    return ok;
  } catch (e) {
    console.warn('[tts/selftest] failed', {
      code: e?.code,
      msg: e?.message,
    });
    return false;
  }
}
