// test-tts-timepoints.mjs
import 'dotenv/config';
import textToSpeech from '@google-cloud/text-to-speech';

// Prefer v1beta1 (supports enableTimePointing)
const client = new textToSpeech.v1beta1.TextToSpeechClient();

async function main() {
  const ssml = `
    <speak>
      This is a short test for
      <mark name="w0"/>word timing.
      We add <mark name="w1"/>another mark
      and <mark name="w2"/>one more
      to see if <mark name="w3"/>timepoints come back.
    </speak>
  `.trim();

  const request = {
    input: { ssml },
    voice: {
      languageCode: 'en-US',
      name: 'en-US-Wavenet-C', // or any valid voice you use
    },
    audioConfig: {
      audioEncoding: 'MP3',
    },
    // 👇 key bit: ask for SSML_MARK timepoints
    enableTimePointing: ['SSML_MARK'],
  };

  console.log('Sending request...');
  console.log('SSML:\n', ssml);

  const [response] = await client.synthesizeSpeech(request);

  console.log('\n=== Raw response.timepoints ===');
  console.dir(response.timepoints, { depth: null });

  console.log('\n=== Pretty print marks ===');
  (response.timepoints || []).forEach((tp, i) => {
    console.log(
      `#${i} name=${tp.markName || tp.timepointName}  timeSeconds=${tp.timeSeconds}`
    );
  });

  console.log('\nAudio bytes length:', response.audioContent?.length || 0);
}

main().catch((err) => {
  console.error('Error from TTS:', err);
  process.exit(1);
});
