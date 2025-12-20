// Load .env vars first (same as your backend entry usually does)
import 'dotenv/config';
import textToSpeech from '@google-cloud/text-to-speech';

async function main() {
  const client = new textToSpeech.v1beta1.TextToSpeechClient();

  const ssml = '<speak><mark name="w0"/>Hello <mark name="w1"/>world</speak>';

  const [resp] = await client.synthesizeSpeech({
    input: { ssml },
    voice: {
      languageCode: 'en-US',
      name: 'en-US-Wavenet-C',
    },
    audioConfig: {
      audioEncoding: 'MP3',
    },
    enableTimePointing: ['SSML_MARK'],
  });

  console.log('raw timepoints:', resp.timepoints);
  if (Array.isArray(resp.timepoints)) {
    console.log(
      'parsed:',
      resp.timepoints.map((tp) => ({
        markName: tp.markName || tp.timepointName,
        timeSeconds: tp.timeSeconds,
      })),
    );
  }
}

main().catch((err) => {
  console.error('ERROR in test-timepoints:', err);
  process.exit(1);
});
