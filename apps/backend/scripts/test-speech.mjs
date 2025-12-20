import speech from '@google-cloud/speech';

const client = speech?.v1p1beta1?.SpeechClient
  ? new speech.v1p1beta1.SpeechClient()
  : new speech.SpeechClient();

console.log('[test-speech] client type:', client.constructor.name);
