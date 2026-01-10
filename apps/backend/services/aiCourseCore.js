// apps/backend/services/aiCourseCore.js
import 'dotenv/config';
import crypto from 'crypto';
import OpenAI from 'openai';
import pool from '../config/db.js';
import {
  createRedis,
  ensureRedisConnected,
} from '../cronJobs/redisConnection.js';

/* ─────────────────────────────────────────────────────────
 * Logging helpers
 * ───────────────────────────────────────────────────────── */
export const ENABLE_LESSON_IMAGES =
  String(process.env.ENABLE_LESSON_IMAGES || '1').trim() !== '0';

export const DEBUG_AI = String(process.env.DEBUG_AI || '').trim() === '1';
export const LOG_NS = 'aiSvc';
export function log(level, scope, msg, data) {
  const fn = (console[level] || console.log).bind(console);
  if (data !== undefined) fn(`[${LOG_NS}:${scope}] ${msg}`, data);
  else fn(`[${LOG_NS}:${scope}] ${msg}`);
}
export const dlog = (scope, msg, data) => {
  if (DEBUG_AI) log('log', scope, msg, data);
};

export function fairTimerSec({ count, quizType, preset }) {
  const presetKey =
    typeof preset === 'string' ? preset : preset?.key || 'standard';

  const MCQ_PER_Q = Number(process.env.QUIZ_SECONDS_PER_MCQ || 45);
  const SHORT_PER_Q = Number(process.env.QUIZ_SECONDS_PER_SHORT || 75);
  const READ_BUFFER = Number(process.env.QUIZ_READ_BUFFER_SEC || 20);
  const MIN_SEC = Number(process.env.QUIZ_TIMER_MIN_SEC || 120);
  const MAX_SEC = Number(process.env.QUIZ_TIMER_MAX_SEC || 3600);

  const perQ = quizType === 'short' ? SHORT_PER_Q : MCQ_PER_Q;

  const sizeMultiplier =
    presetKey === 'mini'
      ? 0.95
      : presetKey === 'standard'
        ? 1.0
        : presetKey === 'extended'
          ? 1.05
          : presetKey === 'deep_dive'
            ? 1.1
            : presetKey === 'bootcamp'
              ? 1.15
              : 1.0;

  const raw = Math.round(count * perQ * sizeMultiplier + READ_BUFFER);
  return Math.max(MIN_SEC, Math.min(MAX_SEC, raw));
}

/* ─────────────────────────────────────────────────────────
 * OpenAI + timeouts
 * ───────────────────────────────────────────────────────── */
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const OPENAI_REQUEST_TIMEOUT_MS = Number(
  process.env.OPENAI_REQUEST_TIMEOUT_MS || 60000,
);

/* ─────────────────────────────────────────────────────────
 * Redis (singleton) + JSON cache helpers
 * ───────────────────────────────────────────────────────── */
const redis = createRedis();
await ensureRedisConnected(redis)
  .then(() => dlog('redis', 'connected'))
  .catch(() => {
    console.warn('[redis] not connected; caching disabled for this process');
  });

export const REDIS_TTL = {
  topCourses: 60 * 5, // 5 min
  outline: 60 * 60 * 24, // 24 h
  ssml: 60 * 60 * 24, // 24 h
  quiz: 60 * 60 * 24, // 24 h
};

export function sha1(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return crypto.createHash('sha1').update(s).digest('hex');
}

export async function cacheGetJSON(key) {
  if (!redis) return null;
  try {
    const txt = await redis.get(key);
    const hit = Boolean(txt);
    dlog('cache', `GET ${hit ? 'HIT' : 'MISS'} ${key}`);
    return txt ? JSON.parse(txt) : null;
  } catch (e) {
    console.warn('[redis] get error', e?.message);
    return null;
  }
}

export async function cacheSetJSON(key, value, ttlSec) {
  if (!redis) return false;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
    dlog('cache', `SET ok ${key}`, { ttlSec });
    return true;
  } catch (e) {
    console.warn('[redis] set error', e?.message);
    return false;
  }
}

export async function cacheDeleteByPattern(
  pattern,
  { batch = 1000, useUnlink = true } = {},
) {
  if (!redis) {
    console.warn('[redis] delete skipped (no client)');
    return 0;
  }

  let cursor = '0';
  let removed = 0;

  const doBulk = async (keys) => {
    if (!keys.length) return 0;
    const hasUnlink = useUnlink && typeof redis.unlink === 'function';
    let removed = 0;
    const CHUNK = 500;
    for (let i = 0; i < keys.length; i += CHUNK) {
      const slice = keys.slice(i, i + CHUNK);
      try {
        const n = hasUnlink
          ? await redis.unlink(...slice)
          : await redis.del(...slice);
        removed += Number(n) || 0;
      } catch {
        const pipe = redis.multi();
       for (const k of slice) {
        if (hasUnlink) pipe.unlink(k);
        else pipe.del(k);
      }

        const res = await pipe.exec();
        if (Array.isArray(res))
          removed += res.reduce(
            (a, r) =>
              a + (Array.isArray(r) ? Number(r[1]) || 0 : Number(r) || 0),
            0,
          );
      }
    }
    return removed;
  };

  do {
    const scanRes = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      String(batch),
    );
    const nextCursor = Array.isArray(scanRes) ? scanRes[0] : '0';
    const keys = Array.isArray(scanRes) ? scanRes[1] : [];
    if (keys && keys.length) removed += await doBulk(keys);
    cursor = nextCursor;
  } while (cursor !== '0');

  dlog('cache', `DELETE pattern="${pattern}" removed=${removed}`);
  return removed;
}

export async function cacheBustCourse(courseId) {
  const total =
    // outline keys are still ai:outline:${courseId}...
    (await cacheDeleteByPattern(`ai:outline:${courseId}*`)) +

    // NEW ssml shape: ai:ssml:<rev>:lessons:${courseId}:...
    (await cacheDeleteByPattern(`ai:ssml:*:lessons:${courseId}:*`)) +
    // (optional) delete any legacy ssml keys too
    (await cacheDeleteByPattern(`ai:ssml:${courseId}*`)) +

    // NEW quiz shape: ai:quiz:<rev>:${courseId}:...
    (await cacheDeleteByPattern(`ai:quiz:*:${courseId}:*`)) +
    // (optional) delete any legacy quiz keys too
    (await cacheDeleteByPattern(`ai:quiz:${courseId}*`));
  dlog('cache', `cacheBustCourse(${courseId}) -> ${total} keys removed`);
  return total;
}

/* ─────────────────────────────────────────────────────────
 * Concurrency gate (named, per-gate limits; backward compatible)
 * ───────────────────────────────────────────────────────── */
const DEFAULT_MAX_INFLIGHT = Number(process.env.AI_MAX_INFLIGHT || 4);
/**
 * Internal state: Map<gateName, { inflight: number, limit: number }>
 */
const gateState = new Map();

/**
 * Get/create a gate record with a specific limit.
 */
function getGateRecord(name, limit) {
  const key = String(name || 'global');
  if (!gateState.has(key)) {
    gateState.set(key, {
      inflight: 0,
      limit: Math.max(1, Number(limit || DEFAULT_MAX_INFLIGHT)),
    });
  } else if (limit && Number(limit) > 0) {
    // Always honor the latest limit passed in
    gateState.get(key).limit = Number(limit);
  }
  return gateState.get(key);
}

/**
 * Backward-compatible API:
 *  - withGate(fn)
 *  - withGate('name', fn)
 *  - withGate('name', limit, fn)
 */
export async function withGate(a, b, c) {
  let name, limit, fn;

  if (typeof a === 'function') {
    // withGate(fn)
    name = 'global';
    limit = DEFAULT_MAX_INFLIGHT;
    fn = a;
  } else if (typeof b === 'function') {
    // withGate(name, fn)
    name = a || 'global';
    limit = DEFAULT_MAX_INFLIGHT;
    fn = b;
  } else {
    // withGate(name, limit, fn)
    name = a || 'global';
    limit = Number(b) || DEFAULT_MAX_INFLIGHT;
    fn = c;
  }

  if (typeof fn !== 'function') {
    throw new Error('withGate requires a function as the last argument');
  }

  const gate = getGateRecord(name, limit);
  if (gate.inflight >= gate.limit) {
    dlog(
      'gate',
      `reject "${name}": inflight=${gate.inflight}, limit=${gate.limit}`,
    );
    const e = new Error('Server busy');
    e._serverBusy = true;
    e._gate = name;
    throw e;
  }

  gate.inflight++;
  dlog('gate', `enter "${name}": inflight=${gate.inflight}/${gate.limit}`);
  try {
    return await fn();
  } finally {
    gate.inflight = Math.max(0, gate.inflight - 1);
    dlog('gate', `exit  "${name}": inflight=${gate.inflight}/${gate.limit}`);
  }
}

/* ─────────────────────────────────────────────────────────
 * Breaker (quota/429 backoff)
 * ───────────────────────────────────────────────────────── */
let quotaDownUntil = 0;
export function breakerActive() {
  return Date.now() < quotaDownUntil;
}
export function tripBreaker(minutes = 10) {
  quotaDownUntil = Date.now() + minutes * 60 * 1000;
  console.warn(`[${LOG_NS}:breaker] tripped for ~${minutes} minutes`);
}
export function fallbackNotice(reason = 'insufficient_quota') {
  return { degraded: true, reason };
}

/* ─────────────────────────────────────────────────────────
 * Error classification + timeout wrapper
 * ───────────────────────────────────────────────────────── */
export function classifyOpenAIError(err) {
  const status =
    err?.status ||
    err?.response?.status ||
    (typeof err?.code === 'number' ? err.code : undefined);

  const headers = err?.response?.headers || err?.headers || {};
  const retryAfter =
    Number(headers['retry-after']) ||
    Number(headers['Retry-After']) ||
    undefined;

  const body = err?.body || err?.response?.data || err?.error || {};
  const bodyCode = body?.code || body?.error?.code || err?.code || '';
  const msg = String(
    err?.message || body?.message || body?.error?.message || '',
  ).toLowerCase();

  if (
    err?._isTimeoutAbort ||
    msg.includes('timeout') ||
    msg.includes('aborted')
  ) {
    return {
      kind: 'timeout',
      status: status || 503,
      retryAfterSec: retryAfter || 5,
      message: 'timeout',
    };
  }
  if (
    msg.includes('fetch failed') ||
    msg.includes('socket') ||
    msg.includes('econnreset') ||
    msg.includes('network')
  ) {
    return {
      kind: 'network',
      status: status || 502,
      retryAfterSec: retryAfter || 10,
      message: 'network',
    };
  }
  if (
    status === 401 ||
    bodyCode === 'invalid_api_key' ||
    msg.includes('invalid api key')
  ) {
    return {
      kind: 'auth',
      status: 401,
      retryAfterSec: undefined,
      message: 'invalid_api_key',
    };
  }
  if (
    status === 402 ||
    bodyCode === 'insufficient_quota' ||
    msg.includes('insufficient quota') ||
    msg.includes('payment required') ||
    msg.includes('billing hard limit')
  ) {
    return {
      kind: 'quota',
      status: 402,
      retryAfterSec: retryAfter || 600,
      message: 'insufficient_quota',
    };
  }
  if (status === 429 || msg.includes('rate limit')) {
    return {
      kind: 'rate_limit',
      status: 429,
      retryAfterSec: retryAfter || 20,
      message: 'rate_limited',
    };
  }
  if (status === 400) {
    return {
      kind: 'bad_request',
      status: 400,
      retryAfterSec: undefined,
      message: 'bad_request',
    };
  }
  return {
    kind: 'unknown',
    status: status || 500,
    retryAfterSec: retryAfter,
    message: 'unknown',
  };
}

export function isAbortError(e) {
  return (
    e?.name === 'AbortError' ||
    /aborted|abort|timeout/i.test(String(e?.message || ''))
  );
}

export async function withTimeout(promiseFactory, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await promiseFactory(ac.signal);
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    if (isAbortError(e)) e._isTimeoutAbort = true;
    throw e;
  }
}

/* ─────────────────────────────────────────────────────────
 * SIZE presets (Mini → Bootcamp) + helpers
 * ───────────────────────────────────────────────────────── */
// --- helper so "required" always matches "properties"
const reqKeys = (props) => Object.keys(props);

// --- Shared item shapes

// Variables are an array of { symbol, meaning } to avoid `additionalProperties`
const formulaVarEntry = {
  type: 'object',
  additionalProperties: false,
  properties: {
    symbol: { type: 'string', minLength: 1 },
    meaning: { type: 'string', minLength: 1 },
  },
  required: ['symbol', 'meaning'],
};

const formulaItemProps = {
  id: { type: 'string', minLength: 1 },
  title: { type: 'string', minLength: 1 },
  latex: { type: 'string', minLength: 1 },
  speakAs: {
    type: 'string',
    enum: ['math', 'spell-out', 'characters', 'none'],
  },
  variables: { type: 'array', items: formulaVarEntry, minItems: 0 },
  announceAtSentence: { type: 'integer', minimum: 1 },
};

const formulaItem = {
  type: 'object',
  additionalProperties: false,
  properties: formulaItemProps,
  required: reqKeys(formulaItemProps),
};

const tableItemProps = {
  id: { type: 'string', minLength: 1 },
  title: { type: 'string', minLength: 1 },
  caption: { type: 'string' },
  columns: { type: 'array', items: { type: 'string' }, minItems: 1 },
  rows: {
    type: 'array',
    minItems: 1,
    items: {
      type: 'array',
      items: {
        anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      },
    },
  },

  announceAtSentence: { type: 'integer', minimum: 1 },
};

const tableItem = {
  type: 'object',
  additionalProperties: false,
  properties: tableItemProps,
  required: reqKeys(tableItemProps),
};
/* ─────────────────────────────────────────────────────────
 * NEW: Image & Code Snippet item schemas
 * ───────────────────────────────────────────────────────── */
const imageItemProps = {
  id: { type: 'string', minLength: 1 },
  title: { type: 'string', minLength: 1 }, // add minLength
  alt: { type: 'string', minLength: 1 }, // add minLength
  url: { type: 'string' }, // may be https:// or data: URLs
  caption: { type: 'string' },
  announceAtSentence: { type: 'integer', minimum: 1 },
};
const imageItem = {
  type: 'object',
  additionalProperties: false,
  properties: imageItemProps,
  required: reqKeys(imageItemProps),
};

const codeItemProps = {
  id: { type: 'string', minLength: 1 },
  title: { type: 'string' },
  language: {
    type: 'string',
    enum: [
      'javascript',
      'typescript',
      'ts',
      'python',
      'java',
      'csharp',
      'c#',
      'cpp',
      'c++',
      'go',
      'rust',
      'php',
      'ruby',
      'kotlin',
      'swift',
      'sql',
      'bash',
      'shell',
      'powershell',
      'html',
      'css',
      'json',
    ],
  },

  code: { type: 'string', minLength: 1 },
  explanation: { type: 'string' },
  announceAtSentence: { type: 'integer', minimum: 1 },
};
const codeItem = {
  type: 'object',
  additionalProperties: false,
  properties: codeItemProps,
  required: reqKeys(codeItemProps),
};

/* NEW: Chart/Graph item schema (pie, bar, hist, etc.) */
const chartCommon = {
  id: { type: 'string', minLength: 1 },
  title: { type: 'string', minLength: 1 },
  kind: {
    type: 'string',
    enum: [
      'bar',
      'line',
      'pie',
      'histogram',
      'scatter',
      'box',
      'heatmap',
      'other',
    ],
  },
  alt: { type: 'string' },
  caption: { type: 'string' },
  announceAtSentence: { type: 'integer', minimum: 1 },
};

const chartItemPropsAll = {
  ...chartCommon,
  // Required-by-schema, but nullable so only one needs real content
  url: { type: ['string', 'null'] },
  svg: { type: ['string', 'null'] },
};

const chartItem = {
  type: 'object',
  additionalProperties: false,
  properties: chartItemPropsAll,
  // IMPORTANT: strict mode wants every key listed here
  required: Object.keys(chartItemPropsAll),
};

export const LESSON_PACK_SCHEMA = {
  name: 'LessonPack',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      lessons: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            goals: {
              type: 'array',
              minItems: 1,
              maxItems: 6,
              items: { type: 'string' },
            },
            estSeconds: { type: 'integer', minimum: 30, maximum: 1800 },
            ssml: { type: 'string' },
            markdown: { type: 'string' },
            formulas: { type: 'array', items: formulaItem, default: [] },
            tables: { type: 'array', items: tableItem, default: [] },
            images: { type: 'array', items: imageItem, default: [] },
            snippets: { type: 'array', items: codeItem, default: [] },
            charts: { type: 'array', items: chartItem, default: [] },
          },
          required: [
            'id',
            'title',
            'goals',
            'estSeconds',
            'ssml',
            'markdown',
            'formulas',
            'tables',
            'images',
            'snippets',
            'charts',
          ],
        },
      },
    },
    required: ['lessons'],
  },
};

/* ─────────────────────────────────────────────────────────
 * UPDATED QUIZ SCHEMA: supports MCQ and Short Answer
 * ───────────────────────────────────────────────────────── */
const mcqQuestion = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['mcq'] },
    prompt: { type: 'string', minLength: 1 },
    display: { type: 'string', default: '' },
    choices: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'string' },
    },
    answerIndex: { type: 'integer', minimum: 0, maximum: 3 },
    explanation: { type: 'string', default: '' },
  },
  required: [
    'id',
    'type',
    'prompt',
    'display',
    'choices',
    'answerIndex',
    'explanation',
  ],
};

const shortQuestion = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['short'] },
    prompt: { type: 'string', minLength: 1 },
    display: { type: 'string', default: '' },
    answer: { type: 'string', minLength: 1 },
    accept: { type: 'array', items: { type: 'string' }, default: [] },
    regex: { type: 'string', default: '' },
    explanation: { type: 'string', default: '' },
  },
  required: [
    'id',
    'type',
    'prompt',
    'display',
    'answer',
    'accept',
    'regex',
    'explanation',
  ],
};

export const QUIZ_SCHEMA_MCQ = {
  name: 'QuizPackMCQ',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      quizType: { type: 'string', enum: ['mcq'] },
      questions: {
        type: 'array',
        minItems: 1,
        items: mcqQuestion,
      },
      timerSec: { type: 'integer', minimum: 30 },
    },
     required: ['quizType', 'questions', 'timerSec'],
  },
};

export const QUIZ_SCHEMA_SHORT = {
  name: 'QuizPackShort',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      quizType: { type: 'string', enum: ['short'] },
      questions: {
        type: 'array',
        minItems: 1,
        items: shortQuestion,
      },
      timerSec: { type: 'integer', minimum: 30 },
    },
     required: ['quizType', 'questions', 'timerSec'],
  },
};

// NEW: force well-formed outline JSON
export const OUTLINE_SCHEMA = {
  name: 'OutlinePack',
  strict: false,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      outline: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            keyPoints: {
              type: 'array',
              minItems: 2,
              maxItems: 5,
              items: { type: 'string' },
            },
          },
          required: ['id', 'title', 'keyPoints'],
        },
      },
    },
    required: ['outline'],
  },
};

export const SIZE_PRESETS = {
  mini: {
    key: 'mini',
    label: 'Mini',
    units: 2,
    lessonsPerUnit: 3,
    wordsMin: 450,
    wordsMax: 550,
    quizPerLesson: 4,
    estAudioMinSec: 180,
    estAudioMaxSec: 240,
    ttsTargetMs: 210000,
    para: [6, 8],
  },
  standard: {
    key: 'standard',
    label: 'Standard',
    units: 4,
    lessonsPerUnit: 4,
    wordsMin: 650,
    wordsMax: 800,
    quizPerLesson: 5,
    estAudioMinSec: 300,
    estAudioMaxSec: 420,
    ttsTargetMs: 360000,
    para: [7, 10],
  },
  extended: {
    key: 'extended',
    label: 'Extended',
    units: 6,
    lessonsPerUnit: 4,
    wordsMin: 800,
    wordsMax: 900,
    quizPerLesson: 6,
    estAudioMinSec: 360,
    estAudioMaxSec: 480,
    ttsTargetMs: 420000,
    para: [9, 12],
  },
  deep_dive: {
    key: 'deep_dive',
    label: 'Deep Dive',
    units: 8,
    lessonsPerUnit: 4,
    wordsMin: 900,
    wordsMax: 1100,
    quizPerLesson: 7,
    estAudioMinSec: 480,
    estAudioMaxSec: 600,
    ttsTargetMs: 540000,
    para: [11, 14],
  },
  bootcamp: {
    key: 'bootcamp',
    label: 'Bootcamp',
    units: 10,
    lessonsPerUnit: 5,
    wordsMin: 1000,
    wordsMax: 1200,
    quizPerLesson: 7,
    estAudioMinSec: 480,
    estAudioMaxSec: 600,
    ttsTargetMs: 540000,
    para: [12, 16],
  },
};

export const PROGRAM_TRACKS = {
  module: { key: 'module', label: 'Module', lessons: 8, estTotalMinutes: 90 },
  certificate: {
    key: 'certificate',
    label: 'Certificate',
    lessons: 20,
    estTotalMinutes: 300,
  },
  diploma: {
    key: 'diploma',
    label: 'Diploma',
    lessons: 60,
    estTotalMinutes: 900,
  },
  degree: {
    key: 'degree',
    label: 'Degree',
    lessons: 120,
    estTotalMinutes: 1800,
  },
};

export function lessonsForTrack(trackKey) {
  const k = (trackKey || '').toLowerCase();
  return PROGRAM_TRACKS[k]?.lessons || undefined;
}

const PACE_PRESETS = {
  mini: { ratePct: '-5%', paraBreakMs: 450, sectionBreakMs: 2000 },
  standard: { ratePct: '-7%', paraBreakMs: 500, sectionBreakMs: 2500 },
  extended: { ratePct: '-8%', paraBreakMs: 550, sectionBreakMs: 2750 },
  deep_dive: { ratePct: '-10%', paraBreakMs: 600, sectionBreakMs: 3000 },
  bootcamp: { ratePct: '-12%', paraBreakMs: 650, sectionBreakMs: 3200 },
};
export function paceFor(sizeKey) {
  return PACE_PRESETS[sizeKey] || PACE_PRESETS.standard;
}

export function totalLessonsOf(preset) {
  return preset.units * preset.lessonsPerUnit;
}
export function defaultTargetMinutesOf(preset) {
  const avgSec = (preset.estAudioMinSec + preset.estAudioMaxSec) / 2;
  return Math.round((totalLessonsOf(preset) * avgSec) / 60);
}

export async function resolveCourseSize({
  courseId,
  bodyCourseSize,
  programTrack,
}) {
  // 1) Explicit body wins
  if (bodyCourseSize && SIZE_PRESETS[bodyCourseSize])
    return SIZE_PRESETS[bodyCourseSize];

  // 2) DB value
  if (courseId) {
    const r = await pool.query(
      `SELECT course_size FROM courses WHERE id = $1`,
      [courseId],
    );
    const key = r.rows?.[0]?.course_size;
    if (key && SIZE_PRESETS[key]) return SIZE_PRESETS[key];
  }

  // 3) Program track → size mapping
  const pt = String(programTrack || '').toLowerCase();
  const map = {
    module: 'mini',
    certificate: 'standard',
    diploma: 'deep_dive',
    degree: 'bootcamp',
  };
  if (map[pt] && SIZE_PRESETS[map[pt]]) return SIZE_PRESETS[map[pt]];

  // 4) Final fallback — prefer ‘mini’ for snappier UX
  return SIZE_PRESETS.mini;
}

/* ─────────────────────────────────────────────────────────
 * SSML sanitizer
 * ───────────────────────────────────────────────────────── */
export function sanitizeSsml(
  ssml,
  lessonId = 'L1',
  voiceFallback = 'en-US-JennyNeural',
  opts = { ratePct: '-10%', breakMs: 500, sentencesPerPara: 2, dedupe: false },
) {
  if (!ssml) return ssml;

  const TRANSITION_RE =
    /^(?:First,|Next,|Now,|For example,|However,|Then,|Finally,|In short,)\s*/i;
  const normQuotes = (t) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const keepOuterP = (t) =>
    t
      .replace(/<\/?speak[^>]*>/gi, '')
      .replace(/<\/?voice[^>]*>/gi, '')
      .replace(/<\/?prosody[^>]*>/gi, '')
      .trim();

  // Friendly label map at the *start* of a sentence (after the bookmark)
  const relabel = (s) =>
    s
      .replace(/^\s*Hook\s*:\s*/i, 'Try this: ')
      .replace(/^\s*Core\s+concept\s*:\s*/i, 'Key idea: ')
      .replace(/^\s*Micro-?\s*check\s*:\s*/i, 'Quick check: ')
      .replace(/^\s*Recap\s*:\s*/i, "Let's recap: ")
      .replace(/^\s*Goals?\s*:\s*/i, 'Today you will: ');

  // Split while preserving explicit <p> boundaries when present
  function splitIntoSentencesPreservingP(raw) {
    const blocks = raw
      .replace(/<p[^>]*>/gi, '\n<P>\n')
      .replace(/<\/p>/gi, '\n</P>\n')
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const sentences = [];
    let inP = false;
    for (const b of blocks) {
      if (b === '<P>') {
        inP = true;
        continue;
      }
      if (b === '</P>') {
        inP = false;
        continue;
      }
      const parts = b
        // also split before <break .../> so trailing breaks don't stick to sentences
        .split(/(?=<bookmark\s+mark=|<break\b)/i)
        .flatMap((chunk) => chunk.trim().split(/(?<=[.?!…]["')\]]?)\s+/))
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of parts) {
        const ended = finalizeSentencePunctuation(s);
        sentences.push({ s: ended, hardP: inP }); // mark that this came from inside a <p>
      }
    }
    return sentences;
  }

  function ensureIntroComma(s) {
    // Comma after common introductory phrases if missing.
    // Only when at very start and next token looks like a clause (a word).
    const leadIns = [
      'however',
      'therefore',
      'moreover',
      'meanwhile',
      'furthermore',
      'nevertheless',
      'nonetheless',
      'consequently',
      'as a result',
      'as a consequence',
      'for example',
      'for instance',
      'in contrast',
      'in addition',
      'in fact',
      'in other words',
      'in summary',
      'in conclusion',
      'on the other hand',
      'by contrast',
    ];
    const lower = s.toLowerCase().trim();
    for (const li of leadIns) {
      if (lower.startsWith(li + ' ') && !/^[^,]+,/.test(lower)) {
        // insert comma after the lead-in phrase
        const re = new RegExp(`^(${li})\\s+`, 'i');
        return s.replace(re, (m, g1) => `${g1}, `);
      }
    }
    return s;
  }

  // OPTIONAL: controlled by env flag SSML_OXFORD_COMMA=1
  function ensureOxfordComma(s) {
    if (process.env.SSML_OXFORD_COMMA !== '1') return s;
    // Simple, conservative: X, Y and Z  -> X, Y, and Z
    // Avoid touching when already " , and " exists or only two items present.
    return s.replace(
      /(\b[^,]+,\s+[^,]+)\s+and\s+([^,]+)([.?!…)"'\]]?)/g,
      (_, a, b, end) => `${a}, and ${b}${end || ''}`,
    );
  }
  function finalizeSentencePunctuation(s) {
    // 1) tidy spaces like " ." -> "."
    let out = s.replace(/\s+([.,!?;:])/g, '$1');

    // 2) peel off trailing tags/quotes/brackets/space; we’ll re-attach later
    const suffixMatch = out.match(/(?:\s|["')\]]|<[^>]+>)+$/);
    const suffix = suffixMatch ? suffixMatch[0] : '';
    let core = suffix ? out.slice(0, -suffix.length) : out;

    // 3) normalize trailing runs of dots (model sometimes emits "e.g.." or "....")
    core = core.replace(/\.{3,}$/, '…'); // "..." (or more) → ellipsis char
    core = core.replace(/(^|[^.])\.\.$/, '$1.'); // collapse final ".." → "."

    // 4) if core ends with punctuation, we're done; else add "."
    if (/[.?!…]$/.test(core)) return core + suffix;
    if (core === '') return '.' + suffix; // degenerate: all suffix, no text
    return core + '.' + suffix; // insert period before suffix (tags/closers)
  }

  // Speak parentheses explicitly for simple function-call patterns like f(x) → "f x brackets"
  function sayBracketsToOf(s) {
    return s.replace(
      /(^|[^A-Za-z])([A-Za-z])\s*\(\s*([A-Za-z0-9+\-*/^ ,]{1,40})\s*\)/g,
      (_, pre, fn, args) => {
        const parts = args.split(/\s*,\s*/);
        const tidy =
          parts.length === 2 ? parts.join(' and ') : parts.join(' comma ');

        return `${pre}${fn} of ${tidy}`;
      },
    );
  }

  function ensureBookmark(sentence) {
    if (/^<bookmark\s+mark=/i.test(sentence)) return sentence;
    return `<bookmark mark="${lessonId}.S0"/> ${sentence}`;
  }

  // 1) Strip outer wrappers but keep <p> markers, normalize quotes
  const inner = normQuotes(keepOuterP(ssml));

  // 2) Into sentences
  let pieces = splitIntoSentencesPreservingP(inner).map(({ s, hardP }) => {
    const out = ensureBookmark(s);
    const bm = out.match(/^<bookmark[^>]*\/>/i)?.[0] || '';
    const afterBm = out.replace(/^<bookmark[^>]*\/>\s*/i, '');
    const cleaned = relabel(afterBm.replace(TRANSITION_RE, ''))
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const spoken = ensureOxfordComma(
      ensureIntroComma(sayBracketsToOf(cleaned)),
    );
    return { s: `${bm} ${spoken}`.trim(), hardP };
  });
  // 3) Optional *gentle* dedupe (exact duplicates only)
  if (opts?.dedupe) {
    const seen = new Set();
    pieces = pieces.filter(({ s }) => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // 4) Group into paragraphs: prefer original <p> grouping; else fall back to N sentences per para
  const breakMs = Number(opts?.breakMs ?? 300);
  const perPara = Math.max(
    1,
    Math.min(
      3,
      Number.isFinite(Number(opts?.sentencesPerPara))
        ? Number(opts?.sentencesPerPara)
        : 2,
    ),
  );

  const paras = [];
  let buffer = [];
  let counter = 0;

  const flush = () => {
    if (!buffer.length) return;
    // Keep ALL per-sentence <bookmark/> anchors inside the paragraph
    const sentences = buffer.map(({ s }) => s).join(' ');
    paras.push(`<p>${sentences}</p>\n<break time="${breakMs}ms"/>`);
    buffer = [];
  };

  for (const piece of pieces) {
    buffer.push(piece);
    counter++;
    if (piece.hardP || counter % perPara === 0) flush();
  }
  flush();

  const voiceNameMatch = ssml.match(/<voice[^>]*name="([^"]+)"[^>]*>/i);
  const voiceName = voiceNameMatch?.[1] || voiceFallback || 'en-US-JennyNeural';

  const body = paras.join('\n      ');
  return `
<speak version="1.0" xml:lang="en-US" xmlns:mstts="http://www.w3.org/2001/mstts">
  <voice name="${voiceName}">
    <prosody rate="${opts?.ratePct ?? '0%'}" pitch="+0st">
      ${body}
    </prosody>
  </voice>
</speak>`.trim();
}

/* ─────────────────────────────────────────────────────────
 * OpenAI JSON helper (supports JSON Schema)
 * ───────────────────────────────────────────────────────── */
export async function aiJson({
  system,
  user,
  temperature = 0.2,
  tries = 3,
  maxTokens,
  schema,
}) {
  let lastErr;
  let localMax = maxTokens;

  for (let i = 0; i < tries; i++) {
    const t0 = Date.now();

    // Track finish/size for logging outside the request
    let finishReason = '';
    let charLen = 0;

    try {
      dlog(
        'openai',
        `request try=${i + 1} temp=${temperature} maxTokens=${localMax ?? 'default'} schema=${!!schema}`,
      );

      const txt = await withTimeout(async (signal) => {
        let responseFormat;
        if (schema && typeof schema === 'object' && schema.name && schema.schema) {
          responseFormat = {
            type: 'json_schema',
            json_schema: {
              name: schema.name,
              schema: schema.schema,
              strict: schema.strict !== undefined ? !!schema.strict : true,
            },
          };
        } else if (schema) {
          console.warn(
            `[${LOG_NS}:openai] schema provided but missing {name, schema}; falling back to json_object`,
          );
          responseFormat = { type: 'json_object' };
        } else {
          responseFormat = { type: 'json_object' };
        }

        const r = await openai.chat.completions.create(
          {
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            temperature,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: responseFormat,
            ...(localMax ? { max_tokens: localMax } : {}),
          },
          { signal },
        );

        const choice = r.choices?.[0] || {};
        finishReason = choice.finish_reason || '';
        const out = choice.message?.content || '{}';
        charLen = out.length;

        // If truncated, bump output budget for next try
        if (finishReason === 'length') {
          localMax = Math.min(Math.floor((localMax || 1200) * 1.6), 6000);
        }

        return out;
      }, OPENAI_REQUEST_TIMEOUT_MS);

      const ms = Date.now() - t0;
      dlog('openai', `response ok in ${ms}ms finish_reason=${finishReason} chars=${charLen}`);

      try {
        return JSON.parse(txt);
      } catch (e) {
        console.warn(`[${LOG_NS}:openai] JSON.parse failed`, {
          message: String(e?.message || e),
          finish_reason: finishReason,
          chars: charLen,
          snippet: String(txt || '').slice(0, 1000),
        });

        // If parse failed, also bump (often truncation even if finish_reason wasn't "length")
        localMax = Math.min(Math.floor((localMax || 1200) * 1.4), 6000);

        if (i === tries - 1) return {};
      }
    } catch (e) {
      const c = classifyOpenAIError(e);
      e.aiKind = c.kind;
      e.retryAfterSec = c.retryAfterSec;
      e.status = c.status;
      lastErr = e;

      console.warn(`[${LOG_NS}:openai] error`, {
        kind: c.kind,
        status: c.status,
        retryAfterSec: c.retryAfterSec,
        msg: e?.message,
      });

      if (
        i < tries - 1 &&
        (c.kind === 'rate_limit' || c.kind === 'network' || c.kind === 'timeout')
      ) {
        const backoffMs = Math.min(
          8000,
          Math.max(2000, (c.retryAfterSec || 1) * 1000),
        );
        dlog('openai', `retrying after ${backoffMs}ms`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      throw e;
    }
  }

  throw lastErr || new Error('OpenAI request failed');
}


/* ─────────────────────────────────────────────────────────
 * Teachability scoring + lesson signals
 * ───────────────────────────────────────────────────────── */
export const AI_POSITIVE_KEYWORDS = [
  'algebra',
  'fractions',
  'decimals',
  'statistics',
  'probability',
  'calculus',
  'linear algebra',
  'discrete math',
  'physics',
  'mechanics',
  'motion',
  'forces',
  'thermodynamics',
  'optics',
  'chemistry',
  'stoichiometry',
  'periodic table',
  'reactions',
  'equilibrium',
  'biology',
  'cells',
  'genetics',
  'evolution',
  'computer science',
  'data structures',
  'algorithms',
  'time complexity',
  'python',
  'javascript',
  'typescript',
  'react',
  'node',
  'graphql',
  'sql',
  'docker',
  'kubernetes',
  'cloud fundamentals',
  'git',
  'ml',
  'machine learning',
  'deep learning',
  'pytorch',
  'computer vision',
  'nlp',
  'rag',
  'prompt engineering',
  'grammar',
  'writing',
  'composition',
  'german a1',
  'kiswahili',
  'vocabulary',
  'time series',
  'quant',
  'forecasting',
];
export const AI_NEGATIVE_KEYWORDS = [
  'wet lab',
  'dissection',
  'welding',
  'soldering',
  'cpr',
  'first aid',
  'surgery',
  'flight',
  'driving',
  'pharmacology',
  'clinical',
  'radiology',
  'oil painting',
  'dance',
  'sculpture',
  'photography studio',
  'fine art portfolio',
  'penetration testing',
  'red team',
  'exploit development',
];
export function aiTeachabilityScore(
  title = '',
  description = '',
  syllabusJson = null,
) {
  const text = [
    title || '',
    description || '',
    Array.isArray(syllabusJson)
      ? syllabusJson
          .map((s) => [s?.topic, s?.assignment].filter(Boolean).join(' '))
          .join(' ')
      : '',
  ]
    .join(' ')
    .toLowerCase();
  let score = 0;
  for (const k of AI_POSITIVE_KEYWORDS) {
    if (text.includes(k)) score += 2;
  }
  score = Math.min(score, 30);
  for (const k of AI_NEGATIVE_KEYWORDS) {
    if (text.includes(k)) score -= 5;
  }
  if (Array.isArray(syllabusJson) && syllabusJson.length >= 3) score += 3;
  return score;
}

export const QUANT_KEYWORDS = [
  'algebra',
  'equation',
  'inequality',
  'calculus',
  'derivative',
  'integral',
  'matrix',
  'vector',
  'probability',
  'statistics',
  'regression',
  'variance',
  'standard deviation',
  'hypothesis',
  'physics',
  'forces',
  'motion',
  'kinematics',
  'energy',
  'chemistry',
  'stoichiometry',
  'mole',
  'finance',
  'interest',
  'roi',
  'rate',
  'ratio',
  'percentage',
  'time complexity',
  'big o',
];
export const TABLEY_KEYWORDS = [
  'compare',
  'comparison',
  'versus',
  'vs',
  'pros',
  'cons',
  'advantages',
  'disadvantages',
  'types',
  'categories',
  'workflow',
  'pipeline',
  'steps',
  'metrics',
  'units',
  'conversion',
  'properties',
  'timeline',
  'versions',
];

/* NEW: programming & visuals detectors */
export const CODE_KEYWORDS = [
  'python',
  'javascript',
  'typescript',
  'react',
  'node',
  'graphql',
  'sql',
  'docker',
  'kubernetes',
  'java',
  'c#',
  'csharp',
  'c++',
  'cpp',
  'go',
  'rust',
  'php',
  'ruby',
  'kotlin',
  'swift',
  'html',
  'css',
  'bash',
  'linux',
  'git',
  'algorithms',
  'data structures',
  'oop',
  'functional programming',
];
export const VISUAL_KEYWORDS = [
  'geometry',
  'diagram',
  'workflow',
  'pipeline',
  'circuit',
  'network',
  'architecture',
  'ui',
  'ux',
  'design pattern',
  'timeline',
  'map',
  'chart',
  'graph',
  'probability tree',
  'bar chart',
  'pie chart',
  'histogram',
  'scatterplot',
  'box plot',
  'heatmap',
  'distribution',
  'venn',
  'flowchart',
  'vector',
  'matrix',
  'anatomy',
];

export function inferLessonSignals(courseTitle, section) {
  const text =
    `${courseTitle} ${section?.title || ''} ${(section?.keyPoints || []).join(' ')}`.toLowerCase();
  const hasQuant = QUANT_KEYWORDS.some((k) => text.includes(k));
  const hasTabley =
    TABLEY_KEYWORDS.some((k) => text.includes(k)) ||
    (section?.keyPoints || []).length >= 3;
  const isProgramming = CODE_KEYWORDS.some((k) => text.includes(k));
  const wantsImages =
    VISUAL_KEYWORDS.some((k) => text.includes(k)) ||
    /graph|chart|diagram|flow|map|circle|triangle|vector|matrix/.test(text);

  const minFormulas = hasQuant ? 2 : 0;
  const wantTable = hasTabley;
  const minSnippets = isProgramming ? 1 : 0;

  // 🔑 respect ENABLE_LESSON_IMAGES flag
  const minImages = ENABLE_LESSON_IMAGES && wantsImages ? 1 : 0;

  return { minFormulas, wantTable, minSnippets, minImages, isProgramming };
}
