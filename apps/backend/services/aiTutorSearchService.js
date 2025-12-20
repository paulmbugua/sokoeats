import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL =
  process.env.OPENAI_EXAMS_MODEL ||
  process.env.OPENAI_COURSE_MODEL ||
  'gpt-4.1-mini';

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

const TUTOR_SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    keywords: { type: 'string' },
    subject: { type: 'string' },
    country: { type: 'string' },
    gradeBand: { type: 'string' },
    status: { type: 'string' },
    experienceLevel: { type: 'string' },
    minRating: { type: 'number' },
    maxTokens: { type: 'number' }, // ✅ NEW
    certified: { type: 'boolean' },
  },
  required: [
    'keywords',
    'subject',
    'country',
    'gradeBand',
    'status',
    'experienceLevel',
    'minRating',
    'maxTokens', // ✅ NEW
    'certified',
  ],
  additionalProperties: false,
};

function normIso2(s) {
  const v = (s || '').trim();
  if (!v) return '';
  if (v.length === 2) return v.toUpperCase();
  const m = {
    'united states': 'US',
    usa: 'US',
    'united kingdom': 'GB',
    uk: 'GB',
    kenya: 'KE',
    nigeria: 'NG',
    qatar: 'QA',
  };
  const key = v.toLowerCase();
  return m[key] || '';
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

function stripOnce(haystack, needle) {
  if (!needle) return haystack;
  const re = new RegExp(
    `\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
    'ig',
  );
  return String(haystack || '')
    .replace(re, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Heuristic: extract “school system / level” from free text.
 * Supports: Grade 3, Class 4, Form 1, Year 2, Level 100, KG, Primary, Elementary, University, etc.
 */
function extractGradeBandHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const lower = q.toLowerCase();

  // 1) grade/class/form/year/level + number
  const m = lower.match(/\b(grade|class|form|year|level)\s*([0-9]{1,3})\b/i);
  if (m) {
    const band = `${titleCase(m[1])} ${m[2]}`;
    const remainder = stripOnce(q, m[0]);
    return { gradeBand: band, remainder };
  }

  // 2) keyword-only systems (free form values tutors may type)
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
    'technical',
    'tveta',
    'vocational',
    'polytechnic',
  ];

  for (const b of buckets) {
    if (lower.includes(b)) {
      const band = titleCase(b.replace(/-/g, ' '));
      const remainder = stripOnce(q, b);
      return { gradeBand: band, remainder };
    }
  }

  return { gradeBand: '', remainder: q };
}

/**
 * Heuristic: map subject synonyms → ALLOWED_SUBJECTS.
 * Also returns a remainder with the subject phrase removed (so keywords don’t repeat it).
 */
function extractSubjectHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const s = norm(q);

  const rules = [
    {
      re: /\b(math|maths|mathematics|algebra|geometry|calculus)\b/i,
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
    if (m) {
      const remainder = stripOnce(q, m[0]);
      return { subject: r.subject, remainder };
    }
  }
  return { subject: '', remainder: q };
}

function sanitizeSubject(subj) {
  const s = String(subj || '').trim();
  if (!s) return '';
  // exact match
  if (ALLOWED_SUBJECTS.includes(s)) return s;
  // try normalized
  const t = titleCase(s);
  if (ALLOWED_SUBJECTS.includes(t)) return t;
  return '';
}

function cleanKeywords({ keywords, gradeBand, subject }) {
  let k = String(keywords || '').trim();
  if (!k) return '';

  // remove gradeBand tokens from keywords (prevents “grade 3” killing results)
  if (gradeBand) k = stripOnce(k, gradeBand);

  // remove subject word if it leaked into keywords
  if (subject) k = stripOnce(k, subject);

  // also remove generic “grade/class/form/year/level + number” mentions
  k = k
    .replace(/\b(grade|class|form|year|level)\s*[0-9]{1,3}\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return k;
}

export async function aiParseTutorSearch(query) {
  const q = String(query || '').trim();
  const started = Date.now();
  const reqId = `aiTutorSearch:${Math.random().toString(36).slice(2, 10)}`;

  if (!q) {
    return {
      keywords: '',
      subject: '',
      country: '',
      gradeBand: '',
      status: '',
      experienceLevel: '',
      minRating: 0,
      maxTokens: 0, // ✅
      certified: false,
    };
  }

  // ---- Heuristic first (very important for “Grade 3”)
  const g = extractGradeBandHeuristic(q);
  const s = extractSubjectHeuristic(g.remainder);

  const heuristicGradeBand = g.gradeBand;
  const heuristicSubject = s.subject;

  // If it’s basically ONLY a grade/system query, we skip OpenAI completely.
  // Examples: "Grade 3", "primary", "university"
  const onlyGradeLike =
    norm(s.remainder).length === 0 && Boolean(heuristicGradeBand);
  if (onlyGradeLike) {
    const out = {
      keywords: '',
      subject: heuristicSubject || '',
      country: '',
      gradeBand: heuristicGradeBand,
      status: '',
      experienceLevel: '',
      minRating: 0,
      maxPrice: 0,
      certified: false,
    };
    console.log(`[${reqId}] heuristic-only`, {
      q,
      out,
      ms: Date.now() - started,
    });
    return out;
  }

  const system =
    'You extract structured tutor-search filters from user text.\n' +
    'Return ONLY JSON.\n' +
    `IMPORTANT: subject MUST be one of these exact values (or empty): ${ALLOWED_SUBJECTS.join(', ')}.\n` +
    'Prefer ISO2 country codes (US, KE, GB, QA, etc).\n' +
    'GRADE/SCHOOL LEVEL: gradeBand can be ANY school system / level that a tutor may type (examples: "Grade 3", "Class 4", "Form 2", "Year 7", "Primary", "Elementary", "Secondary", "High School", "College", "University", "Technical", "Vocational", "Kindergarten").\n' +
    'CRITICAL: Do NOT put grade/school-level text into keywords if you put it in gradeBand.\n' +
    'keywords should be leftover terms that help search the tutor bio/name/category (e.g., "exam prep", "SAT", "IB", "dyslexia", "maths specialist", "one-on-one").\n' +
    'If something is not mentioned, return empty string / 0 / false.';

  const user = [
    'User search:',
    q,
    '',
    'Schema:',
    JSON.stringify(TUTOR_SEARCH_SCHEMA, null, 2),
    '',
    'Heuristic hints (use unless clearly wrong):',
    `- gradeBand hint: ${heuristicGradeBand || '(none)'}`,
    `- subject hint: ${heuristicSubject || '(none)'}`,
    '',
    'Examples:',
    '- "US maths tutor under 30 tokens, 4.5 stars" => country:"US", subject:"Math", maxTokens:30, minRating:4.5',
    '- "certified Kenyan english tutor grade 2" => country:"KE", subject:"English", certified:true, gradeBand:"Grade 2"',
    '- "primary science exam prep tutor" => gradeBand:"Primary", subject:"Science", keywords:"exam prep"',
    '- "university programming tutor for React" => gradeBand:"University", subject:"Programming", keywords:"React"',
  ].join('\n');

  let parsed = {};
  let aiMs = 0;

  try {
    const t0 = Date.now();
    const resp = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    aiMs = Date.now() - t0;

    try {
      parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
    } catch {
      parsed = {};
    }
  } catch (err) {
    console.error(`[${reqId}] openai error`, err?.message || err);
    parsed = {};
  }

  // ---- Build output (AI + heuristic fallback)
  const out = {
    keywords:
      typeof parsed.keywords === 'string'
        ? parsed.keywords.trim()
        : s.remainder.trim(),
    subject: sanitizeSubject(
      typeof parsed.subject === 'string'
        ? parsed.subject.trim()
        : heuristicSubject,
    ),
    country: normIso2(parsed.country),
    gradeBand:
      typeof parsed.gradeBand === 'string' && parsed.gradeBand.trim()
        ? parsed.gradeBand.trim()
        : heuristicGradeBand,
    status:
      typeof parsed.status === 'string'
        ? parsed.status.trim().toLowerCase()
        : '',
    experienceLevel:
      typeof parsed.experienceLevel === 'string'
        ? parsed.experienceLevel.trim()
        : '',
    minRating: Number.isFinite(Number(parsed.minRating))
      ? Number(parsed.minRating)
      : 0,
    maxTokens: Number.isFinite(Number(parsed.maxTokens))
      ? Number(parsed.maxTokens)
      : 0, // ✅
    certified: Boolean(parsed.certified),
  };

  if (out.maxTokens < 0) out.maxTokens = 0;

  // guard
  if (!['', 'online', 'offline'].includes(out.status)) out.status = '';
  if (out.minRating < 0) out.minRating = 0;
  if (out.maxPrice < 0) out.maxPrice = 0;

  // prevent “grade 3” becoming keywords and killing matches
  out.keywords = cleanKeywords(out);

  console.log(`[${reqId}] parsed`, {
    q,
    heuristic: { gradeBand: heuristicGradeBand, subject: heuristicSubject },
    aiMs,
    out,
    totalMs: Date.now() - started,
  });

  return out;
}
