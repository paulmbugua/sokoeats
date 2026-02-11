// apps/backend/services/googleSttAlignService.js
import {
  getBucketForKind,
  putObject,
  resolvePublicUrl,
} from '../services/r2UploadService.js';
import {
  synthesizeTtsLocalFirst,
  listGoogleVoices,
} from '../services/googleTtsService.js';

import {
  normalizeIncomingSsml,
  ssmlToPlainText,
} from '../../../packages/shared/utils/ssmlText.js';

import {
  normalizeNarration,
  mapWordTimingsToDisplay,
} from '../../../packages/shared/utils/narrationNormalize.js';

const NS = '[tts]';

function msSince(t0) {
  return Number(process.hrtime.bigint() - t0) / 1e6;
}
function errShape(err) {
  return {
    name: err?.name,
    code: err?.code,
    message: err?.message,
    cause: err?.cause?.message || err?.cause || undefined,
  };
}

// Map Azure-ish names → Google Wavenet defaults
function mapVoiceNameToGoogle(voiceName) {
  const s = String(voiceName || '').toLowerCase();
  const def = process.env.GOOGLE_TTS_VOICE || 'en-US-Wavenet-C';
  if (!s) return def;

  // already Google-ish
  if (s.includes('wavenet') || s.includes('standard')) return voiceName;

  if (s.includes('jenny')) return 'en-US-Wavenet-C';
  if (s.includes('guy')) return 'en-US-Wavenet-C';
  if (s.includes('aria')) return 'en-US-Wavenet-C';
  if (s.includes('neerja') || s.includes('prabhat')) return 'en-IN-Wavenet-A';
  if (s.includes('libby') || s.includes('mia')) return 'en-GB-Wavenet-A';

  return def;
}

// Tiny hot cache: immediate streaming for the first couple minutes
const HOT_TTL_MS = 2 * 60 * 1000; // 2 minutes
const hotAudio = new Map(); // id -> { buf, expiresAt }

const putHot = (id, buf) => {
  hotAudio.set(id, { buf, expiresAt: Date.now() + HOT_TTL_MS });
  const t = setTimeout(() => hotAudio.delete(id), HOT_TTL_MS);
  if (typeof t?.unref === 'function') t.unref();
  try {
    console.log(NS, 'HOT put', { id: id.slice(0, 8), bytes: buf?.length ?? 0 });
  } catch {}
};

const getHot = (id) => {
  const e = hotAudio.get(id);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    hotAudio.delete(id);
    return null;
  }
  return e.buf;
};

function ttsAudioPath(id) {
  return `tts/${id}.mp3`;
}

async function uploadBuf({ buffer, publicId }) {
  const bucket = getBucketForKind('tts');
  const objectPath = ttsAudioPath(publicId);
  await putObject({
    bucket,
    objectPath,
    body: buffer,
    contentType: 'audio/mpeg',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  return resolvePublicUrl({ bucket, objectPath, kind: 'tts' });
}

export const speakRobot = async (req, res) => {
  const t0 = process.hrtime.bigint();
  const wantsRaw =
    String(req.query?.raw || '').toLowerCase() === '1' ||
    /\baudio\/mpeg\b/.test(String(req.headers?.accept || ''));

  let { ssml, text, voiceName, rate, pitch, ttsText: ttsTextOverride } =
    req.body || {};

  try {
    if (ssml) {
      const normalized = normalizeIncomingSsml(String(ssml));
      if (normalized !== ssml) {
        console.warn(NS, 'SSML normalized', {
          beforeLen: String(ssml).length,
          afterLen: normalized.length,
        });
      }
      ssml = normalized;
    }

    const rawText = ssml ? ssmlToPlainText(ssml) : String(text || '');
    const normalizedNarration = normalizeNarration(rawText);

    const ttsText =
      typeof ttsTextOverride === 'string' && ttsTextOverride.trim()
        ? ttsTextOverride.trim()
        : normalizedNarration.ttsText;

    const displayText = normalizedNarration.displayText;
    const tokenMap = normalizedNarration.tokenMap;

    const mappedVoice = mapVoiceNameToGoogle(voiceName);

    const speakingRate = rate ?? '0%';
    const safePitch = pitch ?? '+0st';

    const ssmlLen = ssml ? String(ssml).length : 0;
    const textLen = ttsText ? String(ttsText).length : 0;

    console.info(NS, 'speak IN', {
      hasSsml: !!ssml,
      ssmlLen,
      textLen,
      voiceIn: voiceName || null,
      effectiveVoice: mappedVoice,
      speakingRate,
      pitch: safePitch,
      wantsRaw,
    });

    if (!ssml && !text && !ttsText) {
      console.warn(NS, 'EMPTY_TEXT');
      return res.status(400).json({ message: 'TTS_FAILED', error: 'EMPTY_TEXT' });
    }

    const out = await synthesizeTtsLocalFirst({
      ssml,
      text: ssml ? undefined : ttsText || text,
      voiceName: mappedVoice,
      speakingRate,
      pitch: safePitch,
      wantTimepoints: true,
      alignmentText: ttsText || text,
    });

    const wordsDisplay = mapWordTimingsToDisplay({
      tokenMap,
      ttsText: ttsText || '',
      displayText,
      ttsWordTimings: out.wordsJson || [],
    });

    const audioId = out.cacheKey;
    const streamPath = `/api/ttsAvatar/stream/${audioId}`;
    const cdnFromSvc = out.cdnUrl || null;

    if (cdnFromSvc) {
      console.info(NS, 'READY VIA SERVICE URL', {
        id: audioId?.slice(0, 8),
        url: cdnFromSvc,
        words: out.wordsJson?.length ?? 0,
        ms: Math.round(msSince(t0)),
      });

      if (wantsRaw) {
        res.setHeader('Location', cdnFromSvc);
        return res.status(302).end();
      }

      return res.json({
        url: cdnFromSvc,
        cdnUrl: cdnFromSvc,
        streamPath,
        words: out.wordsJson,
        wordsDisplay,
        visemes: out.visemesJson,
        bookmarks: out.bookmarksJson,
        vtt: out.vttText,
        srt: out.srtText,
        cached: out.cached === true,
        hotTtlMs: HOT_TTL_MS,
        displayText,
        ttsText,
      });
    }

    if (!out.mp3Buffer || !out.mp3Buffer.length) {
      console.warn(NS, 'EMPTY_AUDIO after synth', {
        haveUrl: !!cdnFromSvc,
        haveBuf: !!out.mp3Buffer,
      });
      return res.status(502).json({ message: 'TTS_FAILED', error: 'EMPTY_AUDIO' });
    }

    // Prime HOT cache for instant local streaming
    putHot(audioId, out.mp3Buffer);

    if (wantsRaw) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', out.mp3Buffer.length);
      console.info(NS, 'send RAW', {
        id: audioId.slice(0, 8),
        bytes: out.mp3Buffer.length,
        ms: Math.round(msSince(t0)),
      });
      return res.status(200).end(out.mp3Buffer);
    }

    // Upload MP3 now (non-blocking for playback since we already hot-cached)
    let secureUrl = null;
    try {
      secureUrl = await uploadBuf({
        buffer: out.mp3Buffer,
        publicId: audioId,
      });
      if (secureUrl) {
        console.info(NS, 'upload ok', {
          id: audioId.slice(0, 8),
          url: secureUrl,
        });
      } else {
        console.warn(NS, 'upload returned no secure_url');
      }
    } catch (e) {
      console.warn(NS, 'upload FAIL; fallback to computed CDN url', e?.message);
    }

    const cdnUrl =
      secureUrl ||
      resolvePublicUrl({
        bucket: getBucketForKind('tts'),
        objectPath: ttsAudioPath(audioId),
        kind: 'tts',
      });

    console.info(NS, 'respond JSON', {
      id: audioId.slice(0, 8),
      url: cdnUrl,
      words: out.wordsJson?.length ?? 0,
      ms: Math.round(msSince(t0)),
    });

    return res.json({
      url: cdnUrl,
      cdnUrl,
      streamPath,
      words: out.wordsJson,
      wordsDisplay,
      visemes: out.visemesJson,
      bookmarks: out.bookmarksJson,
      vtt: out.vttText,
      srt: out.srtText,
      cached: false,
      hotTtlMs: HOT_TTL_MS,
      displayText,
      ttsText,
    });
  } catch (err) {
    console.error(
      NS,
      'speak ERROR',
      errShape(err),
      `dur=${Math.round(msSince(t0))}ms`,
    );
    const code = err?.code;
    if (code === 'EMPTY_TEXT')
      return res.status(400).json({ message: 'TTS_FAILED', error: code });
    return res
      .status(502)
      .json({ message: 'TTS_FAILED', error: code || 'SYNTH_FAILED' });
  }
};

/**
 * GET /api/ttsAvatar/stream/:id
 * Streams from the hot buffer immediately. If gone, 302 to R2.
 * Includes basic Range support for seeking.
 */
export const streamRobot = async (req, res) => {
  try {
    const { id } = req.params || {};
    const EMPTY_SHA1 = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
    if (!id || id === EMPTY_SHA1) {
      console.warn(NS, 'stream NO_ID');
      return res.status(404).json({ error: 'No audio available' });
    }

    const buf = getHot(id);
    if (!buf) {
      const cdnUrl = resolvePublicUrl({
        bucket: getBucketForKind('tts'),
        objectPath: ttsAudioPath(id),
        kind: 'tts',
      });
      console.debug(NS, 'stream MISS -> 302', {
        id: id.slice(0, 8),
        redirect: cdnUrl,
      });
      return res.redirect(302, cdnUrl);
    }

    const range = req.headers.range;
    const total = buf.length;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'audio/mpeg');

    if (!range) {
      res.setHeader('Content-Length', total);
      console.debug(NS, 'stream HIT 200', { id: id.slice(0, 8), bytes: total });
      return res.status(200).end(buf);
    }

    const match = /bytes=(\d+)-(\d+)?/.exec(range);
    const start = match ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : total - 1;

    if (start >= total || end >= total || start > end) {
      res.setHeader('Content-Range', `bytes */${total}`);
      console.warn(NS, 'stream 416', { id: id.slice(0, 8), start, end, total });
      return res.status(416).end();
    }

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
    console.debug(NS, 'stream HIT 206', {
      id: id.slice(0, 8),
      start,
      end,
      total,
    });
    return res.end(buf.subarray(start, end + 1));
  } catch (err) {
    console.error(NS, 'stream ERROR', errShape(err));
    res.status(500).end();
  }
};

export const listVoices = async (req, res) => {
  try {
    const lang = String(req.query?.lang || '').trim() || undefined;
    const onlyWavenet = String(req.query?.onlyWavenet ?? '1') !== '0';
    const voices = await listGoogleVoices({ languageCode: lang, onlyWavenet });
    return res.json({ voices });
  } catch (err) {
    console.error(NS, 'listVoices ERROR', errShape(err));
    return res
      .status(502)
      .json({ message: 'VOICES_FAILED', error: err?.code || 'LIST_FAILED' });
  }
};

/**
 * "CapCut-grade" word-offset alignment fallback.
 *
 * NOTE:
 * - This implementation uses simpleAlign() (already in your codebase) to avoid
 *   introducing new dependencies and audio transcoding requirements.
 * - It returns the same shape your googleTtsService expects: { wordsJson }.
 *
 * Later, if you want true Google STT offsets, we can replace this body with
 * Speech-to-Text alignment (requires decoding MP3 -> LINEAR16/FLAC).
 */
export async function alignWithGoogleSttWordOffsets({
  audioMp3Buffer,
  languageCode = 'en-US',
  scriptWords = [],
}) {
  const text = Array.isArray(scriptWords) ? scriptWords.join(' ') : String(scriptWords || '');

  if (!audioMp3Buffer || !Buffer.isBuffer(audioMp3Buffer) || audioMp3Buffer.length === 0) {
    return { wordsJson: [] };
  }
  if (!text.trim()) {
    return { wordsJson: [] };
  }

  // Use existing aligner to compute word timings from audio + script.
  // This keeps your system working without adding Google STT + transcoding complexity.
  try {
    const { simpleAlign } = await import('./simpleAlignerService.js');
    const aligned = await simpleAlign({
      audioBuffer: audioMp3Buffer,
      audioUrl: undefined,
      text,
      lang: languageCode || 'en-US',
    });

    return { wordsJson: Array.isArray(aligned) ? aligned : [] };
  } catch (e) {
    console.warn('[sttAlign] alignWithGoogleSttWordOffsets fallback failed', {
      message: e?.message || String(e),
    });
    return { wordsJson: [] };
  }
}