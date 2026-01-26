export type NormalizedNarration = {
  displayText: string;
  ttsText: string;
  tokenMap: Array<{
    displaySpan: [number, number];
    ttsSpan: [number, number];
    kind: 'word' | 'math' | 'chem';
    raw: string;
    display: string;
    tts: string;
  }>;
};

const NO_SPACE_BEFORE_RE = /^[,.;:!?\)%\]\}…”’"']/u;
const NO_SPACE_AFTER_RE = /[\(\[\{\u201c\u2018"'“‘]$/u;

const DIGIT_WORDS = new Map([
  ['zero', '0'],
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

const SUBSCRIPT_MAP = new Map([
  ['0', '₀'],
  ['1', '₁'],
  ['2', '₂'],
  ['3', '₃'],
  ['4', '₄'],
  ['5', '₅'],
  ['6', '₆'],
  ['7', '₇'],
  ['8', '₈'],
  ['9', '₉'],
]);

const ELEMENT_SYMBOLS = new Set([
  'H',
  'He',
  'Li',
  'Be',
  'B',
  'C',
  'N',
  'O',
  'F',
  'Ne',
  'Na',
  'Mg',
  'Al',
  'Si',
  'P',
  'S',
  'Cl',
  'Ar',
  'K',
  'Ca',
  'Sc',
  'Ti',
  'V',
  'Cr',
  'Mn',
  'Fe',
  'Co',
  'Ni',
  'Cu',
  'Zn',
  'Ga',
  'Ge',
  'As',
  'Se',
  'Br',
  'Kr',
  'Rb',
  'Sr',
  'Y',
  'Zr',
  'Nb',
  'Mo',
  'Ag',
  'Cd',
  'Sn',
  'I',
  'Xe',
  'Cs',
  'Ba',
  'Au',
  'Hg',
  'Pb',
  'U',
]);

const FORMULA_CONTEXT = new Set(['area', 'volume', 'perimeter']);

function shouldInsertSpace(prevText: string, nextText: string): boolean {
  if (!prevText) return false;
  if (!nextText) return false;
  if (NO_SPACE_BEFORE_RE.test(nextText)) return false;
  if (NO_SPACE_AFTER_RE.test(prevText)) return false;
  return true;
}

function toSubscript(digit: string): string {
  return SUBSCRIPT_MAP.get(digit) || digit;
}

type Token = {
  raw: string;
  leading: string;
  trailing: string;
  core: string;
  lower: string;
};

function parseToken(raw: string): Token {
  const leading = raw.match(/^[\p{P}\p{S}]+/u)?.[0] ?? '';
  const trailing = raw.match(/[\p{P}\p{S}]+$/u)?.[0] ?? '';
  const core = raw.slice(leading.length, raw.length - trailing.length);
  return {
    raw,
    leading,
    trailing,
    core,
    lower: core.toLowerCase(),
  };
}

function isElementToken(core: string): boolean {
  if (!core) return false;
  if (ELEMENT_SYMBOLS.has(core)) return true;
  if (/^[A-Z]+$/.test(core) && core.length > 1) {
    return core.split('').every((ch) => ELEMENT_SYMBOLS.has(ch));
  }
  return false;
}

function isSingleLetter(core: string): boolean {
  return /^[A-Za-z]$/.test(core);
}

function parseDigitToken(core: string): string | null {
  if (!core) return null;
  if (/^[2-9]$/.test(core)) return core;
  const lowered = core.toLowerCase();
  return DIGIT_WORDS.get(lowered) || null;
}

export function stripDoubleFullstops(text: string): string {
  return String(text || '').replace(/(^|[^.])\.\.(?!\.)/g, '$1.');
}

export function normalizeNarration(rawText: string): NormalizedNarration {
  const cleaned = stripDoubleFullstops(rawText);
  const rawTokens = String(cleaned).match(/\S+/g) || [];
  const tokens = rawTokens.map(parseToken);

  const entries = tokens.map((t) => ({
    raw: t.raw,
    leading: t.leading,
    trailing: t.trailing,
    ttsCore: t.core,
    displayCore: t.core,
    displayLeading: t.leading,
    displayTrailing: t.trailing,
    kind: 'word' as const,
  }));

  const applyPhrase = (
    start: number,
    count: number,
    displayCore: string,
    kind: 'word' | 'math' | 'chem' = 'math'
  ) => {
    const end = start + count - 1;
    const lead = tokens[start]?.leading || '';
    const trail = tokens[end]?.trailing || '';
    entries[start].displayCore = displayCore;
    entries[start].displayLeading = lead;
    entries[start].displayTrailing = trail;
    entries[start].kind = kind;
    for (let k = start + 1; k <= end; k++) {
      entries[k].displayCore = '';
      entries[k].displayLeading = '';
      entries[k].displayTrailing = '';
      entries[k].kind = kind;
    }
  };

  const applyCombinedDisplay = (
    start: number,
    end: number,
    displayCore: string,
    kind: 'word' | 'math' | 'chem' = 'math'
  ) => {
    const lead = tokens[start]?.leading || '';
    const trail = tokens[end]?.trailing || '';
    entries[start].displayCore = displayCore;
    entries[start].displayLeading = lead;
    entries[start].displayTrailing = trail;
    entries[start].kind = kind;
    for (let k = start + 1; k <= end; k++) {
      entries[k].displayCore = '';
      entries[k].displayLeading = '';
      entries[k].displayTrailing = '';
      entries[k].kind = kind;
    }
  };

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const next = tokens[i + 1];
    const next2 = tokens[i + 2];

    if (t && isElementToken(t.core)) {
      let j = i;
      let displayFormula = '';
      let hasNumber = false;
      while (j < tokens.length && isElementToken(tokens[j]?.core)) {
        const symbol = tokens[j].core;
        displayFormula += symbol;
        const numToken = tokens[j + 1];
        const digit = numToken ? parseDigitToken(numToken.core) : null;
        if (digit) {
          displayFormula += toSubscript(digit);
          entries[j + 1].ttsCore = digit;
          entries[j + 1].kind = 'chem';
          hasNumber = true;
          j += 2;
        } else {
          j += 1;
        }
      }
      if (hasNumber && displayFormula) {
        applyCombinedDisplay(i, j - 1, displayFormula, 'chem');
        for (let k = i; k < j; k++) entries[k].kind = 'chem';
        i = j;
        continue;
      }
    }

    if (t?.lower === 'is' && next?.lower === 'equal' && next2?.lower === 'to') {
      applyPhrase(i, 3, '=');
      i += 3;
      continue;
    }
    if (t?.lower === 'equal' && next?.lower === 'to') {
      applyPhrase(i, 2, '=');
      i += 2;
      continue;
    }
    if (t?.lower === 'multiplied' && next?.lower === 'by') {
      applyPhrase(i, 2, '×');
      i += 2;
      continue;
    }
    if (t?.lower === 'divided' && next?.lower === 'by') {
      applyPhrase(i, 2, '/');
      i += 2;
      continue;
    }
    if (t?.lower === 'open' && (next?.lower === 'parenthesis' || next?.lower === 'parentheses')) {
      applyPhrase(i, 2, '(');
      i += 2;
      continue;
    }
    if (t?.lower === 'close' && (next?.lower === 'parenthesis' || next?.lower === 'parentheses')) {
      applyPhrase(i, 2, ')');
      i += 2;
      continue;
    }

    if (t?.lower === 'plus') {
      entries[i].displayCore = '+';
      entries[i].kind = 'math';
    } else if (t?.lower === 'minus') {
      entries[i].displayCore = '-';
      entries[i].kind = 'math';
    } else if (t?.lower === 'equals' || t?.lower === 'equal') {
      entries[i].displayCore = '=';
      entries[i].kind = 'math';
    } else if (t?.lower === 'times') {
      entries[i].displayCore = '×';
      entries[i].kind = 'math';
    } else if (t?.lower === 'over') {
      entries[i].displayCore = '/';
      entries[i].kind = 'math';
    }

    if (t?.core && next?.lower === 'squared') {
      applyCombinedDisplay(i, i + 1, `${t.core}²`, 'math');
      i += 2;
      continue;
    }
    if (t?.core && next?.lower === 'cubed') {
      applyCombinedDisplay(i, i + 1, `${t.core}³`, 'math');
      i += 2;
      continue;
    }

    if (t?.lower === 'equals' || t?.lower === 'equal') {
      const prev = tokens[i - 1]?.lower || '';
      const canMultiply = isSingleLetter(tokens[i - 1]?.core || '') || FORMULA_CONTEXT.has(prev);
      if (
        canMultiply &&
        isSingleLetter(tokens[i + 1]?.core || '') &&
        isSingleLetter(tokens[i + 2]?.core || '')
      ) {
        const left = tokens[i + 1].core;
        const right = tokens[i + 2].core;
        entries[i + 1].ttsCore = `${left} times`;
        entries[i + 2].ttsCore = right;
        applyCombinedDisplay(i + 1, i + 2, `${left} × ${right}`, 'math');
        i += 3;
        continue;
      }
    }

    const splitMatch = t?.core?.match(/^(\d+)([A-Za-z]+)$/);
    if (splitMatch) {
      entries[i].ttsCore = `${splitMatch[1]} ${splitMatch[2]}`;
    }

    i += 1;
  }

  let ttsText = '';
  let displayText = '';
  let ttsPos = 0;
  let displayPos = 0;
  let prevTts = '';
  let prevDisplay = '';
  let lastDisplaySpan: [number, number] = [0, 0];

  const tokenMap = entries.map((entry) => {
    const ttsToken = `${entry.leading || ''}${entry.ttsCore || ''}${entry.trailing || ''}`.trim();
    const displayToken = `${entry.displayLeading || ''}${entry.displayCore || ''}${entry.displayTrailing || ''}`.trim();

    let ttsSpan: [number, number] = [ttsPos, ttsPos];
    if (ttsToken) {
      if (ttsText && shouldInsertSpace(prevTts, ttsToken)) {
        ttsText += ' ';
        ttsPos += 1;
      }
      const start = ttsPos;
      ttsText += ttsToken;
      ttsPos += ttsToken.length;
      ttsSpan = [start, ttsPos];
      prevTts = ttsToken;
    }

    let displaySpan: [number, number] = lastDisplaySpan;
    if (displayToken) {
      if (displayText && shouldInsertSpace(prevDisplay, displayToken)) {
        displayText += ' ';
        displayPos += 1;
      }
      const start = displayPos;
      displayText += displayToken;
      displayPos += displayToken.length;
      displaySpan = [start, displayPos];
      prevDisplay = displayToken;
      lastDisplaySpan = displaySpan;
    }

    return {
      displaySpan,
      ttsSpan,
      kind: entry.kind,
      raw: entry.raw,
      display: displayToken,
      tts: ttsToken,
    };
  });

  return {
    displayText: displayText.trim(),
    ttsText: ttsText.trim(),
    tokenMap,
  };
}

export function mapWordTimingsToDisplay({
  tokenMap,
  ttsText,
  displayText,
  ttsWordTimings,
}: {
  tokenMap: NormalizedNarration['tokenMap'];
  ttsText: string;
  displayText: string;
  ttsWordTimings: Array<Record<string, any>>;
}) {
  if (!Array.isArray(tokenMap) || !ttsText || !displayText || !ttsWordTimings?.length) {
    return ttsWordTimings || [];
  }

  const wordSpans: Array<{ start: number; end: number; text: string }> = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(ttsText))) {
    wordSpans.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }

  if (!wordSpans.length) return ttsWordTimings;

  let tokenIdx = 0;
  const findDisplaySpan = (wordSpan: { start: number; end: number }) => {
    while (tokenIdx < tokenMap.length && tokenMap[tokenIdx].ttsSpan[1] <= wordSpan.start) {
      tokenIdx += 1;
    }
    const entry = tokenMap[tokenIdx] || tokenMap[tokenMap.length - 1];
    if (!entry) return null;
    return entry.displaySpan;
  };

  return ttsWordTimings.map((timing, idx) => {
    const span = wordSpans[idx];
    if (!span) return timing;
    const displaySpan = findDisplaySpan(span);
    const text =
      displaySpan && displaySpan[1] > displaySpan[0]
        ? displayText.slice(displaySpan[0], displaySpan[1])
        : (timing as any).text || (timing as any).w || span.text;

    if (typeof (timing as any).start === 'number') {
      return { ...timing, text };
    }
    if (typeof (timing as any).t === 'number') {
      return { ...timing, w: text };
    }
    return timing;
  });
}
