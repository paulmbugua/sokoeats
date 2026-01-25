import { decodeHtmlEntities, normalizeIncomingSsml } from './ssmlText';

export type WordTiming = { i: number; t: number; w: string }; // from SpeakResp
export type DisplayToken =
  | { kind: 'word'; text: string; start: number | undefined; index: number }
  | { kind: 'punct'; text: string }; // punctuation/spaces

const DIGIT_WORDS = new Map([
  ['zero', '0'],
  ['oh', '0'],
  ['one', '1'],
  ['two', '2'],
  ['three', '3'],
  ['four', '4'],
  ['five', '5'],
  ['six', '6'],
  ['seven', '7'],
  ['eight', '8'],
  ['nine', '9'],
]);
const TENS_WORDS = new Map([
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
]);
const ORDINAL_WORDS = new Map([
  ['first', 1],
  ['second', 2],
  ['third', 3],
  ['fourth', 4],
  ['fifth', 5],
  ['sixth', 6],
  ['seventh', 7],
  ['eighth', 8],
  ['ninth', 9],
  ['tenth', 10],
  ['eleventh', 11],
  ['twelfth', 12],
  ['thirteenth', 13],
  ['fourteenth', 14],
  ['fifteenth', 15],
  ['sixteenth', 16],
  ['seventeenth', 17],
  ['eighteenth', 18],
  ['nineteenth', 19],
  ['twentieth', 20],
]);
const EXPONENT_WORDS = new Set<string>([
  ...Array.from(DIGIT_WORDS.keys()),
  ...Array.from(TENS_WORDS.keys()),
  ...Array.from(ORDINAL_WORDS.keys()),
  'minus',
  'and',
]);
const UNIT_TOKENS = new Set([
  'mol',
  'mole',
  's',
  'sec',
  'second',
  'm',
  'meter',
  'metre',
  'kg',
  'g',
  'l',
  'j',
  'kj',
  'pa',
  'atm',
  'hz',
  'n',
  'v',
  'a',
  'k',
]);

function parseWordDigit(token: string): string | null {
  const lower = token.toLowerCase();
  if (DIGIT_WORDS.has(lower)) return DIGIT_WORDS.get(lower) || null;
  if (/^\d+$/.test(lower)) return lower;
  return null;
}

function parseExponentDigit(token: string): string | null {
  const lower = token.toLowerCase();
  const digit = parseWordDigit(lower);
  if (digit != null) return digit;
  const ordinal = ORDINAL_WORDS.get(lower);
  if (ordinal != null) return String(ordinal);
  const tens = TENS_WORDS.get(lower);
  if (tens != null) return String(tens);
  return null;
}

function parseMantissaTokens(tokens: string[]): string | null {
  if (!tokens.length) return null;
  const normalized = tokens.map((t) => t.toLowerCase());
  const pointIdx = normalized.indexOf('point');
  if (pointIdx >= 0) {
    const intPartTokens = normalized.slice(0, pointIdx);
    const fracTokens = normalized.slice(pointIdx + 1);
    if (!intPartTokens.length || !fracTokens.length) return null;
    const intDigits = intPartTokens.map((t) => parseWordDigit(t)).filter(Boolean);
    const fracDigits = fracTokens.map((t) => parseWordDigit(t)).filter(Boolean);
    if (intDigits.length !== intPartTokens.length || fracDigits.length !== fracTokens.length) return null;
    return `${intDigits.join('')}.${fracDigits.join('')}`;
  }

  if (normalized.every((t) => /^\d+$/.test(t))) {
    if (normalized.length === 1) return normalized[0];
    const [first, ...rest] = normalized;
    return `${first}.${rest.join('')}`;
  }

  const digitTokens = normalized.map((t) => parseWordDigit(t)).filter(Boolean);
  if (digitTokens.length === normalized.length) return digitTokens.join('');

  return null;
}

function parseExponentTokens(tokens: string[]): string | null {
  if (!tokens.length) return null;
  const cleaned = tokens
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!cleaned.length) return null;
  const prefix: string[] = [];
  for (const tok of cleaned) {
    if (EXPONENT_WORDS.has(tok) || /^\d+$/.test(tok)) prefix.push(tok);
    else break;
  }
  if (!prefix.length) return null;
  const digitCandidate = prefix.join('').match(/^\d+$/);
  if (digitCandidate) return digitCandidate[0];

  const hasLeadingMinus = prefix[0] === 'minus';
  const tokensNoMinus = prefix.filter((t) => t !== 'minus' && t !== 'and');
  if (!tokensNoMinus.length) return null;

  const values = tokensNoMinus.map((t) =>
    TENS_WORDS.get(t) ?? ORDINAL_WORDS.get(t) ?? (DIGIT_WORDS.get(t) ? Number(DIGIT_WORDS.get(t)) : NaN)
  );

  if (values.some((v) => Number.isNaN(v))) return null;

  let total = 0;
  if (values.length === 1) total = values[0];
  else if (values.length === 2 && values[0] >= 20 && values[1] < 10) total = values[0] + values[1];
  else total = values.reduce((sum, v) => sum + v, 0);

  if (hasLeadingMinus && total > 0) total = -total;
  return String(total);
}

function takeExponentTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (EXPONENT_WORDS.has(lower) || /^\d+$/.test(lower)) out.push(tok);
    else break;
  }
  return out;
}

function unwordifyScientificNotationForDisplay(input: string): string {
  if (!input) return '';
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return input;
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const lower = tokens[i].toLowerCase();
    if (!DIGIT_WORDS.has(lower) && !/^\d+$/.test(lower)) {
      out.push(tokens[i]);
      i++;
      continue;
    }

    let j = i + 1;
    while (j < tokens.length && tokens[j].toLowerCase() !== 'times') j++;
    if (j >= tokens.length) {
      out.push(tokens[i]);
      i++;
      continue;
    }

    const mantissa = parseMantissaTokens(tokens.slice(i, j));
    if (!mantissa) {
      out.push(tokens[i]);
      i++;
      continue;
    }

    const afterTimes = tokens.slice(j + 1);
    if (afterTimes.length < 2) {
      out.push(tokens[i]);
      i++;
      continue;
    }

    const tenIdx = afterTimes.findIndex((t) => t.toLowerCase() === 'ten');
    if (tenIdx !== 0) {
      out.push(tokens[i]);
      i++;
      continue;
    }

    const toIdx = afterTimes.findIndex((t) => t.toLowerCase() === 'to');
    if (toIdx < 0 || toIdx > 2) {
      out.push(tokens[i]);
      i++;
      continue;
    }

    const exponentTokens = takeExponentTokens(
      afterTimes.slice(toIdx + 1).filter((t) => t.toLowerCase() !== 'the')
    );
    const exponent = parseExponentTokens(exponentTokens);
    if (!exponent) {
      out.push(tokens[i]);
      i++;
      continue;
    }

    out.push(`${mantissa} × 10^${exponent}`);
    i = i + (j - i) + 1 + 1 + toIdx + 1 + exponentTokens.length;
  }

  return out.join(' ');
}

function unwordifyUnitExponentForDisplay(input: string): string {
  if (!input) return '';
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return input;
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const unit = tokens[i];
    const unitLower = unit.toLowerCase();
    if (!UNIT_TOKENS.has(unitLower)) {
      out.push(unit);
      i++;
      continue;
    }
    const next = tokens[i + 1]?.toLowerCase();
    const expToken = tokens[i + 2];
    const expDigit = expToken ? parseExponentDigit(expToken) : null;
    if (next === 'minus' && expDigit) {
      out.push(`${unit}−${expDigit}`);
      i += 3;
      continue;
    }
    out.push(unit);
    i++;
  }
  return out.join(' ');
}

/** Turn SSML into display tokens by interleaving timing-mapped words with punctuation. */
export function ssmlToDisplayTokens(ssml: string, timings: WordTiming[]): DisplayToken[] {
  const text = unwordifyUnitExponentForDisplay(
    unwordifyScientificNotationForDisplay(
      decodeHtmlEntities(
        normalizeIncomingSsml(String(ssml || ''))
          // strip outer SSML but keep punctuation
          .replace(/<speak[^>]*>/gi, '')
          .replace(/<\/speak>/gi, '')
          .replace(/<[^>]+>/g, ' ') // drop tags, keep spacing
          .replace(/\s+/g, ' ')
          .trim()
      )
    )
  );

  // MUST match backend's word definition (googleTtsService -> injectMarksIntoSsml)
  const wordRe = /([\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*)/gu;

  const out: DisplayToken[] = [];
  let wi = 0;
  let last = 0;

  for (const m of text.matchAll(wordRe)) {
    const word = m[1];
    const at = m.index ?? 0;

    // emit punctuation between last token and this word
    if (at > last) {
      const punct = text.slice(last, at);
      if (punct) out.push({ kind: 'punct', text: punct });
    }

    const t = timings[wi];
    out.push({
      kind: 'word',
      text: word,
      start: t ? t.t : undefined,
      index: t ? t.i : wi,
    });

    wi += 1;
    last = at + word.length;
  }

  // tail punctuation
  if (last < text.length) {
    const tail = text.slice(last);
    if (tail) out.push({ kind: 'punct', text: tail });
  }

  return out;
}
