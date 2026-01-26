// apps/backend/services/googleSttAlignService.js
import speech from '@google-cloud/speech';
import { spawn } from 'node:child_process';

function createSpeechClient() {
  const hasJson = !!process.env.GOOGLE_TTS_CREDENTIALS_JSON;

  if (hasJson) {
    const creds = JSON.parse(process.env.GOOGLE_TTS_CREDENTIALS_JSON);
    return new speech.v1p1beta1.SpeechClient({
      credentials: {
        client_email: creds.client_email,
        private_key: creds.private_key,
      },
      projectId: creds.project_id,
    });
  }
  return new speech.v1p1beta1.SpeechClient();
}

const stt = createSpeechClient();

function ffmpegToFlac16kMono(inputBuffer) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'flac',
      'pipe:1',
    ]);

    const chunks = [];
    ff.stdout.on('data', (d) => chunks.push(d));
    ff.stderr.on('data', () => {}); // already suppressed
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited with ${code}`));
      resolve(Buffer.concat(chunks));
    });

    ff.stdin.end(inputBuffer);
  });
}

// Basic normalization to match STT tokens to your script tokens
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[\u2019]/g, "'")
    .replace(/[^a-z0-9'\-]+/g, '') // drop punctuation
    .trim();

function mapSttWordsToScript(sttWords, scriptWords) {
  const out = [];
  let i = 0; // script
  let j = 0; // stt
  const LOOKAHEAD = 6; // small window; synthetic speech is usually very accurate
  const EPS = 0.04; // 40ms minimum word width

  while (i < scriptWords.length && j < sttWords.length) {
    const sw = norm(scriptWords[i]);
    const tw = norm(sttWords[j].word);

    // direct match
    if (sw && tw && sw === tw) {
      const s = Math.max(0, Number(sttWords[j].startSeconds || 0));
      const eRaw = Math.max(0, Number(sttWords[j].endSeconds || 0));
      const e = Math.max(s + EPS, eRaw);

      out.push({ start: s, end: e, text: scriptWords[i] });
      i++;
      j++;
      continue;
    }

    // lookahead: find current script word in the next few STT tokens
    let foundJ = -1;
    for (let k = 1; k <= LOOKAHEAD && j + k < sttWords.length; k++) {
      if (sw && norm(sttWords[j + k].word) === sw) {
        foundJ = j + k;
        break;
      }
    }
    if (foundJ !== -1) {
      j = foundJ; // skip STT hallucinated/extra tokens
      continue;
    }

    // lookahead: find current STT word in the next few script tokens
    let foundI = -1;
    for (let k = 1; k <= LOOKAHEAD && i + k < scriptWords.length; k++) {
      if (tw && norm(scriptWords[i + k]) === tw) {
        foundI = i + k;
        break;
      }
    }
    if (foundI !== -1) {
      i = foundI; // skip script token that STT likely dropped/changed
      continue;
    }

    // otherwise move forward in STT
    j++;
  }

  return out;
}

export async function alignWithGoogleSttWordOffsets({
  audioMp3Buffer,
  languageCode = 'en-US',
  scriptWords = [],
  scriptText,
}) {
  if (!audioMp3Buffer?.length)
    throw new Error('alignWithGoogleSttWordOffsets: missing mp3 buffer');
  if ((!scriptWords || scriptWords.length === 0) && typeof scriptText === 'string') {
    scriptWords = scriptText.trim().split(/\s+/).filter(Boolean);
  }
  if (!scriptWords?.length)
    throw new Error('alignWithGoogleSttWordOffsets: missing scriptWords');

  const flac = await ffmpegToFlac16kMono(audioMp3Buffer);

  const request = {
    config: {
      encoding: 'FLAC',
      sampleRateHertz: 16000,
      languageCode,
      enableWordTimeOffsets: true,
      // For synthetic narration, punctuation often hurts matching:
      enableAutomaticPunctuation: false,
      model: 'latest_long',
      useEnhanced: true,
    },
    audio: { content: flac.toString('base64') },
  };

  const [operation] = await stt.longRunningRecognize(request);
  const [response] = await operation.promise();

  // Flatten STT words
  const sttWords = [];
  for (const r of response.results || []) {
    const alt = r.alternatives?.[0];
    for (const w of alt?.words || []) {
      const startSeconds =
        Number(w.startTime?.seconds || 0) +
        Number(w.startTime?.nanos || 0) / 1e9;
      const endSeconds =
        Number(w.endTime?.seconds || 0) + Number(w.endTime?.nanos || 0) / 1e9;
      sttWords.push({ word: w.word, startSeconds, endSeconds });
    }
  }

  const wordsJson = mapSttWordsToScript(sttWords, scriptWords);

  return { sttWordCount: sttWords.length, wordsJson };
}
