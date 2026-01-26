import { normalizeNarration } from '../packages/shared/utils/narrationNormalize.js';

const sample =
  'For instance in the expression x plus 5 equals 10.. x equals 5. ' +
  'y equals 2x plus 3. y equals 7. A equals l w. y equals 3x minus 4. ' +
  'H two O and CO two.';

const normalized = normalizeNarration(sample);

console.log('Display:', normalized.displayText);
console.log('TTS:', normalized.ttsText);

const mustInclude = [
  'x + 5 = 10',
  'x = 5',
  'y = 2x + 3',
  'y = 7',
  'A = l × w',
  'y = 3x - 4',
  'H₂O',
  'CO₂',
];

const missing = mustInclude.filter((needle) => !normalized.displayText.includes(needle));
if (missing.length) {
  console.error('Missing display phrases:', missing);
  process.exitCode = 1;
}

if (normalized.displayText.includes('..') || normalized.ttsText.includes('..')) {
  console.error('Double fullstop found in output.');
  process.exitCode = 1;
}
