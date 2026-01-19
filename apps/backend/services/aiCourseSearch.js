// apps/backend/services/aiCourseSearch.js
import { aiJson, cacheGetJSON, cacheSetJSON, sha1, dlog } from './aiCourseCore.js';
import { COUNTRIES, resolveCountryIso2FromText } from '../utils/countries.js';


const ALLOWED_SUBJECTS = [
  'Math',
  'Science',
  'Programming',
  'Art',
  'Wellness',
  'Languages',
  'English',
  'History',
];

const ISO2_TO_NAME = new Map(COUNTRIES.map((c) => [c.code, c.name]));

// for stripping aliases if the query used them
const COUNTRY_ALIAS_RE = /\b(usa|u\.s\.a|uk|u\.k\.|uae)\b/gi;

const AI_SEARCH_TTL_SEC = Number(process.env.AI_COURSE_SEARCH_TTL_SEC || 600);

/**
 * New fields added:
 * - scope: "all" | "purchased" | "free" | ""
 * - providers: ["openstax","khan","ck-12", ...]
 * - contentKinds: ["course","video","notes","book","doc"]
 * - sourceKind: "tutor" | "oer" | "sandbox" | ""
 *
 * Keep strict schema so aiJson must return these keys.
 */
const SEARCH_INTENT_SCHEMA = {
  name: 'CourseSearchIntentV2',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
     countryIso2: { type: 'string' },
      keywords: { type: 'string' }, // topic keywords only
      subject: { type: 'string' }, // one of ALLOWED_SUBJECTS or ""
      gradeBand: { type: 'string' }, // free-form
      level: { type: 'string' }, // Beginner|Intermediate|Advanced|All Levels|"" only
      country: { type: 'string' }, // free-form (we sanitize lightly)
      duration: { type: 'string' }, // e.g. "4 weeks"
      tutor: { type: 'string' }, // name fragment
      minRating: { type: 'number' }, // 0..5
      maxPrice: { type: 'number' }, // numeric (tokens)
      isOer: { type: 'boolean' }, // free/OER intent
      sort: { type: 'string' }, // "top"|"cheap"|"new"|"" only

      // new
      scope: { type: 'string' }, // "all"|"purchased"|"free"|"" (library intent)
      providers: {
        type: 'array',
        items: { type: 'string' }, // normalized canonical providers e.g. "openstax"
      },
      contentKinds: {
        type: 'array',
        items: { type: 'string' }, // "course"|"video"|"notes"|"book"|"doc"
      },
      sourceKind: { type: 'string' }, // "tutor"|"oer"|"sandbox"|"" (courses truth filter)
    },
    required: [
  'keywords',
  'subject',
  'gradeBand',
  'level',
  'countryIso2',
  'country',
  'duration',
  'tutor',
  'minRating',
  'maxPrice',
  'isOer',
  'sort',
  'scope',
  'providers',
  'contentKinds',
  'sourceKind',
],

  },
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[•|,/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(s) {
  const x = String(s || '').trim();
  if (!x) return '';
  return x
    .split(/\s+/g)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripOnce(haystack, needle) {
  if (!needle) return String(haystack || '').trim();
  const re = new RegExp(`\\b${escapeRegex(needle)}\\b`, 'ig');
  return String(haystack || '')
    .replace(re, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ─────────────────────────────────────────────────────────
 * Provider + Scope + ContentKinds heuristics
 * ───────────────────────────────────────────────────────── */

const PROVIDER_ALIASES = [
  { canon: 'openstax', re: /\b(open\s*stax|openstax)\b/i },
  { canon: 'khan', re: /\b(khan|khan\s*academy)\b/i },
  { canon: 'ck-12', re: /\b(ck\s*-?\s*12|ck12)\b/i },
];

function extractProvidersHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const found = new Set();
  let remainder = q;

  for (const p of PROVIDER_ALIASES) {
    if (p.re.test(q)) {
      found.add(p.canon);
      remainder = remainder.replace(p.re, ' ');
    }
  }

  remainder = remainder.replace(/\s+/g, ' ').trim();
  return { providers: Array.from(found), remainder };
}

function extractScopeHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const s = norm(q);

  // purchased / owned / saved library
  const purchased =
    /\b(my|mine)\b/.test(s) &&
    /\b(purchased|bought|paid|saved|owned|downloaded)\b/.test(s) &&
    /\b(video|videos|notes|resources|library)\b/.test(s);

  // explicit purchased phrases
  const purchased2 =
    /\b(only\s+)?(my\s+)?(purchased|bought|paid)\b/.test(s) &&
    /\b(video|videos|notes|resources|library)\b/.test(s);

  // free only
  const freeOnly =
    /\b(free\s+only|only\s+free|no\s+cost|zero\s+cost)\b/.test(s) ||
    (/\bfree\b/.test(s) && /\bonly\b/.test(s));

  let scope = '';
  if (purchased || purchased2) scope = 'purchased';
  else if (freeOnly) scope = 'free';

  let remainder = q;
  if (scope === 'purchased') {
    remainder = remainder
      .replace(/\b(my|mine)\b/gi, ' ')
      .replace(/\b(purchased|bought|paid|saved|owned|downloaded)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } else if (scope === 'free') {
    remainder = remainder
      .replace(/\b(free\s+only|only\s+free|no\s+cost|zero\s+cost|free)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return { scope, remainder };
}

function extractContentKindsHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const s = norm(q);
  const kinds = new Set();

  // notes-ish
  if (/\b(notes?|revision\s*notes?|handouts?|past\s*papers?|worksheets?|pdfs?)\b/i.test(s)) {
    kinds.add('notes');
  }

  // video-ish
  if (/\b(video|videos|lecture|lectures|playlist|record(ed)?|stream)\b/i.test(s)) {
    kinds.add('video');
  }

  // course-ish
  if (/\b(course|courses|class|classes|lesson|lessons)\b/i.test(s)) {
    kinds.add('course');
  }

  // doc-ish
  if (/\b(doc|docs|document|documents|book|books|textbook|textbooks)\b/i.test(s)) {
    // keep both possibilities; backend can interpret
    kinds.add('doc');
    kinds.add('book');
  }

  let remainder = q;
  if (kinds.has('notes')) remainder = remainder.replace(/\b(notes?|revision\s*notes?|handouts?|past\s*papers?|worksheets?|pdfs?)\b/gi, ' ');
  if (kinds.has('video')) remainder = remainder.replace(/\b(video|videos|lecture|lectures|playlist|record(ed)?|stream)\b/gi, ' ');
  if (kinds.has('course')) remainder = remainder.replace(/\b(course|courses|class|classes|lesson|lessons)\b/gi, ' ');
  if (kinds.has('doc') || kinds.has('book'))
    remainder = remainder.replace(/\b(doc|docs|document|documents|book|books|textbook|textbooks)\b/gi, ' ');

  remainder = remainder.replace(/\s+/g, ' ').trim();
  return { contentKinds: Array.from(kinds), remainder };
}

/**
 * sourceKind: tutor vs oer vs sandbox
 * - "AI sandbox" / "robot tutor" => sandbox
 * - "OER" / OpenStax / Khan / CK-12 => oer
 * - "tutor-made" / "teacher-made" => tutor
 */
function extractSourceKindHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const s = norm(q);

  let sourceKind = '';

  if (/\b(ai\s*sandbox|robot\s*tutor|ai\s*tutor|generated\s+by\s+ai)\b/i.test(s)) sourceKind = 'sandbox';
  if (/\b(tutor[-\s]*made|teacher[-\s]*made|instructor[-\s]*made|uploaded\s+by\s+tutor)\b/i.test(s))
    sourceKind = 'tutor';

  // provider / oer terms override tutor hints if explicit
  if (/\b(oer|open\s*stax|openstax|khan|ck-?12|ck12)\b/i.test(s)) sourceKind = 'oer';

  let remainder = q;
  if (sourceKind === 'sandbox') remainder = remainder.replace(/\b(ai\s*sandbox|robot\s*tutor|ai\s*tutor|generated\s+by\s+ai)\b/gi, ' ');
  if (sourceKind === 'tutor')
    remainder = remainder.replace(/\b(tutor[-\s]*made|teacher[-\s]*made|instructor[-\s]*made|uploaded\s+by\s+tutor)\b/gi, ' ');
  if (sourceKind === 'oer') remainder = remainder.replace(/\b(oer|open\s*stax|openstax|khan|ck-?12|ck12)\b/gi, ' ');

  remainder = remainder.replace(/\s+/g, ' ').trim();
  return { sourceKind, remainder };
}

/* ─────────────────────────────────────────────────────────
 * Existing heuristics (with upgrades)
 * ───────────────────────────────────────────────────────── */

function extractGradeBandHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const lower = q.toLowerCase();

  // ✅ KCSE / KCPE implies Kenya context (country heuristic will handle too)
  // Keep grade band extraction here only.

  // "Form II" / "Form IV" etc
  const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
  const rm = lower.match(/\bform\s*(i|ii|iii|iv|v|vi)\b/i);
  if (rm) {
    const n = roman[String(rm[1]).toLowerCase()] || '';
    if (n) {
      const band = `Form ${n}`;
      return { gradeBand: band, remainder: stripOnce(q, rm[0]) };
    }
  }

  // "F2" / "F3" etc
  const fm = lower.match(/\bf\s*([1-6])\b/i);
  if (fm) {
    const band = `Form ${fm[1]}`;
    return { gradeBand: band, remainder: stripOnce(q, fm[0]) };
  }

  // "grade 6" / "class 8" / "form 2" / "year 7" / "level 3"
  const m = lower.match(/\b(grade|class|form|year|level)\s*([0-9]{1,3})\b/i);
  if (m) {
    const key = String(m[1]).toLowerCase();
    const n = String(m[2]);

    // normalize "class 8" into "Grade 8" if you prefer; keep as title case for now
    const label =
      key === 'form' ? `Form ${n}` : `${titleCase(m[1])} ${n}`;

    return { gradeBand: label, remainder: stripOnce(q, m[0]) };
  }

  const buckets = [
    'kindergarten',
    'kg',
    'nursery',
    'pre-k',
    'preschool',
    'elementary',
    'primary',
    'middle school',
    'junior secondary',
    'secondary',
    'high school',
    'senior secondary',
    'college',
    'university',
    'tertiary',
    'academy',
    'technical',
    'tveta',
    'vocational',
    'polytechnic',
  ];

  for (const b of buckets) {
    if (lower.includes(b)) {
      const band = titleCase(b.replace(/-/g, ' '));
      return { gradeBand: band, remainder: stripOnce(q, b) };
    }
  }

  return { gradeBand: '', remainder: q };
}

function extractSubjectHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const s = norm(q);

  const rules = [
    {
      re: /\b(math|maths|mathematics|algebra|geometry|calculus|fractions|decimals)\b/i,
      subject: 'Math',
    },
    { re: /\b(science|biology|chemistry|physics)\b/i, subject: 'Science' },
    {
      re: /\b(programming|coding|computer science|javascript|python|react|node)\b/i,
      subject: 'Programming',
    },
    { re: /\b(art|drawing|painting|design)\b/i, subject: 'Art' },
    { re: /\b(wellness|health|fitness|mindfulness)\b/i, subject: 'Wellness' },
    {
      re: /\b(language|languages|french|spanish|arabic|german|swahili)\b/i,
      subject: 'Languages',
    },
    { re: /\b(english|grammar|writing|reading)\b/i, subject: 'English' },
    { re: /\b(history|geography|civics)\b/i, subject: 'History' },
  ];

  for (const r of rules) {
    const m = s.match(r.re);
    if (m) return { subject: r.subject, remainder: stripOnce(q, m[0]) };
  }
  return { subject: '', remainder: q };
}

function extractDifficultyHeuristic(qRaw) {
  const q = norm(qRaw);
  if (/\bbeginner\b/.test(q))
    return { level: 'Beginner', remainder: stripOnce(qRaw, 'beginner') };
  if (/\bintermediate\b/.test(q))
    return { level: 'Intermediate', remainder: stripOnce(qRaw, 'intermediate') };
  if (/\badvanced\b/.test(q))
    return { level: 'Advanced', remainder: stripOnce(qRaw, 'advanced') };
  if (/\ball levels\b|\ball-levels\b/.test(q))
    return { level: 'All Levels', remainder: stripOnce(qRaw, 'all levels') };
  return { level: '', remainder: qRaw };
}

function extractOerHeuristic(qRaw) {
  const q = norm(qRaw);
  const isOer =
    /\b(oer|open stax|openstax|khan|ck-?12|ck12|free)\b/i.test(q) ||
    /\bno cost\b|\bzero cost\b/.test(q);

  const remainder = isOer
    ? qRaw
        .replace(
          /\b(oer|open stax|openstax|khan|ck-?12|ck12|free|no cost|zero cost)\b/gi,
          ' ',
        )
        .replace(/\s+/g, ' ')
        .trim()
    : qRaw;

  return { isOer, remainder };
}

function extractMaxPriceHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const s = norm(q);

  const m =
    s.match(/\b(under|below|less than|up to|max(?:imum)?|budget)\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\b/i) ||
    s.match(/\b\$([0-9]+(?:\.[0-9]+)?)\b/);

  if (!m) return { maxPrice: 0, remainder: q };

  const num = Number(m[m.length - 1]);
  if (!Number.isFinite(num)) return { maxPrice: 0, remainder: q };

  const phrase = m[0];
  const remainder = q
    .replace(new RegExp(escapeRegex(phrase), 'ig'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { maxPrice: Math.max(0, num), remainder };
}

function extractMinRatingHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const s = norm(q);

  const m =
    s.match(/\b([0-5](?:\.[0-9])?)\s*\+?\s*(?:stars?|star|rating)\b/i) ||
    s.match(/\b(?:at least|minimum)\s*([0-5](?:\.[0-9])?)\b/i);

  if (!m) return { minRating: 0, remainder: q };

  const num = Number(m[1]);
  if (!Number.isFinite(num)) return { minRating: 0, remainder: q };

  const phrase = m[0];
  const remainder = q
    .replace(new RegExp(escapeRegex(phrase), 'ig'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { minRating: clamp(num, 0, 5), remainder };
}

function extractDurationHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const s = norm(q);

  const m = s.match(
    /\b([0-9]{1,3})\s*(weeks?|months?|days?|hours?|hrs?|minutes?|mins?)\b/i,
  );
  if (!m) return { duration: '', remainder: q };

  const n = m[1];
  const unitRaw = m[2];
  const unit = unitRaw
    .toLowerCase()
    .replace(/^hrs?$/, 'hours')
    .replace(/^mins?$/, 'minutes');

  const duration = `${n} ${unit}`;
  const remainder = q
    .replace(new RegExp(escapeRegex(m[0]), 'ig'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { duration, remainder };
}

function extractTutorHeuristic(qRaw) {
  const q = String(qRaw || '').trim();

  const m = q.match(
    /\b(?:by|tutor|teacher|instructor)\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,2})\b/i,
  );
  if (!m) return { tutor: '', remainder: q };

  const tutor = titleCase(m[1]).trim();
  const remainder = q
    .replace(new RegExp(escapeRegex(m[0]), 'ig'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { tutor, remainder };
}

function extractCountryHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const s = norm(q);

  // Kenya exam acronyms => Kenya
  if (/\bkcse\b|\bkcpe\b/.test(s)) {
    const remainder = q
      .replace(/\bkcse\b|\bkcpe\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { country: 'Kenya', countryIso2: 'KE', remainder };
  }

  // Prefer "in/for/from X" capture so we can strip reliably
  const m = s.match(/\b(?:in|for|from)\s+([a-z][a-z\s]{2,40})\b/i);
  if (m) {
    const cand = String(m[1] || '').trim();
    const iso2 = resolveCountryIso2FromText(cand);
    if (iso2) {
      const name = ISO2_TO_NAME.get(iso2) || '';
      const remainder = q
        .replace(new RegExp(`\\b(?:in|for|from)\\s+${escapeRegex(cand)}\\b`, 'ig'), ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { country: name || titleCase(cand), countryIso2: iso2, remainder };
    }
  }

  // Fallback: scan whole query using your shared resolver
  const iso2 = resolveCountryIso2FromText(q);
  if (iso2) {
    const name = ISO2_TO_NAME.get(iso2) || '';

    // try to strip the canonical country name if it appears; also strip common aliases
    let remainder = q;
    if (name) remainder = remainder.replace(new RegExp(`\\b${escapeRegex(name)}\\b`, 'ig'), ' ');
    remainder = remainder.replace(COUNTRY_ALIAS_RE, ' ');
    remainder = remainder.replace(/\s+/g, ' ').trim();

    return { country: name, countryIso2: iso2, remainder };
  }

  return { country: '', countryIso2: '', remainder: q };
}


function sanitizeCountryPair(country, countryIso2, fallbackCountry, fallbackIso2) {
  // prefer ISO2 if it resolves
  const iso2 =
    (typeof countryIso2 === 'string' && resolveCountryIso2FromText(countryIso2)) ||
    (typeof country === 'string' && resolveCountryIso2FromText(country)) ||
    (typeof fallbackIso2 === 'string' && resolveCountryIso2FromText(fallbackIso2)) ||
    (typeof fallbackCountry === 'string' && resolveCountryIso2FromText(fallbackCountry)) ||
    '';

  const name = iso2 ? (ISO2_TO_NAME.get(iso2) || '') : (titleCase(String(country || fallbackCountry || '').trim()) || '');

  return { country: name, countryIso2: iso2 };
}


function extractSortHeuristic(qRaw, { minRating, maxPrice } = {}) {
  const q = norm(qRaw);

  const wantsTop =
    /\b(top|best|highest rated|most rated|top rated|rating)\b/.test(q) ||
    (Number(minRating || 0) > 0 && /\brating|stars?\b/.test(q));

  const wantsCheap =
    /\b(cheap|affordable|budget|low cost|price|under|below|less than)\b/.test(q) ||
    Number(maxPrice || 0) > 0;

  const wantsNew = /\b(new|latest|recent)\b/.test(q);

  let sort = '';
  if (wantsTop) sort = 'top';
  else if (wantsCheap) sort = 'cheap';
  else if (wantsNew) sort = 'new';

  let remainder = qRaw;
  if (sort === 'top') {
    remainder = remainder
      .replace(/\b(top|best|highest rated|most rated|top rated)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } else if (sort === 'cheap') {
    remainder = remainder
      .replace(/\b(cheap|affordable|budget|low cost|price)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } else if (sort === 'new') {
    remainder = remainder
      .replace(/\b(new|latest|recent)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return { sort, remainder };
}

/* ─────────────────────────────────────────────────────────
 * Sanitizers
 * ───────────────────────────────────────────────────────── */

function sanitizeSubject(subj) {
  const s = String(subj || '').trim();
  if (!s) return '';
  if (ALLOWED_SUBJECTS.includes(s)) return s;

  const t = titleCase(s);
  if (ALLOWED_SUBJECTS.includes(t)) return t;

  const mapped = extractSubjectHeuristic(s).subject;
  if (mapped && ALLOWED_SUBJECTS.includes(mapped)) return mapped;

  return '';
}

function sanitizeLevel(level) {
  const x = titleCase(String(level || '').trim());
  if (['', 'Beginner', 'Intermediate', 'Advanced', 'All Levels'].includes(x)) return x;
  return '';
}

function sanitizeSort(sort) {
  const s = String(sort || '').trim().toLowerCase();
  if (s === 'top' || s === 'cheap' || s === 'new') return s;
  return '';
}

function sanitizeScope(scope) {
  const s = String(scope || '').trim().toLowerCase();
  if (s === 'all' || s === 'purchased' || s === 'free') return s;
  return '';
}

function sanitizeProviders(providers) {
  const arr = Array.isArray(providers) ? providers : [];
  const out = [];
  for (const p of arr) {
    const n = String(p || '').trim().toLowerCase();
    if (!n) continue;
    // accept known canonical values + allow future providers
    // normalize common variants
    if (n === 'open stax') out.push('openstax');
    else if (n === 'khan academy') out.push('khan');
    else if (n === 'ck12') out.push('ck-12');
    else out.push(n);
  }
  return Array.from(new Set(out)).slice(0, 6);
}

function sanitizeContentKinds(kinds) {
  const arr = Array.isArray(kinds) ? kinds : [];
  const allowed = new Set(['course', 'video', 'notes', 'book', 'doc']);
  const out = [];
  for (const k of arr) {
    const n = String(k || '').trim().toLowerCase();
    if (!n) continue;
    // normalize plurals
    const canon =
      n === 'videos' ? 'video' :
      n === 'courses' ? 'course' :
      n === 'books' ? 'book' :
      n === 'docs' ? 'doc' :
      n;

    if (allowed.has(canon)) out.push(canon);
  }
  return Array.from(new Set(out)).slice(0, 5);
}

function sanitizeSourceKind(k) {
  const s = String(k || '').trim().toLowerCase();
  if (s === 'tutor' || s === 'oer' || s === 'sandbox') return s;
  return '';
}

/* ─────────────────────────────────────────────────────────
 * Keywords cleaning
 * ───────────────────────────────────────────────────────── */

function cleanKeywords({
  keywords,
  gradeBand,
  subject,
  level,
  country,
  duration,
  tutor,
  providers = [],
  scope,
  contentKinds = [],
  sourceKind,
}) {
  let k = String(keywords || '').trim();
  if (!k) return '';

  if (gradeBand) k = stripOnce(k, gradeBand);
  if (subject) k = stripOnce(k, subject);
  if (level) k = stripOnce(k, level);
  if (country) k = stripOnce(k, country);
  if (duration) k = stripOnce(k, duration);
  if (tutor) k = stripOnce(k, tutor);

  for (const p of providers || []) {
    k = stripOnce(k, p);
  }

  if (scope) k = stripOnce(k, scope);
  if (sourceKind) k = stripOnce(k, sourceKind);
  for (const ck of contentKinds || []) k = stripOnce(k, ck);

  k = k
    .replace(COUNTRY_ALIAS_RE, ' ')
    .replace(/\b(grade|class|form|year|level)\s*[0-9]{1,3}\b/gi, ' ')
    .replace(/\bform\s*(i|ii|iii|iv|v|vi)\b/gi, ' ')
    .replace(/\bf\s*[1-6]\b/gi, ' ')
    .replace(/\bkcse\b|\bkcpe\b/gi, ' ')
    .replace(
      /\b(under|below|less than|up to|max(?:imum)?|budget)\s*\$?\s*[0-9]+(?:\.[0-9]+)?\b/gi,
      ' ',
    )
    .replace(/\b([0-5](?:\.[0-9])?)\s*\+?\s*(?:stars?|rating)\b/gi, ' ')
    .replace(/\b(oer|open\s*stax|openstax|khan|ck-?12|ck12|free|no cost|zero cost)\b/gi, ' ')
    .replace(/\b(my|mine|purchased|bought|paid|saved|owned|downloaded)\b/gi, ' ')
    .replace(/\b(video|videos|lecture|lectures|playlist|notes?|revision|papers?|worksheets?|pdfs?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return k;
}

function isEmptyAfterHeuristics(remainder) {
  return norm(remainder).length === 0;
}

/* ─────────────────────────────────────────────────────────
 * Main
 * ───────────────────────────────────────────────────────── */

export async function aiParseCourseSearch(query) {
  const q = String(query || '').trim();
  const started = Date.now();
  const reqId = `aiCourseSearch:${Math.random().toString(36).slice(2, 10)}`;

  if (!q) {
    return {
      keywords: '',
      subject: '',
      gradeBand: '',
      level: '',
      country: '',
      duration: '',
      tutor: '',
      minRating: 0,
      maxPrice: 0,
      isOer: false,
      sort: '',
      countryIso2: '',
      scope: '',
      providers: [],
      contentKinds: [],
      sourceKind: '',
    };
  }

  // Redis cache (best-effort)
  const cacheKey = `ai:courseSearchIntent:v2:${sha1({ q })}`;
  try {
    const hit = await cacheGetJSON(cacheKey);
    if (hit && typeof hit === 'object') {
      dlog('courseSearch', `cache HIT`, { cacheKey });
      return hit;
    }
  } catch {
    // ignore
  }

  // Heuristics pipeline (order matters)
  const pr = extractProvidersHeuristic(q);
  const sc = extractScopeHeuristic(pr.remainder);
  const ck = extractContentKindsHeuristic(sc.remainder);
  const sk = extractSourceKindHeuristic(ck.remainder);

  const g = extractGradeBandHeuristic(sk.remainder);
  const s = extractSubjectHeuristic(g.remainder);
  const d = extractDifficultyHeuristic(s.remainder);
  const o = extractOerHeuristic(d.remainder);
  const p = extractMaxPriceHeuristic(o.remainder);
  const r = extractMinRatingHeuristic(p.remainder);
  const du = extractDurationHeuristic(r.remainder);
  const tu = extractTutorHeuristic(du.remainder);
  const co = extractCountryHeuristic(tu.remainder);
  const so = extractSortHeuristic(co.remainder, {
    minRating: r.minRating,
    maxPrice: p.maxPrice,
  });

  // derive isOer from providers/scope if needed
  const impliedOer = pr.providers.length > 0 || sc.scope === 'free' || sk.sourceKind === 'oer';
  const isOerFinal = Boolean(o.isOer) || impliedOer;

  // derive sourceKind if empty
  const sourceKindFinal = sk.sourceKind || (isOerFinal ? 'oer' : '');

  const heuristic = {
    // new
    scope: sc.scope,
    providers: pr.providers,
    contentKinds: ck.contentKinds,
    sourceKind: sourceKindFinal,

    // existing
    gradeBand: g.gradeBand,
    subject: s.subject,
    level: d.level,
    isOer: isOerFinal,
    maxPrice: p.maxPrice,
    minRating: r.minRating,
    duration: du.duration,
    tutor: tu.tutor,
    country: co.country,
    countryIso2: co.countryIso2,
    sort: so.sort,
  };

  const remainder = so.remainder;

  // If basically just filters (no meaningful keywords), skip AI
  const onlyFiltersLike =
    isEmptyAfterHeuristics(remainder) && Object.values(heuristic).some((v) => {
      if (Array.isArray(v)) return v.length > 0;
      return Boolean(v);
    });

  if (onlyFiltersLike) {

    const cpair = sanitizeCountryPair(
    '', // no AI
    '', // no AI
    heuristic.country,
    heuristic.countryIso2,
  );
    const out = {
      keywords: '',
      subject: sanitizeSubject(heuristic.subject),
      gradeBand: heuristic.gradeBand || '',
      level: sanitizeLevel(heuristic.level),
      country: cpair.country,
      countryIso2: cpair.countryIso2,
      duration: heuristic.duration || '',
      tutor: heuristic.tutor || '',
      minRating: clamp(Number(heuristic.minRating || 0) || 0, 0, 5),
      maxPrice: Math.max(0, Number(heuristic.maxPrice || 0) || 0),
      isOer: Boolean(heuristic.isOer),
      sort: sanitizeSort(heuristic.sort),

      scope: sanitizeScope(heuristic.scope),
      providers: sanitizeProviders(heuristic.providers),
      contentKinds: sanitizeContentKinds(heuristic.contentKinds),
      sourceKind: sanitizeSourceKind(heuristic.sourceKind),
    };

    

    // If OER or free: force maxPrice 0
    if (out.isOer || out.scope === 'free' || out.sourceKind === 'oer') out.maxPrice = 0;

    // Normalize: if sourceKind is set, enforce isOer alignment
    if (out.sourceKind === 'oer') out.isOer = true;
    if (out.sourceKind === 'tutor') out.isOer = false;

    out.keywords = cleanKeywords(out);

    console.log(`[${reqId}] heuristic-only`, { q, heuristic, out, ms: Date.now() - started });

    try {
      await cacheSetJSON(cacheKey, out, AI_SEARCH_TTL_SEC);
    } catch {
      // ignore
    }
    return out;
  }

  // AI parse (schema strict)
  const system = `
You extract a user's search intent into structured fields for a tutoring/learning app.
This intent may apply to:
- Courses (tutor courses / OER courses / AI sandbox courses)
- Library resources (videos, notes, documents)

Rules:
- Return valid JSON only.
- "keywords" must contain ONLY topic keywords (not filters like "under", "cheap", "beginner", "grade", "stars", "free", "videos", "notes").
- subject MUST be one of these exact values, or empty:
  ${ALLOWED_SUBJECTS.join(', ')}
- countryIso2: ISO2 code if possible (e.g. Kenya => "KE", Qatar => "QA"). If unsure, return "".
- country: the country common name if present, else "".

- level MUST be one of: Beginner, Intermediate, Advanced, All Levels, or "".
- gradeBand is free-form but normalized when possible: "Grade 6", "Year 7", "Form 2", "Primary", "Secondary".
- If user says "Form II" -> gradeBand:"Form 2". If user says "F2" -> gradeBand:"Form 2".
- If user mentions "KCSE" or "KCPE", treat it as Kenya context (country:"Kenya") if no other country is present.
- minRating is 0..5 (e.g. "4+ stars" -> 4).
- maxPrice: parse numeric if "under/less than/budget" mentioned.
- If user asks for free/OER, set isOer:true and maxPrice:0.
- country: extract if present ("Kenya", "Qatar", etc).
- duration: short string like "4 weeks", "2 hours" if present.
- tutor: if user says "by John" / "teacher John" / "tutor Mary", capture name fragment.
- sort must be one of: "top", "cheap", "new", or "".

New fields:
- scope: one of "all", "purchased", "free", or "".
  - "only my purchased videos", "videos I bought" => scope:"purchased"
  - "free only", "only free resources" => scope:"free"
- providers: array of provider canonical names when mentioned:
  - "OpenStax" => "openstax"
  - "Khan" => "khan"
  - "CK-12" / "CK12" => "ck-12"
- contentKinds: array containing any of: "course","video","notes","book","doc"
  - "notes", "revision notes", "past papers" => include "notes"
  - "videos", "lectures" => include "video"
- sourceKind: one of "tutor","oer","sandbox", or ""
  - "AI sandbox", "robot tutor" => "sandbox"
  - "OER", OpenStax/Khan/CK-12 => "oer"
  - "tutor-made", "teacher-made" => "tutor"
`.trim();

  const user = [
    `Query: ${q}`,
    '',
    'Heuristic hints (use unless clearly wrong):',
    `- scope hint: ${heuristic.scope || '(none)'}`,
    `- providers hint: ${(heuristic.providers || []).join(', ') || '(none)'}`,
    `- contentKinds hint: ${(heuristic.contentKinds || []).join(', ') || '(none)'}`,
    `- sourceKind hint: ${heuristic.sourceKind || '(none)'}`,
    `- subject hint: ${heuristic.subject || '(none)'}`,
    `- gradeBand hint: ${heuristic.gradeBand || '(none)'}`,
    `- level hint: ${heuristic.level || '(none)'}`,
    `- isOer hint: ${heuristic.isOer ? 'true' : 'false'}`,
    `- maxPrice hint: ${heuristic.maxPrice ? String(heuristic.maxPrice) : '(none)'}`,
    `- minRating hint: ${heuristic.minRating ? String(heuristic.minRating) : '(none)'}`,
    `- country hint: ${heuristic.country || '(none)'}`,
    `- duration hint: ${heuristic.duration || '(none)'}`,
    `- tutor hint: ${heuristic.tutor || '(none)'}`,
    `- sort hint: ${heuristic.sort || '(none)'}`,
    '',
    'Examples:',
    '- "free OER algebra grade 7" => isOer:true, maxPrice:0, subject:"Math", gradeBand:"Grade 7", keywords:"algebra", sourceKind:"oer"',
    '- "Beginner programming React under 40" => subject:"Programming", level:"Beginner", maxPrice:40, keywords:"React"',
    '- "primary science exam prep 4.5 stars" => gradeBand:"Primary", subject:"Science", keywords:"exam prep", minRating:4.5',
    '- "top rated math Kenya 4 weeks by John under 20" => sort:"top", subject:"Math", country:"Kenya", duration:"4 weeks", tutor:"John", maxPrice:20',
    '- "only my purchased videos khan form 2 kenya" => scope:"purchased", contentKinds:["video"], providers:["khan"], gradeBand:"Form 2", country:"Kenya"',
    '- "free past papers kcse form ii" => scope:"free", contentKinds:["notes"], country:"Kenya", gradeBand:"Form 2", keywords:"past papers"',
    '- "AI sandbox algebra form 2" => sourceKind:"sandbox", subject:"Math", gradeBand:"Form 2", keywords:"algebra"',
  ].join('\n');

  let parsed = null;
  let aiMs = 0;

  try {
    const t0 = Date.now();
    parsed = await aiJson({
      system,
      user,
      schema: SEARCH_INTENT_SCHEMA,
      temperature: 0.2,
      maxTokens: 450,
      tries: 2,
    });
    aiMs = Date.now() - t0;
  } catch (err) {
    console.error(`[${reqId}] aiJson error`, err?.message || err);
    parsed = null;
  }

  const safe = parsed && typeof parsed === 'object' ? parsed : {};

  const cpair = sanitizeCountryPair(
  safe.country,
  safe.countryIso2,
  heuristic.country,
  heuristic.countryIso2,
);


  // Merge AI + heuristics (heuristics are fallback)
  const out = {
    keywords:
      typeof safe.keywords === 'string' && safe.keywords.trim()
        ? safe.keywords.trim()
        : remainder.trim(),

    subject: sanitizeSubject(
      typeof safe.subject === 'string' && safe.subject.trim()
        ? safe.subject.trim()
        : heuristic.subject,
    ),

    gradeBand:
      typeof safe.gradeBand === 'string' && safe.gradeBand.trim()
        ? safe.gradeBand.trim()
        : heuristic.gradeBand || '',

    level: sanitizeLevel(
      typeof safe.level === 'string' && safe.level.trim()
        ? safe.level.trim()
        : heuristic.level,
    ),

    country: cpair.country,
    countryIso2: cpair.countryIso2,


    duration:
      typeof safe.duration === 'string' && safe.duration.trim()
        ? safe.duration.trim()
        : heuristic.duration || '',

    tutor:
      typeof safe.tutor === 'string' && safe.tutor.trim()
        ? titleCase(safe.tutor.trim())
        : heuristic.tutor || '',

    minRating: clamp(
      Number.isFinite(Number(safe.minRating))
        ? Number(safe.minRating)
        : Number(heuristic.minRating || 0) || 0,
      0,
      5,
    ),

    maxPrice: Math.max(
      0,
      Number.isFinite(Number(safe.maxPrice))
        ? Number(safe.maxPrice)
        : Number(heuristic.maxPrice || 0) || 0,
    ),

    isOer: Boolean(safe.isOer) || Boolean(heuristic.isOer),

    sort: sanitizeSort(
      typeof safe.sort === 'string' && safe.sort.trim()
        ? safe.sort.trim()
        : heuristic.sort,
    ),

    // new fields
    scope: sanitizeScope(
      typeof safe.scope === 'string' && safe.scope.trim()
        ? safe.scope.trim()
        : heuristic.scope,
    ),

    providers: sanitizeProviders(
      Array.isArray(safe.providers) && safe.providers.length
        ? safe.providers
        : heuristic.providers,
    ),

    contentKinds: sanitizeContentKinds(
      Array.isArray(safe.contentKinds) && safe.contentKinds.length
        ? safe.contentKinds
        : heuristic.contentKinds,
    ),

    sourceKind: sanitizeSourceKind(
      typeof safe.sourceKind === 'string' && safe.sourceKind.trim()
        ? safe.sourceKind.trim()
        : heuristic.sourceKind,
    ),
  };

  // If OER/free: force maxPrice 0
  if (out.isOer || out.scope === 'free' || out.sourceKind === 'oer') out.maxPrice = 0;

  // If providers mentioned and no sourceKind -> treat as OER
  if (!out.sourceKind && out.providers.length) out.sourceKind = 'oer';

  // Enforce alignment
  if (out.sourceKind === 'oer') out.isOer = true;
  if (out.sourceKind === 'tutor') out.isOer = false;

  // Ensure keywords doesn't contain extracted filters
  out.keywords = cleanKeywords(out);

  console.log(`[${reqId}] parsed`, {
    q,
    heuristic,
    aiMs,
    out,
    totalMs: Date.now() - started,
  });

  try {
    await cacheSetJSON(cacheKey, out, AI_SEARCH_TTL_SEC);
  } catch {
    // ignore
  }

  return out;
}
