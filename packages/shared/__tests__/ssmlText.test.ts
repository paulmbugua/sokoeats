import { ssmlToPlainText } from '../utils/ssmlText.js';

function assertEqual(actual: string, expected: string, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertNoLtGtTokens(text: string) {
  if (/\b(?:lt|gt)\b/i.test(text)) {
    throw new Error(`Unexpected lt/gt token in transcript: ${text}`);
  }
}

const cases = [
  {
    input: '<speak>Hi.<break time="500ms"/> For instance, a bakery tracks sales.</speak>',
    expected: 'Hi. For instance, a bakery tracks sales.',
  },
  {
    input: '&lt;speak&gt;Hi.&lt;break time="500ms"/&gt; Test.&lt;/speak&gt;',
    expected: 'Hi. Test.',
  },
];

for (const { input, expected } of cases) {
  const output = ssmlToPlainText(input);
  assertEqual(output, expected, 'ssmlToPlainText output mismatch');
  assertNoLtGtTokens(output);
}
