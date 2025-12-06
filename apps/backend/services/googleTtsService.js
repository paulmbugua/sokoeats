// apps/backend/services/googleTtsService.js
import crypto from 'node:crypto';
import textToSpeech from '@google-cloud/text-to-speech';
import { v2 as cloudinary } from 'cloudinary';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { simpleAlign } from './simpleAlignerService.js';

// ─────────────────────────────────────────────────────────
const thisFile = basename(fileURLToPath(import.meta.url));
console.info('[ttsSvc] VERSION wordmarks-v2', { file: thisFile, pid: process.pid });

let __voicesCache = { at: 0, list: [] };
const VOICES_TTL_MS = 12 * 60 * 60 * 1000;

const DEFAULT_VOICE  = process.env.GOOGLE_TTS_VOICE || 'en-US-Wavenet-C';
const DEFAULT_LANG   = process.env.GOOGLE_TTS_LANG  || 'en-US';
const AUDIO_ENCODING = 'MP3';
const MAX_SSML_BYTES = 3800;

// Prefer v1beta1 when available
const tts = textToSpeech?.v1beta1?.TextToSpeechClient
  ? new textToSpeech.v1beta1.TextToSpeechClient()
  : new textToSpeech.TextToSpeechClient();

// ─────────────────────────────────────────────────────────
// SSML helpers (Azure → GCP normalization)
// ─────────────────────────────────────────────────────────

/**
 * Strip Azure / Amazon extras + generic cleanup.
 */
function sanitizeForGoogle(ssmlInner) {
  let s = String(ssmlInner || '');
  // Strip Azure mstts & Amazon tags and generic <voice> wrappers
  s = s.replace(/<\/?mstts:[^>]*>/gi, '');
  s = s.replace(/<\/?amazon:[^>]*>/gi, '');
  s = s.replace(/<\/?voice[^>]*>/gi, '');
  s = s.replace(/\s+\>/g, '>').replace(/\<\s+/g, '<');
  return s;
}

/**
 * Convert Azure-style SSML to something GCP likes:
 * - <bookmark mark="..."/> → <mark name="..."/>
 * - Remove xmlns:mstts + mstts:* tags
 */
function toGcpSsml(ssml) {
  if (!ssml) return ssml;
  let out = String(ssml);

  // Azure bookmark → GCP <mark name="..."/>
  out = out.replace(
    /<bookmark\s+mark="([^"]+)"\s*\/>/gi,
    '<mark name="$1"/>'
  );

  // Strip Azure mstts namespace + tags (defensive; GCP usually ignores unknowns)
  out = out.replace(/\s+xmlns:mstts="[^"]*"/gi, '');
  out = out.replace(/<\/?mstts:[^>]+>/gi, '');

  return out;
}

const byteLen = (s) => Buffer.byteLength(s, 'utf8');
const wrapSpeak = (inner) => `<speak>${inner}</speak>`;
const unwrapSpeak = (s) =>
  String(s || '').replace(/^\s*<speak[^>]*>/i, '').replace(/<\/speak>\s*$/i, '');

// ─────────────────────────────────────────────────────────
// Param parsing
// ─────────────────────────────────────────────────────────
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
  if (parts.length >= 2 && /^[a-z]{2,3}$/i.test(parts[0]) && /^[A-Z]{2}$/.test(parts[1])) {
    return `${parts[0]}-${parts[1]}`;
  }
  return DEFAULT_LANG;
}

async function cloudinaryHas(publicId) {
  try {
    await cloudinary.api.resource(`tts/${publicId}`, { resource_type: 'video' });
    return true;
  } catch {
    return false;
  }
}

function makeKey({ voiceName, speakingRate, pitch, textOrSsml }) {
  const h = crypto.createHash('sha1');
  h.update(JSON.stringify({ voiceName, speakingRate, pitch, textOrSsml }));
  return h.digest('hex');
}

function normalizeVoices(list = []) {
  const arr = list.map((v) => ({
    name: v.name,
    languageCodes: Array.isArray(v.languageCodes) ? v.languageCodes : [],
    ssmlGender: v.ssmlGender || v.gender || 'SSML_VOICE_GENDER_UNSPECIFIED',
    naturalSampleRateHertz: v.naturalSampleRateHertz || v.sampleRateHertz || null,
  }));
  arr.sort((a, b) => {
    const la = (a.languageCodes[0] || '').localeCompare(b.languageCodes[0] || '');
    if (la) return la;
    return a.name.localeCompare(b.name);
  });
  return arr;
}

// ─────────────────────────────────────────────────────────
// Mark injection
// ─────────────────────────────────────────────────────────

/**
 * Inject <mark name="w#"/> in *text nodes only* after:
 *  - Normalizing Azure → GCP SSML
 *  - Stripping Azure / Amazon / voice tags
 */
function injectMarksIntoSsml(ssml) {
  const raw = toGcpSsml(ssml.trim());
  const inner = sanitizeForGoogle(unwrapSpeak(raw));
  const tokens = inner.split(/(<[^>]+>)/g).filter(Boolean);
  const wordRe = /([A-Za-z0-9]+(?:[’'\-][A-Za-z0-9]+)*)/g;
  let idx = 0;
  const words = [];

  const out = tokens
    .map((tok) => {
      // leave tags untouched
      if (/^<[^>]+>$/.test(tok)) return tok;

      // inject <mark name="w#"/> only into text nodes
      return tok.replace(wordRe, (m) => {
        const mark = `<mark name="w${idx}"/>`;
        words.push(m);
        idx++;
        return `${mark}${m}`;
      });
    })
    .join('');

  return { ssml: wrapSpeak(out), words };
}

// ─────────────────────────────────────────────────────────
// Chunking helpers
// ─────────────────────────────────────────────────────────

function splitSsmlSmart(fullSsml, maxBytes = MAX_SSML_BYTES) {
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
    if (!/^<[^>]+>$/.test(token) && byteLen(token) + overhead > maxBytes) {
      const parts = token.split(/(\.|\?|!|;|,|\s+)/g).filter(Boolean);
      let piece = '';
      for (const p of parts) {
        if (byteLen(cur + piece + p) + overhead <= maxBytes) piece += p;
        else {
          cur += piece;
          flush();
          piece = p;
        }
      }
      cur += piece;
      continue;
    }
    flush();
    if (byteLen(token) + overhead > maxBytes) chunks.push(wrapSpeak(token));
    else cur = token;
  }
  flush();

  const merged = [];
  for (const c of chunks) {
    if (!merged.length) {
      merged.push(c);
      continue;
    }
    const last = merged[merged.length - 1];
    if (byteLen(last) + byteLen(unwrapSpeak(c)) <= maxBytes - 64) {
      merged[merged.length - 1] = wrapSpeak(unwrapSpeak(last) + unwrapSpeak(c));
    } else merged.push(c);
  }
  return merged;
}

// ─────────────────────────────────────────────────────────
// Timepoints helpers
// ─────────────────────────────────────────────────────────

function timepointsToWords(allTps, wordsList) {
  const out = [];
  for (const tp of allTps || []) {
    const name = String(tp.markName || tp.timepointName || '').trim();
    if (!name || name[0] !== 'w') continue;
    const i = Number(name.slice(1));
    if (Number.isFinite(i) && wordsList[i] != null) {
      out.push({ i, t: Math.round((tp.timeSeconds || 0) * 1000), w: wordsList[i] });
    }
  }
  out.sort((a, b) => a.i - b.i);
  let last = -1;
  for (const w of out) {
    if (w.t < last) w.t = last;
    last = w.t;
  }
  return out;
}

const approxTimings = (words, rateMult = 1) => {
  const STEP = Math.max(80, Math.round(190 / Math.max(rateMult, 0.25)));
  let t = 0;
  return words.map((w, i) => {
    const o = { i, t, w };
    t += STEP;
    return o;
  });
};

// ─────────────────────────────────────────────────────────
// Proper enum for enableTimePointing
// ─────────────────────────────────────────────────────────

const { protos } = textToSpeech;

// Try v1beta1 first, then v1, then fall back to literal 1 (SSML_MARK)
const SSML_MARK_ENUM =
  protos?.google?.cloud?.texttospeech?.v1beta1?.SynthesizeSpeechRequest?.TimepointType?.SSML_MARK ??
  protos?.google?.cloud?.texttospeech?.v1?.SynthesizeSpeechRequest?.TimepointType?.SSML_MARK ??
  1;

// ─────────────────────────────────────────────────────────
// TTS main entry
// ─────────────────────────────────────────────────────────
export async function synthesizeTtsLocalFirst({
  ssml,
  text,
  voiceName,
  speakingRate,
  pitch,
  wantTimepoints = true,
}) {
  const t0 = process.hrtime.bigint();

  const voice    = voiceName || DEFAULT_VOICE;
  const langCode = deriveLang(voice);
  const rateMult = parseRate(speakingRate);
  const pitchSt  = parsePitch(pitch);

  // Build input SSML + words list
  let inputSSML, wordsList = null;
  if (ssml) {
    if (wantTimepoints) {
      const injected = injectMarksIntoSsml(ssml);
      inputSSML = injected.ssml;
      wordsList = injected.words;
    } else {
      // still normalize Azure → GCP even if we don't want timepoints
      inputSSML = toGcpSsml(ssml);
    }
  } else if (text) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    const marked = words.map((w, i) => `<mark name="w${i}"/>${w}`).join(' ');
    inputSSML = `<speak>${marked}</speak>`;
    wordsList = wantTimepoints ? words : null;
  } else {
    inputSSML = `<speak></speak>`;
  }

  const cacheKey = makeKey({
    voiceName: voice,
    speakingRate: rateMult,
    pitch: pitchSt,
    textOrSsml: inputSSML,
  });

  console.log('[ttsSvc] IN', {
    ssmlLen: inputSSML.length,
    voice,
    langCode,
    rateMult,
    pitchSt,
    keyHead: cacheKey.slice(0, 8),
  });

  const already = await cloudinaryHas(cacheKey);
  const cdnUrlCached = already
    ? cloudinary.url(`tts/${cacheKey}.mp3`, { resource_type: 'video', secure: true })
    : null;

  // Cached: align (if needed) and return a URL
  if (already) {
    let wordsJson = null;

    if (wantTimepoints && (wordsList?.length || 0) > 0) {
      const plain = wordsList.join(' ');
      const aligned = await simpleAlign({
        audioBuffer: undefined,
        audioUrl: cdnUrlCached || undefined,
        text: plain,
        lang: langCode || 'en-US',
      });

      wordsJson =
        Array.isArray(aligned) && aligned.length
          ? aligned
          : approxTimings(wordsList, rateMult);
    }

    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log('[ttsSvc] OUT (cached)', {
      cached: true,
      keyHead: cacheKey.slice(0, 8),
      ms: Math.round(ms),
      chunks: 0,
      marksInFull: (inputSSML.match(/<mark\s+name="/gi) || []).length,
      wordsOut: wordsJson?.length || 0,
    });

    return {
      cached: true,
      cacheKey,
      cdnUrl: cdnUrlCached,
      mp3Buffer: undefined,
      wordsJson,
      visemesJson: null,
      bookmarksJson: null,
      vttText: null,
      srtText: null,
    };
  }

  // Not cached → synthesize
  const ssmlBytes = byteLen(inputSSML);
  const chunks = ssmlBytes > MAX_SSML_BYTES ? splitSsmlSmart(inputSSML, MAX_SSML_BYTES) : [inputSSML];
  if (chunks.length > 1) console.log('[ttsSvc] CHUNK', { count: chunks.length, totalBytes: ssmlBytes });

  const markCountAll = (inputSSML.match(/<mark\s+name="/gi) || []).length;
  if (wantTimepoints && !markCountAll) {
    console.warn(
      '[ttsSvc] no <mark> found after injection; timepoints unavailable → align/approx later'
    );
  }

  // If there are *zero* marks in the entire SSML, we really can't get timepoints.
  const forceNoTimepoints = wantTimepoints && !markCountAll;

  // Just log per-chunk marks; don't disable timepoints if a chunk has 0 marks.
  if (wantTimepoints && markCountAll) {
    chunks.forEach((c, k) => {
      const mc = (c.match(/<mark\s+name="/gi) || []).length;
      console.debug('[ttsSvc] chunk marks', {
        chunk: k + 1,
        of: chunks.length,
        marks: mc,
      });
    });
  }

  const allChunkBuffers = [];
  const collectedWords = [];
  let offsetMs = 0;
  let wordsSeen = 0; // global counter

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];

    // Normalize chunk SSML for GCP (bookmark → mark, strip mstts, etc.)
    const ssmlForGcp = toGcpSsml(c);

    const req = {
      input: { ssml: ssmlForGcp },
      voice: { name: voice, languageCode: langCode },
      audioConfig: {
        audioEncoding: AUDIO_ENCODING,
        speakingRate: rateMult,
        pitch: pitchSt,
      },
      // ✅ enableTimePointing MUST be at the top level, not in audioConfig
      enableTimePointing:
        wantTimepoints && !forceNoTimepoints ? [SSML_MARK_ENUM] : undefined,
    };

    console.debug('[ttsSvc] request flags', {
      chunk: i + 1,
      of: chunks.length,
      hasMarks: /<mark\s+name=/i.test(ssmlForGcp),
      timepointFlag: req.enableTimePointing,
      client: tts.constructor?.name || 'TextToSpeechClient',
    });

    const t1 = process.hrtime.bigint();
    let resp;
    try {
      [resp] = await tts.synthesizeSpeech(req);
    } catch (e) {
      console.error('[ttsSvc] GCP synth ERROR', {
        chunk: i + 1,
        of: chunks.length,
        name: e?.name,
        code: e?.code,
        message: e?.message,
        langCode,
        voice,
      });
      throw e;
    }
    const ms = Number(process.hrtime.bigint() - t1) / 1e6;

    const b64 = resp.audioContent || '';
    const buf = Buffer.from(b64, 'base64');
    const tps = Array.isArray(resp.timepoints) ? resp.timepoints : [];
    const marksInChunk = (c.match(/<mark\s+name="/gi) || []).length;

    const approxStepMs = Math.max(80, Math.round(190 / Math.max(rateMult, 0.25)));
    let stepForThisChunk = approxStepMs;

    console.debug('[ttsSvc] timepoints returned', tps.length || 0);
    console.log('[ttsSvc] GCP synth OK', {
      chunk: i + 1,
      of: chunks.length,
      ms: Math.round(ms),
      bytes: buf.length,
      timepoints: tps.length,
    });

    if (!forceNoTimepoints && wantTimepoints && tps.length) {
      const local = timepointsToWords(tps, wordsList || []);

      // extra debug: only for first chunk
      if (i === 0) {
        console.log('[ttsSvc] sample local timepoints', local.slice(0, 5));
      }

      const shifted = local.map((w) => ({ ...w, t: w.t + offsetMs }));
      collectedWords.push(...shifted);

      const last = tps[tps.length - 1];
      if (last && Number.isFinite(last.timeSeconds)) {
        const chunkDurMs = Math.round(last.timeSeconds * 1000);
        if (marksInChunk > 0) {
          stepForThisChunk = Math.max(50, Math.round(chunkDurMs / marksInChunk));
        }
        offsetMs += chunkDurMs;
      }
      wordsSeen += marksInChunk;
    } else if (wantTimepoints && marksInChunk > 0 && (wordsList?.length || 0) > 0) {
      const baseI = wordsSeen;
      const wordsForChunk = [];
      for (let k = 0; k < marksInChunk; k++) {
        const iGlobal = baseI + k;
        if (!wordsList[iGlobal]) break;
        wordsForChunk.push({
          i: iGlobal,
          t: offsetMs + k * stepForThisChunk,
          w: wordsList[iGlobal],
        });
      }
      collectedWords.push(...wordsForChunk);
      offsetMs += stepForThisChunk * marksInChunk;
      wordsSeen += marksInChunk;
    }

    allChunkBuffers.push(buf);
  }

  let mp3Buffer = Buffer.concat(allChunkBuffers);
  console.log('[ttsSvc] buffer', { bytes: mp3Buffer.length });

  // Upload → if success, return URL; if fail, keep mp3Buffer for controller
  let finalCdnUrl = null;
  try {
    const uploadedUrl = await new Promise((resolve, reject) => {
      const up = cloudinary.uploader.upload_stream(
        { public_id: `tts/${cacheKey}`, resource_type: 'video', format: 'mp3', overwrite: true },
        (err, res) => (err ? reject(err) : resolve(res?.secure_url || null))
      );
      up.end(mp3Buffer);
    });
    if (uploadedUrl) {
      finalCdnUrl = uploadedUrl;
      console.log('[ttsSvc] upload OK', { key: cacheKey.slice(0, 8) });
    } else {
      console.warn('[ttsSvc] upload returned no secure_url');
    }
  } catch (e) {
    console.error('[ttsSvc] Cloudinary upload failed', e?.message || e);
  }

  // Timings: Google SSML timepoints → simpleAlign → approx
  let wordsJson = wantTimepoints && collectedWords.length
    ? collectedWords.sort((a, b) => a.i - b.i)
    : null;

  if (wantTimepoints && (!wordsJson || wordsJson.length === 0)) {
    const plain =
      (wordsList && wordsList.length)
        ? wordsList.join(' ')
        : unwrapSpeak(inputSSML);

    const aligned = await simpleAlign({
      audioBuffer: finalCdnUrl ? undefined : mp3Buffer,
      audioUrl: finalCdnUrl || undefined,
      text: plain,
      lang: langCode || 'en-US',
    });

    if (Array.isArray(aligned) && aligned.length) {
      wordsJson = aligned;
    }
  }

  // Final fallback: evenly-spaced timings
  if (!wordsJson || wordsJson.length === 0) {
    wordsJson =
      (wantTimepoints && wordsList?.length)
        ? approxTimings(wordsList, rateMult)
        : null;
  }

  const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log('[ttsSvc] OUT', {
    cached: false,
    keyHead: cacheKey.slice(0, 8),
    ms: Math.round(totalMs),
    chunks: chunks.length,
    marksInFull: markCountAll,
    wordsOut: wordsJson?.length || 0,
    haveUrl: !!finalCdnUrl,
    haveBuf: !!mp3Buffer?.length,
  });

  // Only drop the buffer when we succeeded to upload.
  return {
    cached: false,
    cacheKey,
    cdnUrl: finalCdnUrl || undefined,
    mp3Buffer: finalCdnUrl ? undefined : mp3Buffer, // keep buffer if no URL
    wordsJson,
    visemesJson: null,
    bookmarksJson: null,
    vttText: null,
    srtText: null,
  };
}

// ─────────────────────────────────────────────────────────
// Voice listing
// ─────────────────────────────────────────────────────────
export async function listGoogleVoices({ languageCode, onlyWavenet = true, force = false } = {}) {
  const now = Date.now();
  if (!force && __voicesCache.list.length && now - __voicesCache.at < VOICES_TTL_MS) {
    let out = __voicesCache.list;
    if (languageCode) out = out.filter((v) => v.languageCodes.includes(languageCode));
    if (onlyWavenet) out = out.filter((v) => /wavenet/i.test(v.name));
    return out;
  }

  let resp;
  try {
    const req = {};
    if (languageCode) req.languageCode = languageCode;
    [resp] = await tts.listVoices(req);
  } catch (e) {
    console.error('[ttsSvc] listVoices ERROR', { code: e?.code, message: e?.message });
    throw e;
  }

  const norm = normalizeVoices(resp?.voices || []);
  __voicesCache = { at: now, list: norm };

  let out = norm;
  if (languageCode) out = out.filter((v) => v.languageCodes.includes(languageCode));
  if (onlyWavenet) out = out.filter((v) => /wavenet/i.test(v.name));
  return out;
}
