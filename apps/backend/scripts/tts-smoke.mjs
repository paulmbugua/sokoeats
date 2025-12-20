import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION || 'eastus';

if (!key || !region) {
  console.error('Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION');
  process.exit(1);
}

const cfg = sdk.SpeechConfig.fromSubscription(key, region);
cfg.speechSynthesisVoiceName = 'en-US-JennyNeural';

// (helps on some Windows/Node setups)
cfg.setProperty(
  sdk.PropertyId.SpeechServiceConnection_Host,
  `${region}.tts.speech.microsoft.com`,
);
cfg.setProperty(
  sdk.PropertyId.SpeechServiceConnection_Endpoint,
  `wss://${region}.tts.speech.microsoft.com/cognitiveservices/websocket/v1`,
);

const out = sdk.AudioConfig.fromAudioFileOutput('sdk-test.mp3');
const synth = new sdk.SpeechSynthesizer(cfg, out);

// extra diagnostics
synth.synthesisCanceled = (_s, e) => {
  console.warn('synthesisCanceled', {
    reason: e?.reason,
    errorCode: e?.errorCode,
    errorDetails: e?.errorDetails,
  });
};

synth.speakTextAsync(
  'Hello from the Node SDK.',
  (r) => {
    console.log('OK:', r.reason, 'bytes:', r?.audioData?.byteLength ?? 0);
    synth.close();
  },
  (e) => {
    console.error('ERR:', e);
    synth.close();
  },
);
