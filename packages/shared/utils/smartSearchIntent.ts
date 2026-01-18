import { COUNTRIES } from './countries';

type CountryMatch = { code?: string; name?: string };

export type SmartSearchIntent = {
  raw: string;
  query: string;
  tokens: string[];
  keywords: string[];
  subject?: string;
  gradeBand?: string;
  level?: string;
  country?: CountryMatch;
  minRating?: number;
  maxPrice?: number;
};

export type SearchTarget = 'auto' | 'tutors' | 'courses' | 'library';

const SUBJECTS = [
  'Math',
  'Mathematics',
  'Science',
  'Physics',
  'Chemistry',
  'Biology',
  'Programming',
  'Computer Science',
  'Coding',
  'Art',
  'History',
  'Geography',
  'English',
  'Languages',
  'French',
  'Spanish',
  'Arabic',
  'German',
  'Economics',
  'Business',
  'Accounting',
  'Finance',
  'SAT',
  'IELTS',
  'TOEFL',
];

const LEVEL_SYNONYMS: Array<[RegExp, string]> = [
  [/\b(beginner|intro|introductory|basic)\b/i, 'Beginner'],
  [/\b(intermediate|mid)\b/i, 'Intermediate'],
  [/\b(advanced|expert|pro)\b/i, 'Advanced'],
  [/\b(all\s*levels|any\s*level)\b/i, 'All Levels'],
];

const GRADE_SYNONYMS: Array<[RegExp, string]> = [
  [/\b(pre-?k|kindergarten|primary|elementary|k\s*-?\s*5)\b/i, 'K-5'],
  [/\b(middle\s*school|junior\s*high|grades?\s*6\s*-\s*8|6\s*-\s*8)\b/i, '6-8'],
  [/\b(high\s*school|secondary|grades?\s*9\s*-\s*12|9\s*-\s*12)\b/i, '9-12'],
  [/\b(college|university|tertiary|undergraduate)\b/i, 'College'],
];

const COUNTRY_SYNONYMS: Record<string, string> = {
  uae: 'United Arab Emirates',
  emirates: 'United Arab Emirates',
  us: 'United States',
  usa: 'United States',
  america: 'United States',
  uk: 'United Kingdom',
  britain: 'United Kingdom',
  england: 'United Kingdom',
  kz: 'Kazakhstan',
};

const STOP_WORDS = new Set([
  'the',
  'and',
  'or',
  'for',
  'to',
  'with',
  'in',
  'on',
  'of',
  'a',
  'an',
  'course',
  'courses',
  'class',
  'classes',
  'lesson',
  'lessons',
  'videos',
  'video',
  'notes',
  'note',
  'explore',
  'learn',
  'learning',
]);

const TUTOR_INTENT_WORDS = new Set([
  'tutor',
  'tutors',
  'teacher',
  'teachers',
  'instructor',
  'instructors',
  'coach',
  'coaches',
]);

const LIBRARY_INTENT_WORDS = new Set([
  'video',
  'videos',
  'notes',
  'library',
  'vault',
  'oer',
]);

const SCOPE_HINTS = new Set(['free', 'purchased', 'saved', 'paid']);

const COUNTRY_LOOKUP = (() => {
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  (Array.isArray(COUNTRIES) ? COUNTRIES : []).forEach((c) => {
    const code = String(c?.code ?? '').toUpperCase();
    const name = String(c?.name ?? '').trim();
    if (code) byCode.set(code, name);
    if (name) byName.set(name.toLowerCase(), name);
  });
  return { byCode, byName };
})();

export function normalizeCountryLabel(input?: string | null): CountryMatch | undefined {
  const raw = String(input || '').trim();
  if (!raw) return undefined;

  const normalized = raw.toLowerCase();
  if (COUNTRY_SYNONYMS[normalized]) {
    const name = COUNTRY_SYNONYMS[normalized];
    const code = Array.from(COUNTRY_LOOKUP.byCode.entries()).find(([, n]) => n === name)?.[0];
    return { code, name };
  }

  const codeCandidate = raw.toUpperCase();
  if (COUNTRY_LOOKUP.byCode.has(codeCandidate)) {
    return { code: codeCandidate, name: COUNTRY_LOOKUP.byCode.get(codeCandidate) };
  }

  if (COUNTRY_LOOKUP.byName.has(normalized)) {
    const name = COUNTRY_LOOKUP.byName.get(normalized)!;
    const code = Array.from(COUNTRY_LOOKUP.byCode.entries()).find(([, n]) => n === name)?.[0];
    return { code, name };
  }

  return undefined;
}

const normalizeText = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s-]/gi, ' ');

const extractKeywords = (text: string, excluded: Set<string>) => {
  const cleaned = normalizeText(text);
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const keywords = tokens.filter((t) => !excluded.has(t) && !STOP_WORDS.has(t));
  return { tokens, keywords };
};

const findSubject = (text: string): string | undefined => {
  const lower = text.toLowerCase();
  const subject = SUBJECTS.find((s) => lower.includes(s.toLowerCase()));
  return subject;
};

const findGradeBand = (text: string): string | undefined => {
  for (const [regex, value] of GRADE_SYNONYMS) {
    if (regex.test(text)) return value;
  }

  const match = text.match(/\bgrade\s*(\d{1,2})\b/i);
  if (match) {
    const grade = Number(match[1]);
    if (grade <= 5) return 'K-5';
    if (grade <= 8) return '6-8';
    if (grade <= 12) return '9-12';
  }

  return undefined;
};

const findLevel = (text: string): string | undefined => {
  for (const [regex, value] of LEVEL_SYNONYMS) {
    if (regex.test(text)) return value;
  }
  return undefined;
};

const findRating = (text: string): number | undefined => {
  const match = text.match(/\b(\d(?:\.\d)?)\s*(?:star|stars|rating)\b/i);
  if (match) return Math.min(5, Math.max(1, Number(match[1])));
  const match2 = text.match(/\b(\d(?:\.\d)?)\+\b/);
  if (match2) return Math.min(5, Math.max(1, Number(match2[1])));
  return undefined;
};

const findMaxPrice = (text: string): number | undefined => {
  const match = text.match(/(?:under|below|max|<=?)\s*\$?(\d{1,6})/i);
  if (match) return Number(match[1]);
  const match2 = text.match(/\$\s*(\d{1,6})/);
  if (match2) return Number(match2[1]);
  return undefined;
};

export function parseSmartSearchIntent(rawInput: string): SmartSearchIntent {
  const raw = rawInput ?? '';
  const query = String(raw).trim();
  const normalized = normalizeText(query);

  const subject = findSubject(normalized);
  const gradeBand = findGradeBand(normalized);
  const level = findLevel(normalized);
  const minRating = findRating(normalized);
  const maxPrice = findMaxPrice(normalized);

  let country: CountryMatch | undefined;
  const words = normalized.split(/\s+/).filter(Boolean);
  for (const token of words) {
    const hit = normalizeCountryLabel(token);
    if (hit) {
      country = hit;
      break;
    }
  }
  if (!country && normalized.length > 2) {
    for (const [name] of COUNTRY_LOOKUP.byName) {
      if (normalized.includes(name)) {
        country = normalizeCountryLabel(name);
        break;
      }
    }
  }

  const excluded = new Set<string>();
  if (subject) subject.toLowerCase().split(' ').forEach((w) => excluded.add(w));
  if (gradeBand) gradeBand.toLowerCase().split(' ').forEach((w) => excluded.add(w));
  if (level) level.toLowerCase().split(' ').forEach((w) => excluded.add(w));
  if (country?.name) country.name.toLowerCase().split(' ').forEach((w) => excluded.add(w));
  if (country?.code) excluded.add(country.code.toLowerCase());

  const { tokens, keywords } = extractKeywords(normalized, excluded);

  return {
    raw,
    query,
    tokens,
    keywords,
    subject,
    gradeBand,
    level,
    country,
    minRating,
    maxPrice,
  };
}

export function rankMatch(haystack: string | string[], intent: SmartSearchIntent): number {
  if (!intent.query) return 0;
  const text = Array.isArray(haystack) ? haystack.join(' ') : haystack;
  const lower = text.toLowerCase();
  let score = 0;

  if (intent.subject && lower.includes(intent.subject.toLowerCase())) score += 6;
  if (intent.gradeBand && lower.includes(intent.gradeBand.toLowerCase())) score += 4;
  if (intent.level && lower.includes(intent.level.toLowerCase())) score += 3;
  if (intent.country?.name && lower.includes(intent.country.name.toLowerCase())) score += 4;

  intent.keywords.forEach((k) => {
    if (lower.includes(k.toLowerCase())) score += 2;
  });

  return score;
}

export function resolveSearchTarget(query: string, preferred: SearchTarget = 'auto'): SearchTarget {
  if (preferred !== 'auto') return preferred;
  const text = normalizeText(query);
  const tokens = text.split(/\s+/).filter(Boolean);

  if (tokens.some((t) => TUTOR_INTENT_WORDS.has(t))) return 'tutors';
  if (tokens.some((t) => LIBRARY_INTENT_WORDS.has(t))) return 'library';

  return 'courses';
}

export function extractScopeHint(query: string): 'all' | 'free' | 'purchased' {
  const text = normalizeText(query);
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.includes('free')) return 'free';
  if (tokens.includes('purchased') || tokens.includes('paid') || tokens.includes('saved'))
    return 'purchased';
  if (tokens.some((t) => SCOPE_HINTS.has(t))) return 'purchased';
  return 'all';
}
