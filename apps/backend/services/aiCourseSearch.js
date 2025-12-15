// apps/backend/services/aiCourseSearch.js
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

const COURSE_SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    keywords: { type: 'string' },
    subject: { type: 'string' },
    gradeBand: { type: 'string' },     // free-form school level
    level: { type: 'string' },         // Beginner/Intermediate/Advanced/All Levels (optional)
    minRating: { type: 'number' },
    maxPrice: { type: 'number' },      // tokens for courses (your price column)
    isOer: { type: 'boolean' },        // free/OER flag
  },
  required: ['keywords', 'subject', 'gradeBand', 'level', 'minRating', 'maxPrice', 'isOer'],
  additionalProperties: false,
};

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
  const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig');
  return String(haystack || '').replace(re, ' ').replace(/\s+/g, ' ').trim();
}

function extractGradeBandHeuristic(qRaw) {
  const q = String(qRaw || '').trim();
  const lower = q.toLowerCase();

  // grade/class/form/year/level + number
  const m = lower.match(/\b(grade|class|form|year|level)\s*([0-9]{1,3})\b/i);
  if (m) {
    const band = `${titleCase(m[1])} ${m[2]}`;
    return { gradeBand: band, remainder: stripOnce(q, m[0]) };
  }

  // buckets (free-form values tutors/admins may type)
  const buckets = [
    'kindergarten', 'kg', 'nursery', 'pre-k', 'preschool',
    'elementary', 'primary', 'middle school', 'junior secondary',
    'secondary', 'high school', 'senior secondary',
    'college', 'university', 'tertiary',
    'academy', 'technical', 'tveta', 'vocational', 'polytechnic',
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
    { re: /\b(math|maths|mathematics|algebra|geometry|calculus|fractions|decimals)\b/i, subject: 'Math' },
    { re: /\b(science|biology|chemistry|physics)\b/i, subject: 'Science' },
    { re: /\b(programming|coding|computer science|javascript|python|react|node)\b/i, subject: 'Programming' },
    { re: /\b(art|drawing|painting|design)\b/i, subject: 'Art' },
    { re: /\b(wellness|health|fitness|mindfulness)\b/i, subject: 'Wellness' },
    { re: /\b(language|languages|french|spanish|arabic|german|swahili)\b/i, subject: 'Languages' },
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
  if (/\bbeginner\b/.test(q)) return { level: 'Beginner', remainder: stripOnce(qRaw, 'beginner') };
  if (/\bintermediate\b/.test(q)) return { level: 'Intermediate', remainder: stripOnce(qRaw, 'intermediate') };
  if (/\badvanced\b/.test(q)) return { level: 'Advanced', remainder: stripOnce(qRaw, 'advanced') };
  if (/\ball levels\b|\ball-levels\b/.test(q)) return { level: 'All Levels', remainder: stripOnce(qRaw, 'all levels') };
  return { level: '', remainder: qRaw };
}

function extractOerHeuristic(qRaw) {
  const q = norm(qRaw);
  const isOer =
    /\b(oer|open stax|openstax|khan|ck-?12|free)\b/i.test(q) ||
    /\bno cost\b|\bzero cost\b/.test(q);

  const remainder = isOer
    ? qRaw
        .replace(/\b(oer|open stax|openstax|khan|ck-?12|free|no cost|zero cost)\b/ig, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : qRaw;

  return { isOer, remainder };
}

function sanitizeSubject(subj) {
  const s = String(subj || '').trim();
  if (!s) return '';
  if (ALLOWED_SUBJECTS.includes(s)) return s;
  const t = titleCase(s);
  if (ALLOWED_SUBJECTS.includes(t)) return t;
  return '';
}

function cleanKeywords({ keywords, gradeBand, subject, level }) {
  let k = String(keywords || '').trim();
  if (!k) return '';

  if (gradeBand) k = stripOnce(k, gradeBand);
  if (subject) k = stripOnce(k, subject);
  if (level) k = stripOnce(k, level);

  // remove generic grade/class/form/year/level + number mentions
  k = k.replace(/\b(grade|class|form|year|level)\s*[0-9]{1,3}\b/gi, ' ')
       .replace(/\s+/g, ' ')
       .trim();

  return k;
}

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
      minRating: 0,
      maxPrice: 0,
      isOer: false,
    };
  }

  // Heuristics first
  const g = extractGradeBandHeuristic(q);
  const s = extractSubjectHeuristic(g.remainder);
  const d = extractDifficultyHeuristic(s.remainder);
  const o = extractOerHeuristic(d.remainder);

  const heuristicGradeBand = g.gradeBand;
  const heuristicSubject = s.subject;
  const heuristicLevel = d.level;
  const heuristicIsOer = o.isOer;

  // If it's basically ONLY a grade/system search (e.g. "Grade 3"), skip OpenAI
  const onlyGradeLike = norm(o.remainder).length === 0 && Boolean(heuristicGradeBand);
  if (onlyGradeLike) {
    const out = {
      keywords: '',
      subject: heuristicSubject || '',
      gradeBand: heuristicGradeBand,
      level: heuristicLevel || '',
      minRating: 0,
      maxPrice: 0,
      isOer: heuristicIsOer,
    };
    out.keywords = cleanKeywords(out);
    console.log(`[${reqId}] heuristic-only`, { q, out, ms: Date.now() - started });
    return out;
  }

  const system =
    'You extract structured course-search filters from user text.\n' +
    'Return ONLY JSON.\n' +
    `IMPORTANT: subject MUST be one of these exact values (or empty): ${ALLOWED_SUBJECTS.join(', ')}.\n` +
    'GRADE/SCHOOL LEVEL: gradeBand can be ANY school system / level a user may type (examples: "Grade 3", "Class 4", "Primary", "Secondary", "High School", "College", "University", "Academy", "Technical", "Vocational", "Kindergarten").\n' +
    'DIFFICULTY: level can be one of: Beginner, Intermediate, Advanced, All Levels (or empty).\n' +
    'If user asks for free/OER, set isOer:true and maxPrice:0.\n' +
    'CRITICAL: Do NOT put gradeBand / level / subject text into keywords if you extracted them.\n' +
    'keywords should be leftover terms helpful for title/description search (e.g., "exam prep", "SAT", "IB", "fractions", "algebra", "probability").\n' +
    'If something is not mentioned, return empty string / 0 / false.';

  const user = [
    'User search:',
    q,
    '',
    'Schema:',
    JSON.stringify(COURSE_SEARCH_SCHEMA, null, 2),
    '',
    'Heuristic hints (use unless clearly wrong):',
    `- gradeBand hint: ${heuristicGradeBand || '(none)'}`,
    `- subject hint: ${heuristicSubject || '(none)'}`,
    `- level hint: ${heuristicLevel || '(none)'}`,
    `- isOer hint: ${heuristicIsOer ? 'true' : 'false'}`,
    '',
    'Examples:',
    '- "free OER algebra grade 7" => isOer:true, maxPrice:0, subject:"Math", gradeBand:"Grade 7", keywords:"algebra"',
    '- "Beginner programming React under 40" => subject:"Programming", level:"Beginner", maxPrice:40, keywords:"React"',
    '- "primary science exam prep 4.5 stars" => gradeBand:"Primary", subject:"Science", keywords:"exam prep", minRating:4.5',
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

  const out = {
    keywords: typeof parsed.keywords === 'string' ? parsed.keywords.trim() : o.remainder.trim(),
    subject: sanitizeSubject(typeof parsed.subject === 'string' ? parsed.subject.trim() : heuristicSubject),
    gradeBand:
      typeof parsed.gradeBand === 'string' && parsed.gradeBand.trim()
        ? parsed.gradeBand.trim()
        : heuristicGradeBand,
    level:
      typeof parsed.level === 'string' && parsed.level.trim()
        ? titleCase(parsed.level.trim())
        : heuristicLevel,
    minRating: Number.isFinite(Number(parsed.minRating)) ? Number(parsed.minRating) : 0,
    maxPrice: Number.isFinite(Number(parsed.maxPrice)) ? Number(parsed.maxPrice) : 0,
    isOer: Boolean(parsed.isOer) || heuristicIsOer,
  };

  if (out.maxPrice < 0) out.maxPrice = 0;
  if (out.minRating < 0) out.minRating = 0;

  // enforce known difficulty labels only
  if (!['', 'Beginner', 'Intermediate', 'Advanced', 'All Levels'].includes(out.level)) out.level = '';

  // if OER: force maxPrice 0 (safe)
  if (out.isOer) out.maxPrice = 0;

  out.keywords = cleanKeywords(out);

  console.log(`[${reqId}] parsed`, {
    q,
    heuristic: { heuristicGradeBand, heuristicSubject, heuristicLevel, heuristicIsOer },
    aiMs,
    out,
    totalMs: Date.now() - started,
  });

  return out;
}
