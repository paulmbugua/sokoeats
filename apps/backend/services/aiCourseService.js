// apps/backend/services/aiCourseService.js
import 'dotenv/config';
import pool from '../config/db.js';

import {
  // logging
  LOG_NS, log, dlog,
  // openai + timing utils
  openai, OPENAI_REQUEST_TIMEOUT_MS, withTimeout,
  // cache helpers + TTLs
  REDIS_TTL, cacheGetJSON, cacheSetJSON, cacheBustCourse,
  // control flow + breaker
  withGate, breakerActive, tripBreaker, fallbackNotice,
  // error utils
  classifyOpenAIError,
  // schemas & ai helpers
  LESSON_PACK_SCHEMA, QUIZ_SCHEMA_MCQ, QUIZ_SCHEMA_SHORT, OUTLINE_SCHEMA, aiJson,
  // sizing + pacing
  resolveCourseSize, lessonsForTrack, totalLessonsOf, defaultTargetMinutesOf, paceFor,
  // content helpers
  sanitizeSsml, aiTeachabilityScore, inferLessonSignals,
  // misc
  sha1,
  fairTimerSec,
   ENABLE_LESSON_IMAGES,
} from './aiCourseCore.js';

/* ─────────────────────────────────────────────────────────
 * Re-export selected core utilities so existing imports don't break
 * ───────────────────────────────────────────────────────── */
export { withGate, cacheBustCourse, sanitizeSsml, cacheDeleteByPattern } from './aiCourseCore.js';

/* ─────────────────────────────────────────────────────────
 * Length helpers
 * ───────────────────────────────────────────────────────── */
function wordCountFromSsml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

/* ─────────────────────────────────────────────────────────
 * Service methods (used by controllers)
 * Each returns { status, data, headers }
 * ───────────────────────────────────────────────────────── */

export async function listTopCoursesService({
  aiOnly = false,
  limit = 50,
  offset = 0,
  sourceKind,               // NEW
} = {}) {
  // normalise sourceKind for cache + filtering
  const normSourceKind =
    typeof sourceKind === 'string' && sourceKind.trim()
      ? sourceKind.trim().toLowerCase()
      : null;

  const cacheKey = `ai:topCourses:aiOnly=${aiOnly}:limit=${limit}:offset=${offset}:sourceKind=${normSourceKind || 'all'}`;
  const cached = await cacheGetJSON(cacheKey);
  if (cached) {
    dlog('topCourses', 'serve from cache', {
      count: cached.length,
      offset,
      limit,
      aiOnly,
      sourceKind: normSourceKind || 'all',
    });
    return {
      status: 200,
      data: cached,
      headers: {
        'X-Cache': 'HIT',
        'X-Offset': String(offset),
        'X-Limit': String(limit),
        'X-Source-Kind': String(normSourceKind || 'all'),
      },
    };
  }

  // ✅ still using your known-good pool + courses table
  const q = await pool.query(`
    SELECT
      id,
      title,
      description,
      syllabus,
      avg_rating,
      ratings_count,
      source_kind           -- NEW: we need this for filtering
    FROM courses
    ORDER BY
      (avg_rating IS NULL) ASC, avg_rating DESC,
      (ratings_count IS NULL) ASC, ratings_count DESC,
      created_at DESC NULLS LAST
    LIMIT 1000
  `);

  const rows = q.rows || [];
  dlog('topCourses', 'db rows', { count: rows.length });

  let scoredAll = rows
    .map((r) => {
      const s = aiTeachabilityScore(r.title, r.description, r.syllabus);
      return {
        id: r.id,
        title: r.title,
        blurb: r.description || '',
        rating: Number(r.avg_rating ?? 0),
        reviews: Number(r.ratings_count ?? 0),
        sourceKind: r.source_kind || null,  // NEW: expose to FE + filter on this
        _score: s,
      };
    });

  // Filter by AI teachability if requested (existing behavior)
  if (aiOnly) {
    scoredAll = scoredAll.filter((r) => r._score > 0);
  }

  // 🔍 NEW: filter by sourceKind if provided (e.g. 'starter50', 'catalog')
  if (normSourceKind && normSourceKind !== 'all') {
    scoredAll = scoredAll.filter(
      (r) => String(r.sourceKind || '').toLowerCase() === normSourceKind
    );
  }

  // Keep your ranking logic
  scoredAll.sort(
    (a, b) =>
      (b._score - a._score) ||
      (b.rating - a.rating) ||
      (b.reviews - a.reviews)
  );

  const slice = scoredAll
    .slice(offset, offset + limit)
    .map(({ _score, ...rest }) => rest);

  await cacheSetJSON(cacheKey, slice, REDIS_TTL.topCourses);
  dlog('topCourses', 'ranked and cached', {
    totalRanked: scoredAll.length,
    returned: slice.length,
    sourceKind: normSourceKind || 'all',
  });

  return {
    status: 200,
    data: slice,
    headers: {
      'X-Cache': 'MISS',
      'X-Total-Ranked': String(scoredAll.length),
      'X-Offset': String(offset),
      'X-Limit': String(limit),
      'X-Has-More': String(offset + slice.length < scoredAll.length),
      'X-Source-Kind': String(normSourceKind || 'all'),
    },
  };
}


export function makeFallbackOutline(title = 'Your Topic') {
  const topics = [
    'Introduction & outcomes',
    'Core concepts',
    'Worked examples',
    'Common pitfalls',
    'Mini project & recap',
  ];
  return topics.map((t, i) => ({
    id: `w${i + 1}`,
    title: `${t} — ${title}`,
    keyPoints: [
      `Overview of ${title} (${t.toLowerCase()}).`,
      `When/why ${title} matters.`,
      `Simple, actionable steps.`,
    ],
  }));
}

/* UPDATED: makeFallbackQuiz supports mcq/short */
export function makeFallbackQuiz(title = 'Your Topic', outline = [], num = 6, quizType = 'mcq') {
  const base = (outline?.length ? outline : makeFallbackOutline(title));
  const L = base.length || 1; // avoid div-by-zero
  const pick = (i) => base[i % L];

  if (quizType === 'short') {
  const stems = [
    (t) => `In “${t}”, what is the missing key term?`,
    (t) => `From “${t}”, name the concept masked by the blanks:`,
    (t) => `Briefly identify the term referenced in “${t}”:`,
  ];

  function pickMaskable(text) {
    // choose a word ≥ 4 chars (letters/numbers, keep simple)
    const words = String(text || '').match(/\b[A-Za-z0-9][A-Za-z0-9-]{2,}\b/g) || [];
    // prefer domain-ish terms (order heuristic)
    const pref = words.find(w => /mole|yield|stoich|balance|equation|ratio|conserv|mass|atom|molar|limiting|excess/i.test(w));
    return (pref || words[0] || '').replace(/\.$/, '');
  }

  function makeRegex(answer) {
    // case-insensitive exact, allow flexible spacing & hyphen variants
    const esc = answer.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
                      .replace(/[-–—]/g, '[-–—-]')
                      .replace(/\s+/g, '\\s+');
    return `(?i)^\\s*${esc}\\s*$`;
  }

  function variants(ans) {
    const base = ans;
    const low  = ans.toLowerCase();
    const noHy = ans.replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
    const hy   = ans.replace(/\s+/g, '-');
    const set = new Set([base, low, noHy, hy]);
    return Array.from(set).filter(Boolean);
  }

  const qs = [];
  for (let i = 0; i < num; i++) {
    const s = pick(i);
    const topic = s?.title || title;
    const kp = (s?.keyPoints?.[i % (s?.keyPoints?.length || 1)] || topic);
    const key = pickMaskable(kp) || pickMaskable(topic) || 'concept';

    // build masked display text from first useful keyPoint
    const baseDisplay = (s?.keyPoints?.[0] || kp || topic);
    const display = baseDisplay.replace(new RegExp(`\\b${key}\\b`, 'i'), '____');

    const answer = key;
    const accept = variants(answer);
    const regex  = makeRegex(answer);

    qs.push({
      id: `q${i + 1}`,
      type: 'short',
      prompt: stems[i % stems.length](topic),
      display,
      answer,
      accept,
      regex,
      explanation: `Key term from “${topic}”.`,
    });
  }
  return qs;

  }

  // MCQ fallback
  
const mcqStems = [
  (t) => `In “${t}”, which statement is correct?`,
  (t) => `About “${t}”, choose the true claim:`,
  (t) => `Which fact accurately applies to “${t}”?`,
];

function shuffle(arr, seed) {
  // tiny deterministic shuffle using seed string
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    const j = Math.abs(h) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const qs = [];
for (let i = 0; i < num; i++) {
  const s = pick(i);
  const topic = s?.title || title;
  const kp0 = (s?.keyPoints?.[0] || '').replace(/\.$/, '');
  const kp1 = (s?.keyPoints?.[1] || '').replace(/\.$/, '');
  const correct = kp0 || `This topic explains a core idea in ${title}.`;

  // 3 distractors tailored to the topic
  const distractors = [
    `It describes a concept unrelated to ${topic}.`,
    `It contradicts standard principles used in ${topic}.`,
    `It applies to a different unit, not “${topic}”.`,
  ];

  const choices = shuffle([correct, ...distractors], `${topic}#${i}`);
  const answerIndex = choices.indexOf(correct);

  qs.push({
    id: `q${i + 1}`,
    type: 'mcq',
    prompt: mcqStems[i % mcqStems.length](topic),
    display: '', // keep for schema
    choices,
    answerIndex: Math.max(0, answerIndex),
    explanation: kp1 || `Because this directly reflects the learning goal for “${topic}”.`,
  });
}
return qs;

}

export async function generateOutlineService({
  courseId,
  title,
  level,
  targetMinutes,
  courseSize,
  totalLessons: explicitLessons,
  programTrack,
}) {
  dlog('outline', 'enter', {
    courseId,
    title: Boolean(title),
    level,
    targetMinutes,
    courseSize,
    explicitLessons,
    programTrack,
  });

  // Load DB meta
  let courseTitle = title || 'Untitled Course';
  let courseDesc = '';
  if (courseId) {
    const cq = await pool.query(`SELECT title, description FROM courses WHERE id = $1`, [courseId]);
    if (cq.rowCount) {
      courseTitle = cq.rows[0].title || courseTitle;
      courseDesc = cq.rows[0].description || '';
    }
  }

  const preset = await resolveCourseSize({ courseId, bodyCourseSize: courseSize, programTrack });
  dlog('outline', 'size preset', { preset: preset?.key });

  // 1) Decide how many lessons to create
    // 1) Decide how many lessons to create (track + size cooperate)
  let totalLessons;
  if (Number.isFinite(Number(explicitLessons)) && Number(explicitLessons) > 0) {
    totalLessons = Math.max(1, Math.min(500, Number(explicitLessons))); // explicit override
  } else {
    const fromTrack = lessonsForTrack(programTrack);   // e.g., module=8, certificate=20, ...
    const fromSize  = totalLessonsOf(preset);          // e.g., mini=6, standard=16, ...
    // Prefer the stronger guidance so size presets aren’t “capped” by a smaller track
    totalLessons = Math.max(fromTrack || 0, fromSize || 0) || 8; // final fallback 8
  }


  // 2) Decide total minutes (if caller didn’t pass)
  let target =
    Number.isFinite(Number(targetMinutes)) && Number(targetMinutes) > 0
      ? Number(targetMinutes)
      : defaultTargetMinutesOf(preset);

  // Ensure at least 3 minutes per lesson
 if (totalLessons > 0) {
   const minPerLesson = 3;
   const minTotal = minPerLesson * totalLessons;
   if (target < minTotal) target = minTotal;
}

  dlog('outline', 'computed plan', { totalLessons, targetMinutesTotal: target, fromTrack: lessonsForTrack(programTrack), fromSize: totalLessonsOf(preset) });

  const cacheKey = `ai:outline:${courseId || 't:' + sha1(courseTitle)}:size=${preset.key}:lvl=${level}:lessons=${totalLessons}:min=${target}:track=${programTrack || ''}`;
  const cached = await cacheGetJSON(cacheKey);
  if (cached?.outline?.length) {
    dlog('outline', 'cache HIT', { len: cached.outline.length });
    return {
      status: 200,
      data: { outline: cached.outline.slice(0, totalLessons) },
      headers: {
        'X-Cache': 'HIT',
        'X-Size-Key': preset.key,
        'X-Computed-Lessons': String(totalLessons),
        'X-Target-Minutes': String(target),
      },
    };
  }

  if (breakerActive()) {
    console.warn(`[${LOG_NS}:outline] breaker active; serving fallback`);
    return {
      status: 503,
      data: {
        outline: makeFallbackOutline(courseTitle).slice(0, totalLessons),
        notice: fallbackNotice('breaker_active'),
      },
      headers: {
        'Retry-After': '600',
        'X-Size-Key': preset.key,
        'X-Computed-Lessons': String(totalLessons),
        'X-Target-Minutes': String(target),
      },
    };
  }

const perItemTokens = 70; // conservative budget per lesson (title + 3 kp)
const wantTokens = Math.min(12000, Math.max(1200, perItemTokens * totalLessons + 300));

// Distribute a fair share of the global token ceiling to each slice
function maxTokensForSlice(count) {
  const proportional = Math.floor(wantTokens * (count / Math.max(1, totalLessons)));
  const heuristic    = perItemTokens * count + 200;           // ~60–70 per item + overhead
  const elasticFloor = Math.min(1000, Math.max(200, 50*count + 200)); // 200–1000
  return Math.min(6000, Math.max(elasticFloor, Math.min(proportional, heuristic)));
}

 
// helper: ask for a slice and force schema
// helper: ask for a slice and force schema
async function genSlice(start, count, overrideMaxTokens) {
  const endAbs = start + count; // absolute 1-based in copy below is cosmetic only
  const kpNote = count > 30 ? '2–3' : '3–5';

  // Use the caller-provided cap if present; otherwise default to our heuristic
  const localMax = (Number.isFinite(overrideMaxTokens) && overrideMaxTokens > 0)
    ? Math.floor(overrideMaxTokens)
    : maxTokensForSlice(count);

  dlog('outline', 'slice budget', {
    start, count,
    maxTokens: localMax,
    wantTokens,
    totalLessons
  });

  const json = await withGate(
    'openai:outline',
    process.env.NODE_ENV === 'production' ? 1 : 2,
    () => aiJson({
      system:
        `You are an instructional designer. Return ONLY JSON matching the schema.\n` +
        `Level: ${level || 'beginner'}.\n` +
        `Create EXACTLY ${count} sections for a ~${target} minute course.\n` +
        `Each section: short, clear title + ${kpNote} concrete, testable key points.`,
      user:
        `Course: ${courseTitle}\n` +
        (courseDesc ? `Description: ${courseDesc}\n` : '') +
        `Sections ${start + 1}–${endAbs} of ${totalLessons}. Keep it crisp, practical, testable.`,
      temperature: 0.3,
      maxTokens: Math.max(1, localMax),
      tries: 3,
      schema: OUTLINE_SCHEMA
    })
  );

  const arr = Array.isArray(json?.outline) ? json.outline : [];
  return arr.slice(0, count);
}


let outline = [];
try {
  // chunk if large
  const CHUNK = totalLessons > 40 ? 20 : totalLessons > 30 ? 30 : totalLessons;

  // NEW: strict global token budget control
  let budgetRemaining = wantTokens;

  for (let i = 0; i < totalLessons; i += CHUNK) {
    const take = Math.min(CHUNK, totalLessons - i);

    // Share of the budget for this slice, hard-capped by what's left
    const capForThisSlice = Math.min(maxTokensForSlice(take), Math.max(0, budgetRemaining));

    // try the AI slice; if no budget left, or call fails, fall back to deterministic filler
    let slice = [];

    if (capForThisSlice > 0) {
      try {
        slice = await genSlice(i, take, capForThisSlice);
      } catch (e) {
        console.warn(`[${LOG_NS}:outline] slice ${i}-${i + take - 1} failed; using fallback`, e?.message);
      }
    } else {
      dlog('outline', 'budget exhausted; using fallback', { start: i, count: take, budgetRemaining });
    }

    if (!slice.length) {
      const fb = makeFallbackOutline(courseTitle).slice(0, take);
      // give unique ids/titles per absolute index
      slice = fb.map((s, k) => ({ ...s, id: `w${i + k + 1}` }));
    }

    outline.push(...slice);

    // Decrement global budget by what we *allowed* this slice to use
    budgetRemaining = Math.max(0, budgetRemaining - capForThisSlice);
  }

  outline = outline.slice(0, totalLessons);

  await cacheSetJSON(cacheKey, { outline }, REDIS_TTL.outline);
  dlog('outline', 'success', { len: outline.length });
  if (process.env.PREWARM_QUIZ === '1') {
  try {
    setImmediate(() => {
      generateQuizService({
        courseId,
        outline,
        numQuestions: Math.max(6, Math.min(24, outline.length * 2)), // quick baseline
        courseSize: preset.key,
        programTrack,
        quizType: 'mcq', // or infer
      }).catch(() => {});
    });
  } catch {}
}

  return {
    status: 200,
    data: { outline },
    headers: {
      'X-Cache': 'MISS',
      'X-Size-Key': preset.key,
      'X-Computed-Lessons': String(totalLessons),
      'X-Target-Minutes': String(target),
    },
  };


  
} catch (err) {
    const c = classifyOpenAIError(err);
    console.warn(`[${LOG_NS}:outline] error`, { kind: c.kind, status: c.status, msg: err?.message });
    if (c.kind === 'quota') {
      tripBreaker(10);
      return {
        status: 503,
        data: {
          outline: makeFallbackOutline(courseTitle).slice(0, totalLessons),
          notice: fallbackNotice('insufficient_quota'),
        },
        headers: {
          'Retry-After': String(c.retryAfterSec || 600),
          'X-Size-Key': preset.key,
          'X-Computed-Lessons': String(totalLessons),
          'X-Target-Minutes': String(target),
        },
      };
    }
    if (c.kind === 'rate_limit') {
      return {
        status: 503,
        data: {
          outline: makeFallbackOutline(courseTitle).slice(0, totalLessons),
          notice: fallbackNotice('rate_limited'),
        },
        headers: {
          'Retry-After': String(c.retryAfterSec || 20),
          'X-Size-Key': preset.key,
          'X-Computed-Lessons': String(totalLessons),
          'X-Target-Minutes': String(target),
        },
      };
    }
    if (c.kind === 'auth') {
      return { status: 401, data: { error: 'OpenAI API key invalid or unauthorized' }, headers: {} };
    }
    if (c.kind === 'timeout') {
      return {
        status: 503,
        data: { error: 'AI service timeout. Please try again.' },
        headers: { 'Retry-After': '5', 'X-Size-Key': preset.key, 'X-Computed-Lessons': String(totalLessons), 'X-Target-Minutes': String(target) },
      };
    }
    if (c.kind === 'network') {
      return {
        status: 503,
        data: { error: 'AI network error. Please retry shortly.' },
        headers: { 'Retry-After': '10', 'X-Size-Key': preset.key, 'X-Computed-Lessons': String(totalLessons), 'X-Target-Minutes': String(target) },
      };
    }
        // LAST RESORT: do not 502 with empty payloads for big tracks — degrade gracefully
    const fb = makeFallbackOutline(courseTitle).slice(0, totalLessons);
    return {
      status: 206,
      data: { outline: fb, notice: fallbackNotice('outline_repaired_or_fallback') },
      headers: { 'X-Degraded': 'true', 'X-Computed-Lessons': String(totalLessons), 'X-Target-Minutes': String(target) }
    };
  }
}

/* ─────────────────────────────────────────────────────────
 * Artifact anchoring + SSML repairs
 * ───────────────────────────────────────────────────────── */
function ensureAnchorsForArtifacts(lesson, ssml) {
  const body = (ssml.match(/<prosody[^>]*>([\s\S]*?)<\/prosody>/i)?.[1] || ssml)
                .replace(/<[^>]+>/g, ' ');
  const sentenceCount =
    (body.match(/[.?!]+["')\]]?/g) || []).length || 1;
  const safeIndex = (i) => Math.max(1, Math.min(i, sentenceCount)); // 1-based
  const spread = (n) =>
    Array.from({ length: n }, (_, i) =>
      safeIndex(1 + Math.floor((i * sentenceCount) / Math.max(1, n)))
    );

  // 🔥 NEW: hard-disable images (and optionally charts) if flag is off
  if (!ENABLE_LESSON_IMAGES && Array.isArray(lesson.images)) {
    lesson.images = [];
  }

  if (Array.isArray(lesson.formulas) && lesson.formulas.length) {
    const slots = spread(lesson.formulas.length);
    lesson.formulas = lesson.formulas.map((f, i) => ({
      ...f,
      announceAtSentence: Number.isFinite(Number(f?.announceAtSentence))
        ? f.announceAtSentence
        : slots[i] || 1,
    }));
  }
  if (Array.isArray(lesson.tables) && lesson.tables.length) {
    const slots = spread(lesson.tables.length);
    lesson.tables = lesson.tables.map((t, i) => ({
      ...t,
      announceAtSentence: Number.isFinite(Number(t?.announceAtSentence))
        ? t.announceAtSentence
        : slots[i] || 1,
    }));
  }

  if (Array.isArray(lesson.charts) && lesson.charts.length) {
    const slots = spread(lesson.charts.length);
    lesson.charts = lesson.charts.map((ch, i) => ({
      ...ch,
      announceAtSentence: Number.isFinite(Number(ch?.announceAtSentence))
        ? ch.announceAtSentence
        : slots[i] || 1,
    }));
  }

  if (Array.isArray(lesson.images) && lesson.images.length) {
    const slots = spread(lesson.images.length);
    lesson.images = lesson.images.map((im, i) => ({
      ...im,
      announceAtSentence: Number.isFinite(Number(im?.announceAtSentence))
        ? im.announceAtSentence
        : slots[i] || 1,
    }));
  }

  if (Array.isArray(lesson.snippets) && lesson.snippets.length) {
    const slots = spread(lesson.snippets.length);
    lesson.snippets = lesson.snippets.map((sn, i) => ({
      ...sn,
      announceAtSentence: Number.isFinite(Number(sn?.announceAtSentence))
        ? sn.announceAtSentence
        : slots[i] || 1,
    }));
  }

  return lesson;
}


function closeProsodyIfMissing(ssml) {
  const opens  = (ssml.match(/<prosody\b/gi) || []).length;
  const closes = (ssml.match(/<\/prosody>/gi) || []).length;
  if (opens > closes) {
    const need = opens - closes;
    return ssml.replace(/<\/voice>\s*<\/speak>\s*$/i, `${'</prosody>'.repeat(need)}</voice></speak>`);
  }
  return ssml;
}

// Extract the inner content of a <prosody> ... </prosody> block
function innerProsody(ssml) {
  const m = String(ssml).match(/<prosody[^>]*>([\s\S]*?)<\/prosody>/i);
  return (m ? m[1] : String(ssml)).trim();
}

export async function generateLessonSSMLService({ 
  courseId,
  outline,
  voiceName,
  courseSize,
  count,
  start = 0, // NEW: offset for paging
  programTrack,
}, _opts = { prewarm: true }) {
  log('log', 'lesson', 'enter', {
    courseId,
    outlineIsArray: Array.isArray(outline),
    outlineLen: Array.isArray(outline) ? outline.length : 0,
    start,
    count,
    voiceName,
    courseSize,
    programTrack,
  });

  const cq = await pool.query(`SELECT title FROM courses WHERE id = $1`, [courseId]);
  if (!cq.rowCount) return { status: 404, data: { error: 'COURSE_NOT_FOUND' }, headers: {} };
  const courseTitle = cq.rows[0].title || 'Course';

  const preset = await resolveCourseSize({ courseId, bodyCourseSize: courseSize, programTrack });
  // Fast-first-clip override (keep the very first request snappy)
const isFirstClip = ((Number(start) || 0) === 0) && ((Number(count) || 1) === 1);
const FAST_FIRST = process.env.FAST_FIRST_SSML === '1';
const pace = paceFor(preset.key);

// === Length knobs (env) ==================================
const UNIFORM_SHORT = process.env.LESSON_UNIFORM_SHORT === '1';
const FIRST_MIN  = Number(process.env.LESSON_FIRST_WORDS_MIN) || 350;
const FIRST_MAX  = Number(process.env.LESSON_FIRST_WORDS_MAX) || 550;
const FIRST_PMIN = Number(process.env.LESSON_FIRST_PARA_MIN)  || 5;
const FIRST_PMAX = Number(process.env.LESSON_FIRST_PARA_MAX)  || 7;

let wordsMin = preset.wordsMin;
let wordsMax = preset.wordsMax;
let [paraMin, paraMax] = preset.para;

// Keep the snappy first clip profile:
if (isFirstClip) {
  wordsMin = FIRST_MIN;
  wordsMax = FIRST_MAX;
  paraMin  = FIRST_PMIN;
  paraMax  = FIRST_PMAX;
}

// ✅ NEW: force *all* clips to the same short profile when enabled
if (UNIFORM_SHORT) {
  wordsMin = FIRST_MIN;
  wordsMax = FIRST_MAX;
  paraMin  = FIRST_PMIN;
  paraMax  = FIRST_PMAX;
}

const targetWords = Math.round((wordsMin + wordsMax) / 2);
const maxWords    = wordsMax;
const sentencesPerPara = targetWords >= 900 ? '2–3' : '1–2';
const sppNum = /^2[\u2013-]3$/.test(String(sentencesPerPara)) ? 2 : 1;


  if (!Array.isArray(outline) || outline.length === 0) {
    console.warn('[svc:lesson-ssml] EMPTY_OUTLINE');
    return { status: 400, data: { error: 'EMPTY_OUTLINE' }, headers: {} };
  }

  const safeStart = Math.max(0, Math.min(Number(start) || 0, Math.max(0, outline.length - 1)));
  const wantCount = Math.max(1, Number.isFinite(Number(count)) ? Number(count) : 1);
  const takeCount = Math.max(1, Math.min(wantCount, Math.max(1, outline.length - safeStart)));
  const outlineSlice = outline.slice(safeStart, safeStart + takeCount);

  dlog('lesson', 'slicing', {
    safeStart,
    takeCount,
    resultingSliceLen: outlineSlice.length,
    totalOutlineLen: outline.length,
    voiceName,
    pace,
    targetWords,
    paraMin,
    paraMax,
  });

  const outlineHash = sha1(JSON.stringify({ slice: outlineSlice, start: safeStart }));
 const SSML_CACHE_REV = 'ssmlrev2'; // bump when length rules change
const cfgSig = `${UNIFORM_SHORT?'u1':'u0'}:${FIRST_MIN}-${FIRST_MAX}-${FIRST_PMIN}-${FIRST_PMAX}`;
const cacheKey = `ai:ssml:${SSML_CACHE_REV}:lessons:${courseId}:size=${preset.key}:track=${programTrack || ''}:voice=${voiceName}:cfg=${cfgSig}:start=${safeStart}:n=${takeCount}:ol=${outlineHash}`;
const cached = await cacheGetJSON(cacheKey);

  if (cached?.lessons?.length) {
    dlog('lesson', 'cache HIT', { lessons: cached.lessons.length });
    const produced = Number(cached?.lessons?.length ?? takeCount);
    const hasMore = safeStart + produced < outline.length;
    const nextStart = hasMore ? safeStart + produced : null;
    return {
      status: 200,
      data: { ...cached, queue: { nextStart, hasMore, total: outline.length } },
      headers: {
        'X-Cache': 'HIT',
        'X-Next-Start': nextStart != null ? String(nextStart) : '',
        'X-Has-More': String(hasMore),
        'X-Total-Lessons': String(outline.length),
        'X-TTS-Rate': String(pace.ratePct),
        'X-TTS-ParaBreakMs': String(pace.paraBreakMs),
        'X-TTS-SectionBreakMs': String(pace.sectionBreakMs),
        'X-Voice': voiceName || '',
      }
    };
  }

   if (FAST_FIRST && isFirstClip) {
    const pack = await retryPlainSSML(); // uses simple system prompt; quick
    const produced = pack.lessons?.length ?? 0;
    const hasMore = safeStart + produced < outline.length;
    const nextStart = hasMore ? safeStart + produced : null;
    const payload = { ...pack, queue: { nextStart, hasMore, total: outline.length } };

    await cacheSetJSON(cacheKey, payload, REDIS_TTL.ssml);

    // (optional) kick off prewarm in background if allowed (_opts.prewarm)
    try {
      const PREWARM = Number(process.env.LESSON_PREWARM_COUNT || 2);
      if (_opts?.prewarm !== false && hasMore && PREWARM > 0) {
        setImmediate(() => {
          generateLessonSSMLService(
            { courseId, outline, voiceName, courseSize, count: Math.min(PREWARM, outline.length - 1), start: 1, programTrack },
            { prewarm: false, fastFirst: false } // <- avoid recursive fast-first
          ).catch(() => {});
        });
      }
    } catch {}
    return { status: 200, data: payload, headers: { 'X-Cache': 'MISS', 'X-Fast-First': '1' } };
  }

  const scaffoldFromOutline = () => {
    const o = outlineSlice[0];
    const absoluteIdx = safeStart;
    const id = `L${absoluteIdx + 1}`;
    const title = o?.title || `Lesson ${absoluteIdx + 1}`;
    const kp = Array.isArray(o?.keyPoints) ? o.keyPoints.slice(0, 4) : [];
    const goalsLine = kp.length ? kp.join('; ') : 'a small set of core ideas';
    const ssml = `
<speak version="1.0" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts">
  <voice name="${voiceName}">
    <prosody rate="${pace.ratePct}" pitch="+0st">
      <p><bookmark mark="${id}.S1"/>${title}. We’ll work through ${goalsLine}, keeping it practical and clear.</p>
      <p><bookmark mark="${id}.S2"/>We’ll return with a full narration shortly if the AI is temporarily unavailable.</p>
    </prosody>
  </voice>
</speak>`.trim();

    return {
      lessons: [{
        id, title, goals: kp, ssml,
        estSeconds: Math.round((preset.estAudioMinSec + preset.estAudioMaxSec) / 2),
        markdown: `### ${title}\n\n- Goals: ${kp.map((g)=>`**${g}**`).join(', ') || 'Understand the core idea and check yourself once.'}\n- Pitfall: confusing definitions with examples.\n- Try: explain the idea to a friend in one sentence.`,
        formulas: [], tables: [],
      }],
      joinedSsml: ssml
    };
  };

  if (breakerActive()) {
    console.warn(`[${LOG_NS}:lesson] breaker active; returning scaffold only`);
    const pack = scaffoldFromOutline();
    const produced = pack.lessons?.length ?? 0;
    const hasMore = safeStart + produced < outline.length;
    const nextStart = hasMore ? safeStart + produced : null;
    return {
      status: 503,
      data: { ...pack, notice: fallbackNotice('breaker_active'), queue: { nextStart, hasMore, total: outline.length } },
      headers: { 'Retry-After': '600' },
    };
  }

  async function retryPlainSSML() {
    const o = outlineSlice[0];
    const absoluteIdx = safeStart;
    const id = `L${absoluteIdx + 1}`;
    const title = o?.title || `Lesson ${absoluteIdx + 1}`;
    const kp = Array.isArray(o?.keyPoints) ? o.keyPoints.slice(0, 4) : [];

 const system = `You are a master teacher. Return ONLY valid Azure SSML for a single narrated lesson (no JSON, no backticks).
Wrap exactly:
<speak version="1.0" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts"><voice name="${voiceName}"><prosody rate="${pace.ratePct}" pitch="+0st"> ... </prosody></voice></speak>
Rules:
 - (Keep paragraphs short)
 - (Natural, teacherly tone)
 - (Do not use literal labels like "Hook:", "Core concept:", "Micro-check:", or "Recap:")
 - Punctuation: Every sentence MUST end with ., ?, or !. Use commas for introductory phrases (e.g., "However," "For example,") and for nonessential clauses. Prefer the Oxford comma in 3+ item lists. Keep "e.g." and "i.e." with periods intact. No comma splices.`;
/* If you also want bookmarks on the plain path, add one more bullet above:
 - Insert <bookmark mark="L{ABS}.S{n}"/> at the start of EVERY <p>, where ABS is the absolute 1-based lesson number in the whole course.
*/

    const user = `Course: ${courseTitle}
Absolute lesson #: ${absoluteIdx + 1}
Title: ${title}
Goals: ${kp.join('; ') || 'Teach the core concept, give one tight example, call out a pitfall, run a micro-check, and recap.'}
Write the narration.`;

    const content = await withTimeout(async (signal) => {
      const r = await withGate(
        'openai:ssml',
        process.env.NODE_ENV === 'production' ? 1 : 2,
        () => openai.chat.completions.create(
          {
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            temperature: 0.35,
            messages: [
              { role: 'system', content: system },
              { role: 'user',   content: user   },
            ],
            max_tokens: 1400,
          },
          { signal }
        )
      );
      return r.choices?.[0]?.message?.content || '';
    }, OPENAI_REQUEST_TIMEOUT_MS);

    let ssml = content?.trim() || '';
    if (!/^\s*<speak[\s>]/i.test(ssml)) {
      ssml = `
<speak version="1.0" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts">
  <voice name="${voiceName}">
    <prosody rate="${pace.ratePct}" pitch="+0st">
${ssml}
    </prosody>
  </voice>
</speak>`.trim();
    }

    // Sanitize and then enforce length
    ssml = sanitizeSsml(ssml, id, voiceName, { ratePct: pace.ratePct, breakMs: pace.paraBreakMs, sentencesPerPara: sppNum, dedupe: false });
    ssml = closeProsodyIfMissing(ssml);

    const minWords = wordsMin;
    if (wordCountFromSsml(ssml) < Math.floor(minWords * 0.9)) {
      const expandSystem = `You expand Azure SSML while keeping the same wrapper and voice.
Return ONLY valid SSML. Append 4–6 new <p> blocks that deepen the worked example,
add a brief pitfall explanation, a realistic micro-check, and a plain-English recap.
Do not use literal labels like "Hook:" etc. Keep the same prosody rate (${pace.ratePct}).`;
      const expandUser = `Here is the current SSML for lesson ${id}. Expand it to ~${minWords} words total:\n\n${ssml}`;

      const expanded = await withTimeout(async (signal) => {
        const r = await withGate(
          'openai:ssml:expand',
          process.env.NODE_ENV === 'production' ? 1 : 2,
          () => openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            temperature: 0.3,
            messages: [{ role: 'system', content: expandSystem }, { role: 'user', content: expandUser }],
            max_tokens: 1400,
          }, { signal })
        );
        return r.choices?.[0]?.message?.content || ssml;
      }, OPENAI_REQUEST_TIMEOUT_MS);

      ssml = sanitizeSsml(expanded, id, voiceName, { ratePct: pace.ratePct, breakMs: pace.paraBreakMs, sentencesPerPara: sppNum, dedupe: false });
      ssml = closeProsodyIfMissing(ssml);
    }

    const syntheticSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="160"><rect width="300" height="160" fill="#f6f7fb"/><circle cx="70" cy="80" r="28" fill="#c4d7ff"/><rect x="120" y="60" width="150" height="40" fill="#b8e3d0"/></svg>';
const estSeconds = Math.round((preset.estAudioMinSec + preset.estAudioMaxSec) / 2);
 const lesson = {
   id, title, goals: kp, ssml: ssml.trim(), estSeconds,
   markdown: `## Illustrations\n![Simple schematic](data:image/svg+xml;utf8,${encodeURIComponent(syntheticSvg)})`,
   formulas: [], tables: [],
   images: [{ id: `${id}-im1`, title: 'Simple schematic', alt: 'Simple schematic', url: `data:image/svg+xml;utf8,${encodeURIComponent(syntheticSvg)}`, caption: 'Generated placeholder', announceAtSentence: 1 }],
   charts: []
};
    return { lessons: [lesson], joinedSsml: lesson.ssml };
  }

  try {
    const outlineStr = outlineSlice
      .map((o, i) => {
        const absoluteIdx = safeStart + i;
        return `Section ${absoluteIdx + 1}: ${o.title} — ${o.keyPoints?.join('; ') || ''}`;
      })
      .join('\n');

    dlog('lesson', 'calling OpenAI', {
      sections: outlineSlice.length,
      start: safeStart,
      count: takeCount,
    });

    const signals = inferLessonSignals(courseTitle, outlineSlice[0]);
    const minTables   = signals.wantTable ? 1 : 0;
    const minImages   = signals.minImages || 0;
    const minSnippets = signals.minSnippets || 0;

    const json = await withGate(
      'openai:lesson',
      process.env.NODE_ENV === 'production' ? 1 : 2,
      () => aiJson({
        system: `You are a master teacher writing **natural** SSML for narrated lessons.
Return JSON STRICTLY matching the provided JSON Schema. Do not include Markdown code fences or any text outside the JSON fields.
The JSON MUST contain a "lessons" array of EXACTLY ${takeCount} item(s)—one per section in the request slice.

Guidelines for each lesson (write *naturally*, no section labels):
- Target ~${targetWords} words (min ${wordsMin}, soft max ${maxWords}); present tense; conversational and clear.
- Structure as ${paraMin}–${paraMax} paragraphs. Each <p> has ${sentencesPerPara} short sentences (≤ 140 chars).
- Insert <bookmark mark="L{ABS}.S{n}"/> at the start of EVERY <p>, where ABS is the absolute 1-based lesson number in the whole course.
- Punctuation: end every sentence with ., ?, or !; use commas after introductory phrases and for nonessential clauses; prefer the Oxford comma in 3+ item lists; keep "e.g."/"i.e." properly punctuated; avoid comma splices.

- Wrap Azure SSML exactly:
  <speak version="1.0" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts"><voice name="${voiceName}"><prosody rate="${pace.ratePct}" pitch="+0st"> ... </prosody></voice></speak>

Content artifacts (MANDATORY):
- "markdown": slide-style notes in GFM. Use headings + bullet points — no literal labels like "Hook:" or "Recap:". Include:
  • a **Formulas** section with $$ LaTeX $$ for each formula you output, and
  • a **Quick table(s)** section with compact GFM tables (| col | … |),
  • if visuals help, an **Illustrations** section containing Markdown images: \`![alt](URL-or-dataURI)\` with short captions,
  • if programming-related, a **Code snippets** section with fenced blocks (language-tagged), plus a one-line explanation per snippet.
- "formulas": include >= ${(signals.minFormulas ?? 2)} if the topic is quantitative; otherwise [].
  Each item: { id:"f1..", title, latex, speakAs∈{"math","spell-out","characters","none"}, variables:{symbol, meaning}, announceAtSentence:<1-based index> }.
  In narration, explain equations ... and say **“of” for parentheses** (e.g., f(x) → “f of x”).
- "tables": include >= ${(typeof minTables !== 'undefined' ? minTables : 1)} if comparing steps/items; otherwise []. Keep compact.
 - "images": include >= ${minImages}. Each item MUST include:
   { id, title, alt, url, caption, announceAtSentence }.
   Prefer simple line-diagram-style illustrations. Use https or data URLs.

- "charts": when appropriate, include ≥ 1. Each MUST be:
  { id, title, kind∈[bar|line|pie|histogram|scatter|box|heatmap|other], alt, caption,
    url, svg, announceAtSentence }.
  Include BOTH keys "url" and "svg": put the rendered SVG string in "svg" and set "url" to null,
  OR host it and put the link in "url" and set "svg" to null. Do not omit either key.

- "charts": when appropriate (comparisons, distributions, proportions), include >= 1 of: bar, line, pie, histogram, scatter, box, heatmap. Prefer **data:image/svg+xml;utf8,<svg...>** in "url"; if you instead return raw SVG, put it in "svg".
- "snippets": include >= ${minSnippets} when the section is programming-related. Each: { id, title, language, code, explanation, announceAtSentence }. Keep code runnable and concise.`,
        user: `Course: ${courseTitle}
START_INDEX (0-based in full course): ${safeStart}
Sections (absolute numbering shown):
${outlineStr}
Write one self-contained lesson per section with a hook, goals, core concept, worked example, pitfall, a micro-check, and a recap.`,
        temperature: 0.35,
        maxTokens: 4800,
        schema: LESSON_PACK_SCHEMA,
        tries: 3
      })
    );

    const rawCount = Array.isArray(json?.lessons) ? json.lessons.length : 0;
    dlog('lesson', 'openai returned', { rawCount });

    // Build lessons with awaitable expansion guard
    const lessons = [];
    const rawLessons = (Array.isArray(json?.lessons) ? json.lessons : []).slice(0, takeCount);

    for (let i = 0; i < rawLessons.length; i++) {
      const l = rawLessons[i];
      const absoluteIdx = safeStart + i;
      const id = `L${absoluteIdx + 1}`;
      const title = String(l?.title || outlineSlice[i]?.title || `Lesson ${absoluteIdx + 1}`);
      const goals = Array.isArray(l?.goals) ? l.goals.slice(0, 6) : [];
      const estSeconds = Number(
        l?.estSeconds || Math.round((preset.estAudioMinSec + preset.estAudioMaxSec) / 2)
      );

      let ssml = String(l?.ssml || '');
      if (!/^\s*<speak[\s>]/i.test(ssml)) {
        ssml = `
<speak version="1.0" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts">
  <voice name="${voiceName}">
    <prosody rate="${pace.ratePct}" pitch="+0st">
${ssml}
    </prosody>
  </voice>
</speak>`.trim();
      }
      if (!/<bookmark\s+mark=/.test(ssml)) {
        ssml = ssml.replace(
          /<prosody[^>]*>/i,
          (m) => `${m}\n      <p><bookmark mark="${id}.S1"/>${title}</p>\n      <break time="400ms"/>`
        );
      }

      // Sanitize first (keeps structure), no aggressive dedupe
      ssml = sanitizeSsml(ssml, id, voiceName, {
        ratePct: pace.ratePct,
        breakMs: pace.paraBreakMs,
        sentencesPerPara: sppNum,
        dedupe: false,
      });
      ssml = closeProsodyIfMissing(ssml);

      // Enforce preset length if short (≈90% of wordsMin)
     const minWords = wordsMin;
      if (wordCountFromSsml(ssml) < Math.floor(minWords * 0.9)) {
        const expandSystem = `You expand Azure SSML while keeping the same wrapper and voice.
Return ONLY valid SSML. Append 4–6 new <p> blocks that deepen the worked example,
add a brief pitfall explanation, a realistic micro-check, and a plain-English recap.
Do not use literal labels like "Hook:" etc. Keep the same prosody rate (${pace.ratePct}).`;
        const expandUser = `Here is the current SSML for lesson ${id}. Expand it to ~${minWords} words total:\n\n${ssml}`;

        const expanded = await withTimeout(async (signal) => {
          const r = await withGate(
            'openai:ssml:expand',
            process.env.NODE_ENV === 'production' ? 1 : 2,
            () => openai.chat.completions.create({
              model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
              temperature: 0.3,
              messages: [{ role: 'system', content: expandSystem }, { role: 'user', content: expandUser }],
              max_tokens: 1400,
            }, { signal })
          );
          return r.choices?.[0]?.message?.content || ssml;
        }, OPENAI_REQUEST_TIMEOUT_MS);

        ssml = sanitizeSsml(expanded, id, voiceName, {
          ratePct: pace.ratePct,
          breakMs: pace.paraBreakMs,
          sentencesPerPara: sppNum,
          dedupe: false,
        });
        ssml = closeProsodyIfMissing(ssml);
      }

      const markdown = typeof l?.markdown === 'string' ? l.markdown : '';
      const formulas = Array.isArray(l?.formulas) ? l.formulas : [];
      const tables   = Array.isArray(l?.tables) ? l.tables : [];
      const charts   = Array.isArray(l?.charts) ? l.charts : [];
       const images   = Array.isArray(l?.images) ? l.images : [];
      const snippets = Array.isArray(l?.snippets) ? l.snippets : [];

       // 🔍 compact per-lesson artifact summary (only when DEBUG_AI=1)
      dlog('lesson', 'artifacts', {
        lessonId: id,
        formulas: formulas.length,
        tables:   tables.length,
        charts:   charts.length,
        images:   images.length,
        snippets: snippets.length,
      });


      let lesson = { id, title, goals, ssml: ssml.trim(), estSeconds, markdown, formulas, tables, charts, images, snippets };
      lesson = ensureAnchorsForArtifacts(lesson, lesson.ssml);
      lessons.push(lesson);
    }

    // Ensure markdown contains sections for any formulas/tables if missing
    function renderGfmTable(t = { columns: [], rows: [] }) {
   const cols = Array.isArray(t.columns) ? t.columns : [];
   const rows = Array.isArray(t.rows) ? t.rows : [];
   if (!cols.length) return '';
   const head = `| ${cols.join(' | ')} |\n| ${cols.map(() => '-').join(' | ')} |`;
   const body = rows.map(r => `| ${r.map(x => String(x)).join(' | ')} |`).join('\n');
      return `\n**${t.title || 'Table'}**${t.caption ? ` — _${t.caption}_` : ''}\n\n${head}\n${body}\n`;
    }

    const svgToDataUrl = (svg) =>
      `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    function renderChart(ch) {
  const alt = (ch.alt || ch.title || ch.kind || 'Chart').replace(/\|/g,'-');
  const inlineSvg = typeof ch.svg === 'string' && ch.svg.trim() ? svgToDataUrl(ch.svg) : '';
  const url = (typeof ch.url === 'string' && ch.url.trim()) ? ch.url : inlineSvg;
  if (url) {
    const title = ch.title || (ch.kind ? ch.kind[0].toUpperCase() + ch.kind.slice(1) : 'Chart');
    return `\n**${title}**${ch.caption ? ` — _${ch.caption}_` : ''}\n\n![${alt}](${url})\n`;
  }
  return `\n**${ch.title || 'Chart'}**${ch.caption ? ` — _${ch.caption}_` : ''}\n`;
}


          function renderImage(im) {
        const alt = (im.alt || im.title || 'Illustration').replace(/\|/g,'-');
        if (im.url) return `\n**${im.title || 'Illustration'}**${im.caption ? ` — _${im.caption}_` : ''}\n\n![${alt}](${im.url})\n`;
        return `\n**${im.title || 'Illustration'}**${im.caption ? ` — _${im.caption}_` : ''}\n`;
      }
      function renderSnippet(sn) {
        const map = { 'ts': 'typescript', 'c#': 'csharp', 'c++': 'cpp' };
        const raw = (sn.language || '').toLowerCase();
        const lang = map[raw] || raw;
        const header = `\n**${sn.title || 'Code snippet'}**${sn.explanation ? ` — _${sn.explanation}_` : ''}\n\n`;
        return `${header}\`\`\`${lang}\n${sn.code || ''}\n\`\`\`\n`;
      }


    
      
  const enhanced = lessons.map(L => {
    let md = String(L.markdown || '').trim();

    const hasAnyLatex      = /\$\$[^$]+\$\$/.test(md);
    const hasAnyTable      = /\|.+\|/.test(md);
    const hasChartsSection = /(^|\n)##\s*Charts\b/i.test(md);
    const hasAnyImage      = /!\[[^\]]*\]\([^)]+\)/.test(md);
    const hasAnyFence      = /```/.test(md);

    // Charts: insert section only if a "## Charts" section isn't already present
    if (L.charts?.length && !hasChartsSection) {
      md += `\n\n## Charts\n` + L.charts.map(renderChart).join('\n');
    }

    if (L.formulas?.length && !hasAnyLatex) {
      md += `\n\n## Formulas\n` + L.formulas
        .map(f => `**${f.title || f.id}**\n\n$$\n${f.latex}\n$$`)
        .join('\n\n');
    }

    if (L.tables?.length && !hasAnyTable) {
      md += `\n\n## Quick table(s)\n` + L.tables.map(renderGfmTable).join('\n');
    }

    // (removed the duplicate charts block that referenced hasAnyChart)

    if (L.images?.length && !hasAnyImage) {
      md += `\n\n## Illustrations\n` + L.images.map(renderImage).join('\n');
    }

    if (L.snippets?.length && !hasAnyFence) {
      md += `\n\n## Code snippets\n` + L.snippets.map(renderSnippet).join('\n');
    }

    return { ...L, markdown: md.trim() };
  });
  lessons.splice(0, lessons.length, ...enhanced);


    

    if (!lessons.length) {
      console.warn(`[${LOG_NS}:lesson] AI returned empty lessons; retrying plain SSML`);
      try {
        const pack = await retryPlainSSML();
        const produced = pack.lessons?.length ?? 0;
        const hasMore = safeStart + produced < outline.length;
        const nextStart = hasMore ? safeStart + produced : null;
        const payload = { ...pack, queue: { nextStart, hasMore, total: outline.length } };
        await cacheSetJSON(cacheKey, pack, REDIS_TTL.ssml);
        return {
          status: 206,
          data: { ...payload, notice: { degraded: true, reason: 'json_parse_failed_plain_ssml' } },
          headers: {
            'X-Cache': 'MISS',
            'X-Degraded': 'true',
            'X-Next-Start': nextStart != null ? String(nextStart) : '',
            'X-Has-More': String(hasMore),
            'X-Total-Lessons': String(outline.length),
            'X-TTS-Rate': String(pace.ratePct),
            'X-TTS-ParaBreakMs': String(pace.paraBreakMs),
            'X-TTS-SectionBreakMs': String(pace.sectionBreakMs),
            'X-Voice': voiceName || '',
          }
        };
      } catch {
        console.warn(`[${LOG_NS}:lesson] plain SSML retry failed; falling back to scaffold`);
        const pack = scaffoldFromOutline();
        const produced = pack.lessons?.length ?? 0;
        const hasMore = safeStart + produced < outline.length;
        const nextStart = hasMore ? safeStart + produced : null;
        const payload = { ...pack, queue: { nextStart, hasMore, total: outline.length } };
        return { status: 502, data: { ...payload, notice: { degraded: true, reason: 'ai_empty_lessons' } }, headers: {} };
      }
    }

    // Build a SINGLE <speak> wrapper for all lessons
    const bodies = lessons.map((L, i) => {
      const body = innerProsody(L.ssml);
      if (i === 0) return body;
      return `<p><break time="${pace.sectionBreakMs}ms"/></p>\n${body}`;
    });

    const joinedSsml = `
<speak version="1.0" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts">
  <voice name="${voiceName}">
    <prosody rate="${pace.ratePct}" pitch="+0st">
${bodies.join('\n')}
    </prosody>
  </voice>
</speak>`.trim();

    // Optional sanity check
    const opens = (joinedSsml.match(/<prosody\b/gi) || []).length;
    const closes = (joinedSsml.match(/<\/prosody>/gi) || []).length;
    if (opens !== 1 || closes !== 1) {
      console.warn('[tts] SSML prosody mismatch', { opens, closes });
    }

    const hasMore = safeStart + lessons.length < outline.length;
    const nextStart = hasMore ? safeStart + lessons.length : null;
    const payload = { lessons, joinedSsml, queue: { nextStart, hasMore, total: outline.length } };
    await cacheSetJSON(cacheKey, payload, REDIS_TTL.ssml);
    log('log', 'lesson', 'success', { lessons: lessons.length, joinedBytes: joinedSsml.length });

        const artifactTotals = lessons.reduce((acc, L) => {
      acc.formulas += Array.isArray(L.formulas) ? L.formulas.length : 0;
      acc.tables   += Array.isArray(L.tables)   ? L.tables.length   : 0;
      acc.charts   += Array.isArray(L.charts)   ? L.charts.length   : 0;
      acc.images   += Array.isArray(L.images)   ? L.images.length   : 0;
      acc.snippets += Array.isArray(L.snippets) ? L.snippets.length : 0;
      return acc;
    }, { formulas: 0, tables: 0, charts: 0, images: 0, snippets: 0 });

    dlog('lesson', 'artifacts-total', {
      lessons: lessons.length,
      ...artifactTotals,
    });

    
    // 🔥 Fire-and-forget prewarm for the next chunk to keep UX instant
    try {
      const PREWARM = Number(process.env.LESSON_PREWARM_COUNT || 2); // 0..3
      const okToPrewarm = _opts?.prewarm !== false && hasMore && takeCount === 1 && safeStart === 0 && PREWARM > 0;
      if (okToPrewarm && nextStart != null) {
        const preCount = Math.min(PREWARM, Math.max(0, outline.length - nextStart));
        setImmediate(() => {
          generateLessonSSMLService(
            { courseId, outline, voiceName, courseSize, count: preCount, start: nextStart, programTrack },
            { prewarm: false } // prevent chaining forever
          ).catch(() => {});
        });
      }
    } catch {}
    return {
      status: 200,
      data: payload,
      headers: {
        'X-Cache': 'MISS',
        'X-Next-Start': nextStart != null ? String(nextStart) : '',
        'X-Has-More': String(hasMore),
        'X-Total-Lessons': String(outline.length),
        'X-TTS-Rate': String(pace.ratePct),
        'X-TTS-ParaBreakMs': String(pace.paraBreakMs),
        'X-TTS-SectionBreakMs': String(pace.sectionBreakMs),
        'X-Voice': voiceName || '',
      }
    };
  } catch (err) {
    const c = classifyOpenAIError(err);
    console.warn(`[${LOG_NS}:lesson] error`, { kind: c.kind, status: c.status, msg: err?.message });

    if (c.kind === 'quota' || c.kind === 'rate_limit') {
      const pack = scaffoldFromOutline();
      const produced = pack.lessons?.length ?? 0;
      const hasMore = safeStart + produced < outline.length;
      const nextStart = hasMore ? safeStart + produced : null;
      dlog('lesson', 'artifacts-total', {
      lessons: produced,
      formulas: 0,
      tables: 0,
      charts: 0,
      images: 0,
      snippets: 0,
      fallback: 'scaffold',
    });
      return {
        status: 503,
        data: { ...pack, notice: fallbackNotice(c.kind), queue: { nextStart, hasMore, total: outline.length } },
        headers: { 'Retry-After': String(c.retryAfterSec || 10) }
      };
    }
    if (c.kind === 'timeout' || c.kind === 'network') {
      return { status: 503, data: { error: c.message || 'temporary_error' }, headers: { 'Retry-After': String(c.retryAfterSec || 5) } };
    }
    if (c.kind === 'auth') {
      return { status: 401, data: { error: 'OpenAI API key invalid or unauthorized' }, headers: {} };
    }

    if (c.kind === 'bad_request' || c.kind === 'unknown') {
  try {
    const pack = await retryPlainSSML(); // produce a full narration
    const produced = pack.lessons?.length ?? 0;
    const hasMore = safeStart + produced < outline.length;
    const nextStart = hasMore ? safeStart + produced : null;

   const L0 = pack.lessons?.[0] || {};
dlog('lesson', 'artifacts-total', {
  lessons: pack.lessons?.length ?? 0,
  formulas: Array.isArray(L0.formulas) ? L0.formulas.length : 0,
  tables:   Array.isArray(L0.tables)   ? L0.tables.length   : 0,
  charts:   Array.isArray(L0.charts)   ? L0.charts.length   : 0,
  images:   Array.isArray(L0.images)   ? L0.images.length   : 0,
  snippets: Array.isArray(L0.snippets) ? L0.snippets.length : 0,
  fallback: 'plain_ssml',
});


    return {
      status: 206,
      data: { ...pack, notice: fallbackNotice('schema_error_plain_ssml'), queue: { nextStart, hasMore, total: outline.length } },
      headers: {}
    };
  } catch {
    const pack = scaffoldFromOutline();
    const produced = pack.lessons?.length ?? 0;
    const hasMore = safeStart + produced < outline.length;
    const nextStart = hasMore ? safeStart + produced : null;
    return {
      status: 502,
      data: { ...pack, notice: fallbackNotice('bad_request_scaffold'), queue: { nextStart, hasMore, total: outline.length } },
      headers: {}
    };
  }
}

    throw err;
  }
}


/* Helper: normalize/repair AI quiz output and top it up with fallbacks (mcq/short) */
function normalizeQuizArray(questions, desired, courseTitle, outline, quizType = 'mcq') {
  const out = [];
  const seen = new Set();
  const push = (q) => {
    if (!q) return;

    const t = (q.type || quizType || 'mcq').toLowerCase();
    const id = String(q.id || `q${out.length + 1}`);
    const rawDisplay = typeof q.display === 'string' ? q.display : undefined;   
    const looksMasked = !!rawDisplay && /_{2,}/.test(rawDisplay.replace(/\s+/g, ''));
    const display = looksMasked ? undefined : rawDisplay;
    const prompt = String(q.prompt ?? display ?? '').trim();
    if (!prompt && !display) return;
    const sig = `${t}::${(display || prompt).toLowerCase()}::${(q.topic || '').toLowerCase()}`;

    if (seen.has(sig)) return;

    if (t === 'mcq') {
      let choices = Array.isArray(q.choices) ? q.choices.map(String) : [];
      if (choices.length !== 4) {
        choices = (choices.slice(0, 4).concat(['Option A','Option B','Option C','Option D'])).slice(0, 4);
      }
      let answerIndex = Number.isFinite(Number(q.answerIndex)) ? Number(q.answerIndex) : 0;
      if (answerIndex < 0 || answerIndex > 3) answerIndex = 0;
      out.push({ id, type: 'mcq', prompt, ...(display ? { display } : {}), choices, answerIndex, explanation: q.explanation || '' });
    } else {
      let answer = String(q.answer ?? '').trim();
      const accept = Array.isArray(q.accept) ? q.accept.map(String) : [];
      const regex = typeof q.regex === 'string' && q.regex.trim() ? q.regex.trim() : undefined;
      // If the model gives regex/accept but no canonical answer, fall back to first accept term
      if (!answer && (accept.length || regex)) answer = accept[0] || '';
      if (!answer) return;
     out.push({ id, type: 'short', prompt, ...(display ? { display } : {}), answer, accept, regex, explanation: q.explanation || '' });
    }
    seen.add(sig);
  };

  if (Array.isArray(questions)) {
    for (const q of questions) push(q);
  }

  if (out.length < desired) {
    const fb = makeFallbackQuiz(courseTitle, outline, desired, quizType);
    for (let i = 0; i < fb.length && out.length < desired; i++) push(fb[i]);
  }

  return out.slice(0, desired).map((q, i) => ({ ...q, id: `q${i + 1}` }));
}

export async function generateQuizService({ courseId, outline, numQuestions, courseSize, programTrack, quizType }) {
  dlog('quiz', 'enter', { courseId, outlineLen: Array.isArray(outline) ? outline.length : 0, numQuestions, courseSize, programTrack, quizType });

  
 // Require explicit quizType: 'mcq' | 'short'
 const qt = String(quizType || '').toLowerCase();
 if (!['mcq', 'short'].includes(qt)) {
   return {
     status: 400,
     data: { error: 'INVALID_QUIZ_TYPE', message: "quizType must be 'mcq' or 'short' (explicit)." },
     headers: {}
   };
 }
 quizType = qt;

  const cq = await pool.query(`SELECT title FROM courses WHERE id = $1`, [courseId]);
  if (!cq.rowCount) return { status: 404, data: { error: 'COURSE_NOT_FOUND' }, headers: {} };
  const courseTitle = cq.rows[0].title || 'Course';

  const preset = await resolveCourseSize({ courseId, bodyCourseSize: courseSize, programTrack });
  
  const perLesson = preset.quizPerLesson;
  const desired = (Array.isArray(outline) ? outline.length : 0) * perLesson;
   const n = Number.isFinite(Number(numQuestions)) && Number(numQuestions) > 0
   ? Number(numQuestions)
   : Math.max(1, desired);

  const olHash = sha1(JSON.stringify(outline))
   const QUIZ_CACHE_REV = 'qrev11';// bump when prompt/display rules change
  const cacheKey = `ai:quiz:${QUIZ_CACHE_REV}:${courseId}:size=${preset.key}:track=${programTrack || ''}:qt=${quizType}:n=${n}:ol=${olHash}`;
  const cached = await cacheGetJSON(cacheKey);
  if (cached?.quiz?.questions?.length) {
    dlog('quiz', 'cache HIT', { questions: cached.quiz.questions.length });
    return { status: 200, data: { quiz: cached.quiz }, headers: { 'X-Cache': 'HIT' } };
  }

  if (breakerActive()) {
    console.warn(`[${LOG_NS}:quiz] breaker active; serving fallback`);
    const qs = makeFallbackQuiz(courseTitle, outline, n, quizType);
    return { status: 503, data: { quiz: { quizType, questions: qs }, notice: fallbackNotice('breaker_active') }, headers: { 'Retry-After': '600' } };
  }



 try {
    const perQTokens = quizType === 'mcq' ? 55 : 65;
  const CHUNK = n > 24 ? 12 : n;
  const QUIZ_CONCURRENCY = Number(process.env.QUIZ_CONCURRENCY || (process.env.NODE_ENV === 'production' ? 2 : 3));

  async function genQuizSlice(start, count) {
    const focus = (outline || []).slice(0, Math.min(6, outline?.length || 0));

    const system =
      quizType === 'mcq'
        ? `Create a multiple-choice quiz as JSON strictly matching the schema.
Always include ALL fields for each question: id, type, prompt, display, choices, answerIndex, explanation (even if some are empty strings).
Question shape: {"id":"q1","type":"mcq","prompt":"...","display":"(optional)","choices":["A","B","C","D"],"answerIndex":0..3,"explanation":"(optional)"}
Return {"questions":[...]} (optionally include "quizType":"mcq").
You MAY also include a top-level "timerSec" integer for the whole quiz by estimating a fair total time (seconds) for the full set, based on difficulty.
Rules for prompts (MUST follow):
 - "prompt" MUST be non-empty, specific, and self-contained (no placeholders).
 - Do NOT use generic stems like "Which statement is TRUE..." or "Fill in a key term...".
 - If you put formulas/notation in "display", still provide a clear natural-language "prompt".`
        : `Create a short-answer quiz as JSON strictly matching the schema.
Always include ALL fields for each question: id, type, prompt, display, answer, accept, regex, explanation (accept can be [], regex can be "").
Question shape: {"id":"q1","type":"short","prompt":"...","display":"(optional LaTeX or Unicode for chemistry)","answer":"H2O","accept":["water"],"regex":"^(?i)h\\s*2\\s*o$","explanation":"(optional)"}
Return {"questions":[...]} (optionally include "quizType":"short").
You MAY also include a top-level "timerSec" integer for the whole quiz by estimating a fair total time (seconds) for the full set, based on difficulty.
Rules for prompts (MUST follow):
 - "prompt" MUST be non-empty, specific, and self-contained (no placeholders).
 - Do NOT use generic stems like "Which statement is TRUE..." or "Fill in a key term...".
 - If you put formulas/notation in "display", still provide a clear natural-language "prompt".`;

    const user =
      `Course: ${courseTitle}\n` +
      (focus.length
        ? `Focus areas:\n${focus.map((o)=>`- ${o.title}: ${(o.keyPoints||[]).join(', ')}`).join('\n')}\n`
        : ``) +
      `Produce exactly ${count} questions (${quizType.toUpperCase()}). Questions ${start + 1}–${start + count} of ${n}.`;

    const json = await withGate(
      'openai:quiz',
      QUIZ_CONCURRENCY,
      () => aiJson({
        system,
        user,
        temperature: 0.18,
        maxTokens: Math.min(3500, Math.max(800, perQTokens * count + 200)),
        tries: 2,
        schema: quizType === 'mcq' ? QUIZ_SCHEMA_MCQ : QUIZ_SCHEMA_SHORT
      })
    );

    const items = Array.isArray(json?.questions) ? json.questions.slice(0, count) : [];
    const timerSec = Number.isFinite(Number(json?.timerSec)) ? Number(json.timerSec) : null; // <-- capture top-level timer
    return { items, timerSec };
  }

  const all = [];
  let lastAiTimer = null;

  for (let i = 0; i < n; i += CHUNK) {
    const take = Math.min(CHUNK, n - i);
    try {
      const { items, timerSec } = await genQuizSlice(i, take);
      all.push(...items);
      if (Number.isFinite(timerSec) && timerSec > 0) lastAiTimer = timerSec; // keep the last non-empty
    } catch (e) {
      console.warn(`[${LOG_NS}:quiz] slice ${i}-${i+take-1} failed; continuing`, e?.message);
    }
  }

  // Normalize/repair and top-up as needed
  const normalized = normalizeQuizArray(all, n, courseTitle, outline, quizType);

  // Clamp + timer decision
  const ENV_MIN = Number(process.env.QUIZ_TIMER_MIN_SEC || 120);
  const ENV_MAX = Number(process.env.QUIZ_TIMER_MAX_SEC || 3600);
  const forced  = Number(process.env.QUIZ_TIMER_FORCE_SEC || 0);
  const clamp = (v) => Math.max(ENV_MIN, Math.min(ENV_MAX, Math.floor(v)));

  const aiTimerRaw = Number.isFinite(lastAiTimer) ? lastAiTimer : NaN;
  let timerSec, timerSource;
  if (Number.isFinite(forced) && forced > 0) {
    timerSec = clamp(forced); timerSource = 'force_env';
  } else if (Number.isFinite(aiTimerRaw) && aiTimerRaw > 0) {
    timerSec = clamp(aiTimerRaw); timerSource = 'ai_suggested';
  } else {
    const computed = fairTimerSec({ count: normalized.length, quizType, preset });
    timerSec = clamp(computed); timerSource = 'auto_fair';
  }

  const keptFromAI = Math.min(all.length, normalized.length);
  const toppedUp = Math.max(0, normalized.length - all.length);
  const rawCount = all.length;
  const degraded = rawCount === 0 || normalized.length < rawCount;

  const quiz = { quizType, questions: normalized, timerSec };
  await cacheSetJSON(cacheKey, { quiz }, REDIS_TTL.quiz);
  dlog('quiz', 'success', { questions: quiz.questions.length, timerSec, keptFromAI, toppedUp, degraded });

  return {
    status: degraded ? 206 : 200,
    data: { quiz, ...(degraded ? { notice: fallbackNotice('quiz_repaired_or_fallback') } : {}) },
    headers: {
      ...(degraded ? { 'X-Degraded': 'true' } : { 'X-Cache': 'MISS' }),
      'X-Quiz-Timer-Sec': String(timerSec),
      'X-Quiz-Timer-Source': timerSource
    }
  };

  } catch (err) {
    const c = classifyOpenAIError(err);
    console.warn(`[${LOG_NS}:quiz] error`, { kind: c.kind, status: c.status, msg: err?.message });

    if (c.kind === 'quota') {
      tripBreaker(10);
      const qs = makeFallbackQuiz(courseTitle, outline, n, quizType);
      return { status: 503, data: { quiz: { quizType, questions: qs }, notice: fallbackNotice('insufficient_quota') }, headers: { 'Retry-After': String(c.retryAfterSec || 600) } };
    }
    if (c.kind === 'rate_limit') {
      const qs = makeFallbackQuiz(courseTitle, outline, n, quizType);
      return { status: 503, data: { quiz: { quizType, questions: qs }, notice: fallbackNotice('rate_limited') }, headers: { 'Retry-After': String(c.retryAfterSec || 20) } };
    }
    if (c.kind === 'auth') {
      return { status: 401, data: { error: 'OpenAI API key invalid or unauthorized' }, headers: {} };
    }
    if (c.kind === 'timeout') {
      return { status: 503, data: { error: 'AI service timeout. Please try again.' }, headers: { 'Retry-After': '5' } };
    }
    if (c.kind === 'network') {
      return { status: 503, data: { error: 'AI network error. Please retry shortly.' }, headers: { 'Retry-After': '10' } };
    }

    const qs = makeFallbackQuiz(courseTitle, outline, n, quizType);
    return {
      status: 206,
      data: { quiz: { quizType, questions: qs }, notice: fallbackNotice(c.kind === 'bad_request' ? 'bad_request' : 'server_error') },
      headers: { 'X-Degraded': 'true' }
    };
  }
}

export async function generateCoursePackageService({ courseId, level = 'beginner', targetMinutes, voiceName = 'en-US-JennyNeural', numQuestions, courseSize, programTrack, totalLessons, quizType }) {
   const qt = String(quizType || '').toLowerCase();
   if (!['mcq', 'short'].includes(qt)) {
     return { status: 400, data: { error: 'INVALID_QUIZ_TYPE', message: "quizType must be 'mcq' or 'short' (explicit)." }, headers: {} };
   }
   const derivedQuizType = qt;

  dlog('package', 'enter', {
    courseId, level, targetMinutes, voiceName, numQuestions, courseSize, programTrack, totalLessons,
    quizType: derivedQuizType
  });


  const { rows } = await pool.query(`SELECT title, description FROM courses WHERE id = $1`, [courseId]);
  if (!rows?.length) return { status: 404, data: { error: 'COURSE_NOT_FOUND' }, headers: {} };
  const courseTitle = rows[0].title || 'Course';
  const courseDesc  = rows[0].description || '';

  const preset = await resolveCourseSize({ courseId, bodyCourseSize: courseSize, programTrack });
  const effectiveTarget = Number.isFinite(Number(targetMinutes)) && Number(targetMinutes) > 0
    ? Number(targetMinutes)
    : defaultTargetMinutesOf(preset);

  // Outline
  let outline, outlineResp = await generateOutlineService({ courseId, title: courseTitle, level, targetMinutes: effectiveTarget, courseSize, programTrack,totalLessons,});
  if (outlineResp.status === 200) outline = outlineResp.data.outline;
  else if (outlineResp.data?.outline) outline = outlineResp.data.outline;
  else outline = makeFallbackOutline(courseTitle).slice(0, totalLessonsOf(preset));

  // Lessons
  const lessons = [];
  const ssmlParts = [];
  let anyDegradedLesson = false;
  for (let i = 0; i < outline.length; i++) {
    try {
      const r = await generateLessonSSMLService({ courseId, outline, voiceName, courseSize, count: 1, start: i, programTrack });
      const L = r.data?.lessons?.[0];
      if (L) {
        lessons.push(L);
        ssmlParts.push(L.ssml);
        if (r.status && r.status !== 200) anyDegradedLesson = true;
      } else {
        const tmp = await generateLessonSSMLService({ courseId, outline: [outline[i]], voiceName, courseSize, count: 1, start: 0, programTrack });
        const F = tmp.data?.lessons?.[0];
        if (F) {
          lessons.push(F);
          ssmlParts.push(F.ssml);
          anyDegradedLesson = true;
        }
      }
      if (i + 1 < outline.length) await new Promise(r => setTimeout(r, 150));
    } catch {
      const title = outline[i]?.title || `Lesson ${i + 1}`;
      const kp = Array.isArray(outline[i]?.keyPoints) ? outline[i].keyPoints.slice(0, 4) : [];
      const fallback = {
        id: `L${i + 1}`,
        title,
        goals: kp,
        ssml: `<speak version="1.0" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts"><voice name="${voiceName}"><prosody rate="${paceFor(preset.key).ratePct}" pitch="+0st"><p><bookmark mark="L${i + 1}.S1"/>${title}</p><p><bookmark mark="L${i + 1}.S2"/>We’ll revisit this in the next pass.</p></prosody></voice></speak>`,
        estSeconds: Math.round((preset.estAudioMinSec + preset.estAudioMaxSec) / 2),
        markdown: '',
        formulas: [],
        tables: [],
      };
      lessons.push(fallback);
      ssmlParts.push(fallback.ssml);
      anyDegradedLesson = true;
    }
  }

  // Build ONE <speak> wrapper for the whole course package
  const pace = paceFor(preset.key);
  const bodies = ssmlParts.map((s, i) => {
    const body = innerProsody(s);
    return i === 0 ? body : `<p><break time="${pace.sectionBreakMs}ms"/></p>\n${body}`;
  });
  const joinedSsml = `
<speak version="1.0" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts">
  <voice name="${voiceName}">
    <prosody rate="${pace.ratePct}" pitch="+0st">
${bodies.join('\n')}
    </prosody>
  </voice>
</speak>`.trim();

  // Quiz
  const quizResp = await generateQuizService({
    courseId,
    outline,
    numQuestions: numQuestions ?? (outline.length * preset.quizPerLesson),
    courseSize,
    programTrack,
    quizType: derivedQuizType,
  });
   const quiz = quizResp.data?.quiz
  || {
      quizType: derivedQuizType,
      questions: makeFallbackQuiz(
        courseTitle,
        outline,
        Number.isFinite(Number(numQuestions)) && Number(numQuestions) > 0
          ? Number(numQuestions)
          : Math.max(1, outline.length * (await resolveCourseSize({ courseId, bodyCourseSize: courseSize, programTrack })).quizPerLesson),
        derivedQuizType
      )
    };

      // --- Ensure quiz timer is set (fair timer fallback) ---
      if (!Number.isFinite(Number(quiz.timerSec))) {
        quiz.timerSec = fairTimerSec({
        count: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
        quizType: quiz.quizType || derivedQuizType,
        preset, // pass the object (has .key)
      });
      }

      // (optional) expose display format HH:MM:SS for clients
      const hh = String(Math.floor(quiz.timerSec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((quiz.timerSec % 3600) / 60)).padStart(2, '0');
      const ss = String(quiz.timerSec % 60).padStart(2, '0');
      quiz.timerHHMMSS = `${hh}:${mm}:${ss}`;

  try {
  const finalType =
   (quiz && (quiz.quizType === 'short' || quiz.quizType === 'mcq'))
     ? quiz.quizType
     : derivedQuizType;
  quiz.quizType = finalType;
  if (Array.isArray(quiz.questions)) {
    quiz.questions = quiz.questions.map((q) => ({ ...q, type: finalType }));
  }
} catch (e) {
  console.warn('[api:course-package] finalize quiz type failed', e?.message || e);
}


  const anyDegraded = [outlineResp.status, quizResp.status].some((s) => s && s !== 200) || anyDegradedLesson;

  dlog('package', 'done', {
    outlineLen: outline?.length || 0,
    lessons: lessons.length,
    quizQ: quiz?.questions?.length || 0,
    degraded: Boolean(anyDegraded),
  });

  return { status: anyDegraded ? 206 : 200, data: { outline, lessons, joinedSsml, quiz, notice: anyDegraded ? fallbackNotice('degraded_generation') : undefined }, headers: {} };
}