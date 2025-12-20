import 'dotenv/config';

import fs from 'node:fs/promises';
import speech from '@google-cloud/speech';

const client = speech?.v1p1beta1?.SpeechClient
  ? new speech.v1p1beta1.SpeechClient()
  : new speech.SpeechClient();

async function main() {
  // TODO: point to a very short WAV/FLAC/LINEAR16 file, 8–16 kHz
  const audioPath = new URL('./samples/hello.wav', import.meta.url);
  const audioBytes = await fs.readFile(audioPath);

  const request = {
    audio: { content: audioBytes.toString('base64') },
    config: {
      languageCode: 'en-US',
      enableWordTimeOffsets: true,
      model: 'default',
      useEnhanced: false,
    },
  };

  console.log('[test-aligner] calling recognize…');
  const [resp] = await client.recognize(request);

  const words =
    resp.results
      ?.flatMap((r) => r.alternatives ?? [])
      .flatMap((a) => a.words ?? []) ?? [];

  console.log(
    '[test-aligner] got words:',
    words.map((w) => ({
      text: w.word,
      start:
        Number(w.startTime?.seconds ?? 0) +
        Number(w.startTime?.nanos ?? 0) / 1e9,
      end:
        Number(w.endTime?.seconds ?? 0) + Number(w.endTime?.nanos ?? 0) / 1e9,
    })),
  );
}

main().catch((err) => {
  console.error('FATAL test-aligner error:', err);
  process.exitCode = 1;
});
