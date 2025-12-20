// apps/backend/services/simpleAlignerService.js
import speech from '@google-cloud/speech';
import fetch from 'node-fetch';

// Reuse one client
const speechClient = speech?.v1p1beta1?.SpeechClient
  ? new speech.v1p1beta1.SpeechClient()
  : new speech.SpeechClient();

const NS = '[simpleAligner]';

function normalizeWord(w = '') {
  return String(w)
    .toLowerCase()
    .replace(/[“”"‘’'`]/g, '')
    .replace(/[^a-z0-9\u00C0-\u017F]+/gi, ''); // keep letters/digits, strip punctuation
}

// Very small Levenshtein to tolerate tiny mis-matches
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

/**
 * Greedy alignment: map STT words → script words
 * @param {string[]} scriptWords raw script tokens (already split)
 * @param {Array<{word:string, startSec:number}>} sttWords
 * @returns {Array<{i:number, t:number, w:string}>} marks
 */
function alignSttToScript(scriptWords, sttWords) {
  const scriptNorm = scriptWords.map(normalizeWord);
  const sttNorm = sttWords.map((w) => normalizeWord(w.word));

  const marks = [];
  let j = 0; // pointer in sttNorm

  for (let i = 0; i < scriptWords.length && j < sttWords.length; i++) {
    const target = scriptNorm[i];
    if (!target) continue;

    let bestK = -1;
    let bestDist = Infinity;

    // look ahead up to N words in STT output
    const LOOKAHEAD = 6;
    for (let k = j; k < Math.min(sttNorm.length, j + LOOKAHEAD); k++) {
      const cand = sttNorm[k];
      if (!cand) continue;
      const dist = editDistance(target, cand);
      if (dist < bestDist) {
        bestDist = dist;
        bestK = k;
        if (dist === 0) break; // perfect match → stop
      }
    }

    // Accept only "good enough" matches
    const THRESH = target.length <= 4 ? 1 : 2;
    if (bestK !== -1 && bestDist <= THRESH) {
      const stt = sttWords[bestK];
      const tMs = Math.max(0, Math.round(stt.startSec * 1000));
      marks.push({ i, t: tMs, w: scriptWords[i] });
      j = bestK + 1;
    }
  }

  // If we got nothing, bail out
  if (!marks.length) {
    console.warn(NS, 'no usable word matches; falling back');
    return [];
  }

  // Fill gaps via linear interpolation between known anchors
  const filled = [];
  let last = marks[0];
  filled.push(last);

  for (let k = 1; k < marks.length; k++) {
    const cur = marks[k];
    const gapWords = cur.i - last.i;
    if (gapWords <= 1 || cur.t <= last.t) {
      filled.push(cur);
      last = cur;
      continue;
    }
    const step = (cur.t - last.t) / gapWords;
    for (let di = 1; di < gapWords; di++) {
      const idx = last.i + di;
      filled.push({
        i: idx,
        t: Math.round(last.t + step * di),
        w: scriptWords[idx] || '…',
      });
    }
    filled.push(cur);
    last = cur;
  }

  // If we ended before the script end, extend with constant step
  const lastMark = filled[filled.length - 1];
  const remaining = scriptWords.length - 1 - lastMark.i;
  if (remaining > 0) {
    const fallbackStep = 160; // ms per word
    for (let di = 1; di <= remaining; di++) {
      const idx = lastMark.i + di;
      filled.push({
        i: idx,
        t: lastMark.t + fallbackStep * di,
        w: scriptWords[idx] || '…',
      });
    }
  }

  // Ensure strictly non-decreasing t
  let prev = 0;
  for (const m of filled) {
    if (m.t < prev) m.t = prev;
    prev = m.t;
  }

  return filled;
}

/**
 * Simple aligner using Google Cloud Speech word offsets.
 * Returns [{i, t, w}] where t is in ms.
 *
 * @param {Object} opts
 * @param {Buffer} [opts.audioBuffer]
 * @param {string} [opts.audioUrl]
 * @param {string} opts.text
 * @param {string} [opts.lang] e.g. 'en-US'
 */
export async function simpleAlign({
  audioBuffer,
  audioUrl,
  text,
  lang = 'en-US',
}) {
  try {
    if (!audioBuffer && audioUrl) {
      const resp = await fetch(audioUrl);
      if (!resp.ok) throw new Error(`fetch audioUrl HTTP ${resp.status}`);
      audioBuffer = Buffer.from(await resp.arrayBuffer());
    }
    if (!audioBuffer || !audioBuffer.length || !text) {
      console.warn(NS, 'missing audio or text; cannot align');
      return null;
    }

    const content = audioBuffer.toString('base64');

    const config = {
      languageCode: lang,
      enableWordTimeOffsets: true,
      enableAutomaticPunctuation: false,
      // Keep it simple / cheap
      model: 'default',
      encoding: 'MP3',
    };

    const audio = { content };

    const req = { config, audio };

    const t0 = process.hrtime.bigint();
    const [resp] = await speechClient.recognize(req);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;

    const words = [];
    for (const res of resp.results || []) {
      for (const alt of res.alternatives || []) {
        for (const w of alt.words || []) {
          const startSec =
            (w.startTime?.seconds || 0) + (w.startTime?.nanos || 0) / 1e9;
          words.push({ word: w.word || '', startSec });
        }
      }
    }

    console.log(NS, 'STT done', {
      ms: Math.round(ms),
      sttWords: words.length,
      textLen: text.length,
    });

    if (!words.length) {
      console.warn(NS, 'no STT words; returning null');
      return null;
    }

    // Split script into words
    const scriptWords = text
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const marks = alignSttToScript(scriptWords, words);
    console.log(NS, 'aligned words', {
      scriptWords: scriptWords.length,
      marks: marks.length,
    });

    if (!marks.length) return null;
    return marks;
  } catch (e) {
    console.warn(NS, 'align error', e?.message || e);
    return null;
  }
}
