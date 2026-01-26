// apps/backend/controllers/ttsAvatarController.js
import { v2 as cloudinary } from 'cloudinary';
import {
  synthesizeTtsLocalFirst,
  listGoogleVoices,
} from '../services/googleTtsService.js';
import { normalizeIncomingSsml } from '../../../packages/shared/utils/ssmlText.js';
import {
  normalizeNarration,
  mapWordTimingsToDisplay,
} from '../../../packages/shared/utils/narrationNormalize.js';
import { ssmlToPlainText } from '../../../packages/shared/utils/ssmlText.js';

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

// Cloudinary buffer upload helper
function uploadBuf({ buffer, public_id, resource_type, folder = 'tts' }) {
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        public_id: `${folder}/${public_id}`,
        resource_type,
        overwrite: true,
        type: 'upload',
        format: 'mp3', // explicit
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    upload.end(buffer);
  });
}

export const speakRobot = async (req, res) => {
  const t0 = process.hrtime.bigint();
  const wantsRaw =
    String(req.query?.raw || '').toLowerCase() === '1' ||
    /\baudio\/mpeg\b/.test(String(req.headers?.accept || ''));

  let { ssml, text, voiceName, rate, pitch, ttsText: ttsTextOverride } = req.body || {};

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
    const ttsText = typeof ttsTextOverride === 'string' && ttsTextOverride.trim()
      ? ttsTextOverride.trim()
      : normalizedNarration.ttsText;
    const displayText = normalizedNarration.displayText;
    const tokenMap = normalizedNarration.tokenMap;
    // Map Azure-ish names → Google Wavenet defaults
    function mapVoice(v) {
      const s = String(v || '').toLowerCase();
      const def = process.env.GOOGLE_TTS_VOICE || 'en-US-Wavenet-C';
      if (!s) return def;
      if (s.includes('wavenet') || s.includes('standard')) return v; // already Google
      if (s.includes('jenny')) return 'en-US-Wavenet-C';
      if (s.includes('guy')) return 'en-US-Wavenet-C';
      if (s.includes('aria')) return 'en-US-Wavenet-C';
      if (s.includes('neerja') || s.includes('prabhat'))
        return 'en-IN-Wavenet-A';
      if (s.includes('libby') || s.includes('mia')) return 'en-GB-Wavenet-A';
      return def;
    }
    const mappedVoice = mapVoice(voiceName);

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
      return res
        .status(400)
        .json({ message: 'TTS_FAILED', error: 'EMPTY_TEXT' });
    }

    // 1) Synthesize (local-first). Service may return either:
    //    - { cdnUrl, mp3Buffer: undefined }  ← uploaded or cached
    //    - { cdnUrl: undefined, mp3Buffer }  ← not uploaded yet
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

    // If the service already has a CDN URL (cached or it uploaded), prefer it.
    if (cdnFromSvc) {
      // We don't have a buffer to hot-cache in this path (and we don't need it).
      console.info(NS, 'READY VIA SERVICE URL', {
        id: audioId?.slice(0, 8),
        url: cdnFromSvc,
        words: out.wordsJson?.length ?? 0,
        ms: Math.round(msSince(t0)),
      });

      if (wantsRaw) {
        // Direct the client to fetch from CDN
        res.setHeader('Location', cdnFromSvc);
        return res.status(302).end();
      }

      // CURRENT RESPONSE SHAPE (speakRobot):
      // {
      //   url, cdnUrl, streamPath, words, wordsDisplay, visemes, bookmarks,
      //   vtt, srt, cached, hotTtlMs, displayText, ttsText
      // }
      return res.json({
        url: cdnFromSvc, // <-- actual URL string
        cdnUrl: cdnFromSvc, // duplicate for compatibility
        streamPath, // hot stream fallback (will 302 if buffer is gone)
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

    // Fresh synth and no CDN URL yet -> we must have a buffer
    if (!out.mp3Buffer || !out.mp3Buffer.length) {
      console.warn(NS, 'EMPTY_AUDIO after synth', {
        haveUrl: !!cdnFromSvc,
        haveBuf: !!out.mp3Buffer,
      });
      return res
        .status(502)
        .json({ message: 'TTS_FAILED', error: 'EMPTY_AUDIO' });
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
      const mp3Res = await uploadBuf({
        buffer: out.mp3Buffer,
        public_id: audioId,
        resource_type: 'video',
      });
      secureUrl = mp3Res?.secure_url || null;
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
      cloudinary.url(`tts/${audioId}.mp3`, {
        resource_type: 'video',
        secure: true,
      });

    console.info(NS, 'respond JSON', {
      id: audioId.slice(0, 8),
      url: cdnUrl,
      words: out.wordsJson?.length ?? 0,
      ms: Math.round(msSince(t0)),
    });

    return res.json({
      url: cdnUrl, // <-- actual URL string
      cdnUrl,
      streamPath, // immediate stream from HOT cache
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
 * Streams from the hot buffer immediately. If gone, 302 to Cloudinary.
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
      const cdnUrl = cloudinary.url(`tts/${id}.mp3`, {
        resource_type: 'video',
        secure: true,
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
