// apps/backend/services/googleTtsService.js
import crypto from 'node:crypto';
import textToSpeech from '@google-cloud/text-to-speech';
import { v2 as cloudinary } from 'cloudinary';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { simpleAlign } from './simpleAlignerService.js';
import { alignWithGoogleSttWordOffsets } from './googleSttAlignService.js';

// ─────────────────────────────────────────────────────────
const thisFile = basename(fileURLToPath(import.meta.url));
console.info('[ttsSvc] VERSION wordmarks-v2', {
  file: thisFile,
  pid: process.pid,
});

let __voicesCache = { at: 0, list: [] };
const VOICES_TTL_MS = 12 * 60 * 60 * 1000;

const DEFAULT_VOICE = process.env.GOOGLE_TTS_VOICE || 'en-US-Wavenet-C';
const DEFAULT_LANG = process.env.GOOGLE_TTS_LANG || 'en-US';
const AUDIO_ENCODING = 'MP3';
const MAX_SSML_BYTES = 3800;

// Prefer v1beta1 when available, and support JSON creds via env (Railway)
function createTtsClient() {
  const hasJson = !!process.env.GOOGLE_TTS_CREDENTIALS_JSON;

  if (hasJson) {
    try {
      const creds = JSON.parse(process.env.GOOGLE_TTS_CREDENTIALS_JSON);

      const clientConfig = {
        credentials: {
          client_email: creds.client_email,
          private_key: creds.private_key,
        },
        projectId: creds.project_id,
      };

      console.info(
        '[ttsSvc] Using GOOGLE_TTS_CREDENTIALS_JSON for Google TTS auth',
      );

      return textToSpeech?.v1beta1?.TextToSpeechClient
        ? new textToSpeech.v1beta1.TextToSpeechClient(clientConfig)
        : new textToSpeech.TextToSpeechClient(clientConfig);
    } catch (err) {
      console.error(
        '[ttsSvc] Failed to parse GOOGLE_TTS_CREDENTIALS_JSON, falling back to ADC',
        err,
      );
    }
  } else {
    console.info(
      '[ttsSvc] GOOGLE_TTS_CREDENTIALS_JSON not set, using ADC / GOOGLE_APPLICATION_CREDENTIALS',
    );
  }

  return textToSpeech?.v1beta1?.TextToSpeechClient
    ? new textToSpeech.v1beta1.TextToSpeechClient()
    : new textToSpeech.TextToSpeechClient();
}

const tts = createTtsClient();

// ─────────────────────────────────────────────────────────
// SSML helpers (Azure → GCP normalization)
// ─────────────────────────────────────────────────────────

function sanitizeForGoogle(ssmlInner) {
  let s = String(ssmlInner || '');
  s = s.replace(/<\/?mstts:[^>]*>/gi, '');
  s = s.replace(/<\/?amazon:[^>]*>/gi, '');
  s = s.replace(/<\/?voice[^>]*>/gi, '');
  s = s.replace(/\s+\>/g, '>').replace(/\<\s+/g, '<');
  return s;
}

function toGcpSsml(ssml) {
  if (!ssml) return ssml;
  let out = String(ssml);

  out = out.replace(/<bookmark\s+mark="([^"]+)"\s*\/>/gi, '<mark name="$1"/>');
  out = out.replace(/\s+xmlns:mstts="[^"]*"/gi, '');
  out = out.replace(/<\/?mstts:[^>]+>/gi, '');

  return out;
}

const byteLen = (s) => Buffer.byteLength(s, 'utf8');
const wrapSpeak = (inner) => `<speak>${inner}</speak>`;
const unwrapSpeak = (s) =>
  String(s || '')
    .replace(/^\s*<speak[^>]*>/i, '')
    .replace(/<\/speak>\s*$/i, '');

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
  if (
    parts.length >= 2 &&
    /^[a-z]{2,3}$/i.test(parts[0]) &&
    /^[A-Z]{2}$/.test(parts[1])
  ) {
    return `${parts[0]}-${parts[1]}`;
  }
  return DEFAULT_LANG;
}

async function cloudinaryHas(publicId) {
  try {
    await cloudinary.api.resource(`tts/${publicId}`, {
      resource_type: 'video',
    });
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

// ─────────────────────────────────────────────────────────
// Mark injection
// ─────────────────────────────────────────────────────────

function injectMarksIntoSsml(ssml) {
  const raw = toGcpSsml(ssml.trim());
  const inner = sanitizeForGoogle(unwrapSpeak(raw));
  const tokens = inner.split(/(<[^>]+>)/g).filter(Boolean);
  const wordRe = /([A-Za-z0-9]+(?:[’'\-][A-Za-z0-9]+)*)/g;
  let idx = 0;
  const words = [];

  const out = tokens
    .map((tok) => {
      if (/^<[^>]+>$/.test(tok)) return tok;
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
    if (!merged.length) merged.push(c);
    else {
      const last = merged[merged.length - 1];
      if (byteLen(last) + byteLen(unwrapSpeak(c)) <= maxBytes - 64) {
        merged[merged.length - 1] = wrapSpeak(
          unwrapSpeak(last) + unwrapSpeak(c),
        );
      } else merged.push(c);
    }
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
      out.push({
        i,
        t: Math.round((tp.timeSeconds || 0) * 1000),
        w: wordsList[i],
      });
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
const SSML_MARK_ENUM =
  protos?.google?.cloud?.texttospeech?.v1beta1?.SynthesizeSpeechRequest
    ?.TimepointType?.SSML_MARK ??
  protos?.google?.cloud?.texttospeech?.v1?.SynthesizeSpeechRequest
    ?.TimepointType?.SSML_MARK ??
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

  const voice = voiceName || DEFAULT_VOICE;
  const langCode = deriveLang(voice);
  const rateMult = parseRate(speakingRate);
  const pitchSt = parsePitch(pitch);

  // Build input SSML + words list
  let inputSSML;
  let wordsList = null;

  if (ssml) {
    if (wantTimepoints) {
      const injected = injectMarksIntoSsml(ssml);
      inputSSML = injected.ssml;
      wordsList = injected.words;
    } else {
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
    ? cloudinary.url(`tts/${cacheKey}.mp3`, {
        resource_type: 'video',
        secure: true,
      })
    : null;

  // Cached: align and return URL
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
  const chunks =
    ssmlBytes > MAX_SSML_BYTES
      ? splitSsmlSmart(inputSSML, MAX_SSML_BYTES)
      : [inputSSML];
  if (chunks.length > 1)
    console.log('[ttsSvc] CHUNK', {
      count: chunks.length,
      totalBytes: ssmlBytes,
    });

  const markCountAll = (inputSSML.match(/<mark\s+name="/gi) || []).length;
  const forceNoTimepoints = wantTimepoints && !markCountAll;

  const allChunkBuffers = [];
  const collectedWords = [];
  let offsetMs = 0;
  let wordsSeen = 0;

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const ssmlForGcp = toGcpSsml(c);

    const req = {
      input: { ssml: ssmlForGcp },
      voice: { name: voice, languageCode: langCode },
      audioConfig: {
        audioEncoding: AUDIO_ENCODING,
        speakingRate: rateMult,
        pitch: pitchSt,
      },
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
    const [resp] = await tts.synthesizeSpeech(req);
    const ms = Number(process.hrtime.bigint() - t1) / 1e6;

    const b64 = resp.audioContent || '';
    const buf = Buffer.from(b64, 'base64');
    const tps = Array.isArray(resp.timepoints) ? resp.timepoints : [];
    const marksInChunk = (c.match(/<mark\s+name="/gi) || []).length;

    const approxStepMs = Math.max(
      80,
      Math.round(190 / Math.max(rateMult, 0.25)),
    );
    let stepForThisChunk = approxStepMs;

    console.log('[ttsSvc] GCP synth OK', {
      chunk: i + 1,
      of: chunks.length,
      ms: Math.round(ms),
      bytes: buf.length,
      timepoints: tps.length,
    });

    if (!forceNoTimepoints && wantTimepoints && tps.length) {
      const local = timepointsToWords(tps, wordsList || []);
      const shifted = local.map((w) => ({ ...w, t: w.t + offsetMs }));
      collectedWords.push(...shifted);

      const last = tps[tps.length - 1];
      if (last && Number.isFinite(last.timeSeconds)) {
        const chunkDurMs = Math.round(last.timeSeconds * 1000);
        if (marksInChunk > 0)
          stepForThisChunk = Math.max(
            50,
            Math.round(chunkDurMs / marksInChunk),
          );
        offsetMs += chunkDurMs;
      }
      wordsSeen += marksInChunk;
    } else if (
      wantTimepoints &&
      marksInChunk > 0 &&
      (wordsList?.length || 0) > 0
    ) {
      const baseI = wordsSeen;
      for (let k = 0; k < marksInChunk; k++) {
        const iGlobal = baseI + k;
        if (!wordsList[iGlobal]) break;
        collectedWords.push({
          i: iGlobal,
          t: offsetMs + k * stepForThisChunk,
          w: wordsList[iGlobal],
        });
      }
      offsetMs += stepForThisChunk * marksInChunk;
      wordsSeen += marksInChunk;
    }

    allChunkBuffers.push(buf);
  }

  const mp3Buffer = Buffer.concat(allChunkBuffers);
  console.log('[ttsSvc] buffer', { bytes: mp3Buffer.length });

  // Upload → if success, return URL; if fail, keep mp3Buffer
  let finalCdnUrl = null;
  try {
    const uploadedUrl = await new Promise((resolve, reject) => {
      const up = cloudinary.uploader.upload_stream(
        {
          public_id: `tts/${cacheKey}`,
          resource_type: 'video',
          format: 'mp3',
          overwrite: true,
        },
        (err, res) => (err ? reject(err) : resolve(res?.secure_url || null)),
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

  // 1) Google timepoints (marks)
  let wordsJson =
    wantTimepoints && collectedWords.length
      ? collectedWords.sort((a, b) => a.i - b.i)
      : null;

  // 2) simpleAlign fallback (only if empty)
  if (wantTimepoints && (!wordsJson || wordsJson.length === 0)) {
    const plain =
      wordsList && wordsList.length
        ? wordsList.join(' ')
        : unwrapSpeak(inputSSML);
    const aligned = await simpleAlign({
      audioBuffer: finalCdnUrl ? undefined : mp3Buffer,
      audioUrl: finalCdnUrl || undefined,
      text: plain,
      lang: langCode || 'en-US',
    });
    if (Array.isArray(aligned) && aligned.length) wordsJson = aligned;
  }

  // 3) CapCut-grade fallback: Google STT word offsets (only if empty/weak)
  if (wantTimepoints) {
    const need = wordsList?.length || 0;
    const have = wordsJson?.length || 0;
    const tooWeak = need > 0 && have < Math.floor(need * 0.7);

    if (tooWeak && mp3Buffer?.length && need > 0) {
      console.log('[ttsSvc] STT align fallback (capcut-grade)', { have, need });
      try {
        const { wordsJson: sttAligned } = await alignWithGoogleSttWordOffsets({
          audioMp3Buffer: mp3Buffer,
          languageCode: langCode || 'en-US',
          scriptWords: wordsList,
        });
        if (Array.isArray(sttAligned) && sttAligned.length)
          wordsJson = sttAligned;
      } catch (e) {
        console.warn('[ttsSvc] STT align failed; keeping existing timings', {
          message: e?.message || String(e),
        });
      }
    }
  }

  // 4) Final fallback: evenly-spaced timings
  if (!wordsJson || wordsJson.length === 0) {
    wordsJson =
      wantTimepoints && wordsList?.length
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

  return {
    cached: false,
    cacheKey,
    cdnUrl: finalCdnUrl || undefined,
    mp3Buffer: finalCdnUrl ? undefined : mp3Buffer,
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

export async function listGoogleVoices({
  languageCode,
  onlyWavenet = true,
  force = false,
} = {}) {
  const now = Date.now();
  if (
    !force &&
    __voicesCache.list.length &&
    now - __voicesCache.at < VOICES_TTL_MS
  ) {
    let out = __voicesCache.list;
    if (languageCode)
      out = out.filter((v) => v.languageCodes.includes(languageCode));
    if (onlyWavenet) out = out.filter((v) => /wavenet/i.test(v.name));
    return out;
  }

  let resp;
  const req = {};
  if (languageCode) req.languageCode = languageCode;
  [resp] = await tts.listVoices(req);

  const norm = normalizeVoices(resp?.voices || []);
  __voicesCache = { at: now, list: norm };

  let out = norm;
  if (languageCode)
    out = out.filter((v) => v.languageCodes.includes(languageCode));
  if (onlyWavenet) out = out.filter((v) => /wavenet/i.test(v.name));
  return out;
}
