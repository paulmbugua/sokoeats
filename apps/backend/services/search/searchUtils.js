// apps/backend/services/search/searchUtils.js

export const toStr = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return String(v).trim();
};

export const toArr = (v) => {
  if (v == null) return [];
  const raw = Array.isArray(v) ? v : [v];
  return raw
    .flatMap((item) => String(item ?? '').split(','))
    .map((item) => item.trim())
    .filter(Boolean);
};

export const clampInt = (n, min, max, fallback = min) => {
  const raw = Array.isArray(n) ? n[0] : n;
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  const floored = Math.floor(num);
  if (Number.isFinite(max)) return Math.min(Math.max(floored, min), max);
  return Math.max(floored, min);
};

export const nowMs = () => Date.now();

export const normalizeText = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const buildSubjectSearch = (subject) => {
  const normalized = normalizeText(subject);
  if (!normalized) {
    return { normalized: '', likes: [] };
  }

  const aliasMap = {
    math: ['math', 'maths', 'mathematics'],
    maths: ['math', 'maths', 'mathematics'],
    mathematics: ['math', 'maths', 'mathematics'],
    'computer science': ['computer science', 'cs', 'computing'],
    cs: ['computer science', 'cs', 'computing'],
    computing: ['computer science', 'cs', 'computing'],
    english: ['english', 'ela', 'language arts'],
    ela: ['english', 'ela', 'language arts'],
    'language arts': ['english', 'ela', 'language arts'],
  };

  const aliases = aliasMap[normalized] ?? [normalized];
  const likes = Array.from(new Set(aliases)).map((alias) => `%${alias}%`);

  return { normalized, likes };
};

export const scoreTextMatch = ({ q, title }) => {
  const query = normalizeText(q);
  if (!query) return 0;
  const target = normalizeText(title);
  if (!target) return 0;

  let score = 0;
  if (target === query) score += 50;
  if (target.startsWith(query)) score += 20;
  if (target.includes(query)) score += 15;

  const words = query.split(' ').filter(Boolean);
  const wordHits = words.reduce((acc, word) => acc + (target.includes(word) ? 1 : 0), 0);
  score += wordHits * 4;

  return score;
};

export const scoreIntentMatch = ({ intent, subject, provider }) => {
  if (!intent) return 0;
  let score = 0;
  const subjectNorm = normalizeText(subject);
  const providerNorm = normalizeText(provider);

  if (intent.subject && subjectNorm.includes(normalizeText(intent.subject))) {
    score += 10;
  }

  const intentProviders = Array.isArray(intent.providers)
    ? intent.providers
    : toArr(intent.providers);
  if (intentProviders.length) {
    const hits = intentProviders.filter((p) => providerNorm.includes(normalizeText(p)));
    if (hits.length) score += 8;
  }

  return score;
};
