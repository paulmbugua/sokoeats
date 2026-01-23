// apps/backend/controllers/aiCourseController.js
import pool from '../config/db.js';
import { aiJson, breakerActive, tripBreaker } from '../services/aiCourseCore.js';



import {
  withGate,
  listTopCoursesService,
  generateOutlineService,
  generateLessonSSMLService,
  generateQuizService,
  generateCoursePackageService,
  // NEW: cache helpers
  cacheBustCourse,
  cacheDeleteByPattern,
} from '../services/aiCourseService.js';
import { ensureProfileIdForUser } from '../services/ensureProfile.js';
import {
  outlineSchema,
  lessonSchema,
  quizSchema,
  gradeSchema,
} from '../validators/aiCoursesValidator.js';
import {
  narrationPreflight,
  finalizeNarrationUsage,
  buildGateNotice,
  blankLessonsFromOutline,
} from '../services/narrationGate.js';
import {
  incrementLessonUsage,
  getCertificateEntitlement,
} from './_aiCourseEntitlements.js';
import { markLanguageQuizPassed } from '../services/aiLanguageService.js';


/* ─────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────── */

const DEBUG_GRADE = process.env.DEBUG_GRADE === 'true';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const normText = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokens = (s) => normText(s).split(' ').filter(Boolean);

const jaccard = (aTokens, bTokens) => {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
};

// Accept q.answer as string OR array of strings OR object-like
const getAnswerKeyStrings = (q) => {
  const raw = q?.answer;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') return [raw];
  // sometimes AI packs in {text:"...", keywords:[...]}
  if (typeof raw === 'object') {
    const out = [];
    if (raw.text) out.push(String(raw.text));
    if (Array.isArray(raw.keywords)) out.push(...raw.keywords.map(String));
    return out.filter(Boolean);
  }
  return [String(raw)];
};

// loose match for keyed short answers
const shortMatchesLoose = (userText, q) => {
  const u = normText(userText);
  if (!u) return { ok: false, sim: 0, reason: 'empty_user' };

  const keys = getAnswerKeyStrings(q).map(normText).filter(Boolean);
  if (!keys.length) return { ok: false, sim: 0, reason: 'no_key' };

  const uTok = tokens(u);

  // 1) exact normalized match
  if (keys.some((k) => k === u)) return { ok: true, sim: 1, reason: 'exact' };

  // 2) containment either way (handles long-form answers)
  if (keys.some((k) => k.length >= 6 && u.includes(k))) return { ok: true, sim: 0.95, reason: 'user_contains_key' };
  if (keys.some((k) => k.includes(u) && u.length >= 6)) return { ok: true, sim: 0.95, reason: 'key_contains_user' };

  // 3) token similarity (Jaccard) vs best key
  let best = 0;
  for (const k of keys) {
    const sim = jaccard(uTok, tokens(k));
    if (sim > best) best = sim;
  }

  // tune threshold: 0.45–0.6 works well for short answers
  const ok = best >= 0.5;
  return { ok, sim: best, reason: ok ? 'token_sim' : 'low_sim' };
};

function isUuid(v) {
  return UUID_RE.test(String(v || '').trim());
}

// Chemistry/text normalization for short answers
function normalizeChemAnswer(s = '') {
  const subMap = {
    '₀': '0',
    '₁': '1',
    '₂': '2',
    '₃': '3',
    '₄': '4',
    '₅': '5',
    '₆': '6',
    '₇': '7',
    '₈': '8',
    '₉': '9',
    '₊': '+',
    '₋': '-',
  };
  const supMap = {
    '⁰': '0',
    '¹': '1',
    '²': '2',
    '³': '3',
    '⁴': '4',
    '⁵': '5',
    '⁶': '6',
    '⁷': '7',
    '⁸': '8',
    '⁹': '9',
    '⁺': '+',
    '⁻': '-',
  };
  const uni = Array.from(String(s))
    .map((ch) => subMap[ch] ?? supMap[ch] ?? ch)
    .join('');
  return uni
    .replace(/\s+/g, '') // drop spaces
    .replace(/→/g, '->')
    .replace(/⇌/g, '<->')
    .replace(/[‐-–—]/g, '-') // hyphen variants
    .replace(/\u2212/g, '-') // minus sign
    .replace(/\u00B7/g, '.') // middle dot (hydrates)
    .toLowerCase();
}
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function softMatch(userText, key) {
  const u = norm(userText);
  const k = norm(key);
  if (!u || !k) return false;
  if (u === k) return true;
  if (u.includes(k)) return true;

  // If key is long (definitions), allow user to be slightly shorter
  if (k.length >= 25 && k.includes(u) && u.split(' ').length >= 4) return true;

  return false;
}

function shortMatches(userText, q) {
  if (!userText || !String(userText).trim()) return false;

  // regex wins if present (but don’t let it be the only path)
  if (q?.regex) {
    try {
      if (new RegExp(q.regex, 'i').test(userText)) return true;
    } catch {}
  }

  const keys = [q?.answer, ...(Array.isArray(q?.accept) ? q.accept : [])].filter(Boolean);
  return keys.some((k) => softMatch(userText, k));
}


function pickUserText(a) {
  if (!a || typeof a !== 'object') return '';
  return String(
    a.answerText ?? a.text ?? a.value ?? a.free ?? a.written ?? ''
  ).trim();
}

function questionText(q) {
  const p = String(q?.prompt ?? '').trim();
  const d = String(q?.display ?? '').trim();
  return p || d || '';
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// Very light fallback if AI is unavailable (no key, no LLM)
function heuristicShortScore(qText, userText) {
  const q = (qText || '').toLowerCase();
  const a = (userText || '').toLowerCase();
  if (!a) return { score: 0, feedback: 'No answer provided.' };

  // simple overlap heuristic
  const qWords = new Set(q.split(/\W+/).filter(w => w.length >= 4));
  const aWords = new Set(a.split(/\W+/).filter(w => w.length >= 4));
  let hit = 0;
  for (const w of qWords) if (aWords.has(w)) hit++;
  const score = qWords.size ? Math.min(1, hit / Math.max(3, qWords.size * 0.4)) : 0.2;

  return { score: clamp01(score), feedback: 'Auto-graded (fallback). Consider regrading later.' };
}


function olMeta(outline) {
  const len = Array.isArray(outline) ? outline.length : 0;
  const head = Array.isArray(outline)
    ? outline
        .slice(0, 2)
        .map((s) => s?.title || '')
        .filter(Boolean)
    : [];
  return { len, head };
}

function setHeaders(res, headers = {}) {
  for (const [k, v] of Object.entries(headers)) res.set(k, v);
}

// Treat "1", "true", true as truthy for query/body flags
function boolish(v) {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === '1' || s === 'true';
}

// SAFE program track reader with default
function getProgramTrack(req) {
  const raw =
    req.body?.programTrack ??
    req.query?.programTrack ??
    req.headers['x-program-track'];
  return String(raw || 'general');
}

// Broader timeout/abort detector (covers AbortController + proxy messages)
function isAbortLike(err) {
  const msg = String(err?.message || err?.msg || '').toLowerCase();
  return (
    err?._isTimeoutAbort === true ||
    err?.name === 'AbortError' ||
    msg.includes('abort') ||
    msg.includes('aborted') ||
    msg.includes('timeout') ||
    err?.code === 'UND_ERR_ABORTED'
  );
}

async function notesAllowed({ userId, orgId }) {
  if (orgId) return true;
  return !!userId; // any authenticated user
}

function notesPreview(markdown = '', maxChars = 400) {
  const s = String(markdown || '').trim();
  if (!s) return '';
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars).trim()}...\n\n> 🔒 Unlock full notes with Certificate.`;
}

async function gradeShortWithAI({ qText, userText }) {
  if (!qText) return { score: 0, feedback: 'Missing question text.' };
  if (!userText) return { score: 0, feedback: 'No answer provided.' };

  // If breaker active, do not call OpenAI
  if (breakerActive()) return heuristicShortScore(qText, userText);

  const schema = {
    name: 'ShortGrade',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        score: { type: 'number', minimum: 0, maximum: 1 },
        feedback: { type: 'string' },
      },
      required: ['score', 'feedback'],
    },
  };

  const system =
    'You are a fair, consistent grader. Accept paraphrases. Ignore minor grammar/spelling. Award partial credit. Be strict only if the answer is clearly wrong or irrelevant.';

  const user = `
Grade the student's short-answer response.

Question:
${qText}

Student answer:
${userText}

Return JSON only with:
- score: number from 0 to 1 (partial credit allowed)
- feedback: 1-2 short sentences (helpful, not harsh)
`.trim();

  try {
    // Use a gate so grading spikes don't overload you
    const out = await withGate('grade_short', async () =>
      aiJson({ system, user, temperature: 0.2, tries: 2, schema }),
    );

    return {
      score: clamp01(out?.score),
      feedback: String(out?.feedback ?? '').slice(0, 500),
    };
  } catch (e) {
    // If quota/rate-limit etc, trip breaker and fall back
    if (e?.aiKind === 'quota' || e?.aiKind === 'rate_limit') tripBreaker(10);
    return heuristicShortScore(qText, userText);
  }
}


/* ─────────────────────────────────────────────────────────
 * Controllers (thin): validate → gate → call service → set headers
 * ───────────────────────────────────────────────────────── */

export async function listTopCourses(req, res) {
  try {
    const { aiOnly, limit, offset, sourceKind } = req.query;

    const aiOnlyFlag = aiOnly === '1' || aiOnly === 'true';
    const lim = Math.min(Number(limit) || 50, 100);
    const off = Math.max(Number(offset) || 0, 0);

    // 👇 default: starter50 if client does not specify
    const effectiveSourceKind =
      typeof sourceKind === 'string' && sourceKind.trim()
        ? sourceKind
        : 'starter50';

    const result = await listTopCoursesService({
      aiOnly: aiOnlyFlag,
      limit: lim,
      offset: off,
      sourceKind: effectiveSourceKind,
    });

    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        res.setHeader(k, v);
      }
    }

    res.status(result.status).json(result.data);
  } catch (err) {
    console.error('[listTopCoursesController] error', err);
    res.status(500).json({ error: 'Failed to list top courses' });
  }
}

export async function generateOutline(req, res) {
  try {
    await withGate(async () => {
      // Keep program track header for visibility/debug
      const programTrack = getProgramTrack(req);
      res.set('X-Program-Track', programTrack);

      const { value, error } = outlineSchema.validate(req.body, {
        abortEarly: false,
        allowUnknown: true,
      });
      if (error) {
        console.warn(
          '[ai] outline validation failed',
          error.details?.map((d) => d.message),
        );
        return res.status(400).json({
          error: 'VALIDATION_FAILED',
          message: error.message,
          details: error.details?.map((d) => d.message) || [],
        });
      }

      let {
        courseId,
        title,
        level,
        targetMinutes,
        courseSize,
        totalLessons,
        assignmentId, // may be provided by the org flow
      } = value;

      title =
        typeof title === 'string' && title.trim() ? title.trim() : undefined;
      assignmentId =
        typeof assignmentId === 'string' && assignmentId.trim()
          ? assignmentId.trim()
          : undefined;

      console.log('[api:outline] req', {
        courseId,
        title: Boolean(title),

        level,
        targetMinutes,
        courseSize,
        totalLessons,
        assignmentId: Boolean(assignmentId),
        programTrack,
      });

      // Optional refresh hooks
      if (
        boolish(req.query.refresh) ||
        boolish(req.query.refreshCache) ||
        boolish(req.body?.refresh) ||
        boolish(req.body?.refreshCache)
      ) {
        if (courseId) await cacheBustCourse(courseId);
        if (boolish(req.query.top) || boolish(req.body?.top)) {
          await cacheDeleteByPattern('ai:topCourses:*');
        }
      }

      // 🔒 If caller didn't specify totalLessons/targetMinutes, try the org assignment's locked_config
      if (assignmentId) {
        try {
          const q = await pool.query(
            `SELECT COALESCE(locked_config, '{}'::jsonb) AS lc
         FROM org_course_assignments
        WHERE id = $1::uuid
        LIMIT 1`,
            [assignmentId],
          );
          const lc = q.rows?.[0]?.lc || {};

          // totalLessons override (already present)
          const lockedTotal = Math.max(1, Number(lc.totalLessons));
          if (
            (!totalLessons || Number(totalLessons) <= 0) &&
            Number.isFinite(lockedTotal) &&
            lockedTotal > 0
          ) {
            totalLessons = lockedTotal;
          }

          // minutes override (NEW)
          const lockedMinutes = Math.max(5, Number(lc.minutes));
          if (
            (!targetMinutes || Number(targetMinutes) <= 0) &&
            Number.isFinite(lockedMinutes) &&
            lockedMinutes > 0
          ) {
            targetMinutes = lockedMinutes;
          }
        } catch (e) {
          console.warn(
            '[api:outline] locked_config lookup failed',
            e?.message || e,
          );
        }
      }

      const { status, data, headers } = await generateOutlineService({
        courseId,
        title,
        level,
        targetMinutes,
        courseSize,
        totalLessons,
        programTrack,
      });

      setHeaders(res, headers);
      console.log('[api:outline] resp', {
        status,
        outlineLen: Array.isArray(data?.outline) ? data.outline.length : 0,
      });
      return res.status(status).json(data);
    });
  } catch (err) {
    const info = {
      name: err?.name,
      msg: err?.message || err?.msg,
      timeout: !!err?._isTimeoutAbort,
      busy: !!err?._serverBusy,
    };
    console.error('[ai] generateOutline error:', info);

    if (err?._serverBusy) {
      return res
        .status(429)
        .set('Retry-After', '1')
        .json({ msg: 'Server busy' });
    }

    if (isAbortLike(err)) {
      res.set('Retry-After', '5');
      return res
        .status(504)
        .json({ error: 'AI service timeout. Please try again.' });
    }
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('rate limit') || msg.includes('temporarily unavailable')) {
      res.set('Retry-After', '10');
      return res
        .status(503)
        .json({ error: 'AI temporarily unavailable. Please retry shortly.' });
    }
    return res.status(500).json({ error: 'Failed to generate outline' });
  }
}



export async function generateLessonSSML(req, res) {
  try {
    await withGate(async () => {
      const programTrack = getProgramTrack(req);
      res.set('X-Program-Track', programTrack);
      const { value, error } = lessonSchema.validate(req.body, {
        abortEarly: false,
        allowUnknown: true,
      });
      if (error) {
        console.warn(
          '[ai] lesson validation failed',
          error.details?.map((d) => d.message),
        );
        return res.status(400).json({
          error: 'VALIDATION_FAILED',
          message: error.message,
          details: error.details?.map((d) => d.message) || [],
        });
      }

      const {
        courseId,
        outline,
        voiceName,
        courseSize,
        start: vStart,
        count: vCount,
      } = value;
      const start = Number.isFinite(vStart) ? vStart : 0;
      const MAX_BATCH = 3;
      const count = Math.max(
        1,
        Math.min(MAX_BATCH, Number.isFinite(vCount) ? vCount : 1),
      );

      console.log('[api:lesson-ssml] req', {
        courseId,
        voiceName,
        courseSize,
        outlineLen: Array.isArray(outline) ? outline.length : 0,
        start,
        count,
        sample: Array.isArray(outline)
          ? outline.slice(0, 2).map((s) => s?.title || '')
          : [],
      });

      if (!courseId)
        return res.status(400).json({ error: 'MISSING_COURSE_ID' });
      if (!Array.isArray(outline) || !outline.length) {
        return res.status(400).json({ error: 'EMPTY_OUTLINE' });
      }

      // Optional refresh before generating
      if (
        boolish(req.query.refresh) ||
        boolish(req.query.refreshCache) ||
        boolish(req.body?.refresh) ||
        boolish(req.body?.refreshCache)
      ) {
        await cacheBustCourse(courseId);
      }

     // --- Resolve orgId from assignmentId if orgId not present ---
// --- Resolve orgId + membership role from assignmentId (if present) ---
const assignmentId =
  typeof req.body?.assignmentId === 'string' && req.body.assignmentId.trim()
    ? req.body.assignmentId.trim()
    : null;

let orgId =
  res?.locals?.assignment?.orgId ||
  req.body?.orgId ||
  req.get('x-org-id') ||
  null;

// IMPORTANT: declare OUTSIDE the if so it exists later
let orgMembershipRole = null;

if (assignmentId) {
  const mem = await pool.query(
    `SELECT a.org_id, m.role
       FROM org_course_assignments a
       JOIN org_memberships m ON m.org_id = a.org_id
      WHERE a.id = $1::uuid
        AND m.user_id = $2
      LIMIT 1`,
    [assignmentId, req.user?.id],
  );

  if (!mem.rowCount) {
    return res.status(403).json({ error: 'FORBIDDEN_ORG' });
  }

  // Fill orgId from assignment if missing
  if (!orgId) orgId = mem.rows[0].org_id;

  // Capture role hint from membership
  orgMembershipRole = mem.rows[0]?.role || null;
}

console.log('[api:lesson-ssml] org context', { orgId, assignmentId, orgMembershipRole });

// ✅ Ensure profile exists BEFORE narrationPreflight()
const userId = req.user?.id || null;
if (userId) {
  // membership role (learner/instructor/owner) OR fallback to JWT user role (student/tutor/admin)
  const effectiveRole = orgMembershipRole || req.user?.role || 'student';
  await ensureProfileIdForUser(userId, { role: effectiveRole, status: 'New' });

}


const outlineSlice = Array.isArray(outline) ? outline.slice(start, start + count) : [];

const estimateText = outlineSlice
  .map(
    (s) =>
      `${s?.title || ''} ${Array.isArray(s?.keyPoints) ? s.keyPoints.join(' ') : ''}`,
  )
  .join(' ');

      const anonId =
        req.get('x-anon-id') ||
        req.body?.anonId ||
        req.query?.anonId ||
        null;

      const gate = await narrationPreflight({
        userId,
        anonId,
        orgId,
        courseId,
        estimateText,
        programTrack,
      });

      if (!gate?.ok) {
  const notice = buildGateNotice(gate);

  // reuse the userId you already defined above (don’t redeclare)
  const canNotes = await notesAllowed({ userId, courseId, orgId });

  const lessonsOut = blankLessonsFromOutline(outline, start, count).map((l) => ({
    ...l,
    // choose ONE policy:
    // 1) hide notes completely:
    // markdown: canNotes ? l.markdown : '',
    // 2) show preview teaser:
    markdown: canNotes ? l.markdown : notesPreview(l.markdown),
  }));

  const payload = {
    mode: 'notes_only',
    notice,
    usage: gate?.usage || [],
    lessons: lessonsOut,
    joinedSsml: '',
    quiz: { questions: [] },
  };

  console.log('[api:lesson-ssml] gate blocked narration', {
    reason: notice?.reason,
    resetsAt: notice?.resetsAt,
    canNotes,
  });

  return res.status(200).json(payload);
}


      // ✅ Enforce 60-lesson cap for certificate entitlement (only when entitlement exists)
      let entitlementUsage = null;

      if (userId) {
        try {
          const ent = await getCertificateEntitlement(userId, courseId);

          if (ent) {
            const lessonCap = Number(ent.max_lessons ?? 60) || 60;
            const currentUsed = Number(ent.lessons_used ?? 0);

            if (currentUsed >= lessonCap) {
              return res.status(409).json({
                error: 'LESSON_CAP_REACHED',
                message: 'Lesson limit reached (60).',
                lessons_used: currentUsed,
                lesson_cap: lessonCap,
              });
            }

            const ok = await incrementLessonUsage({
              userId, // can be numeric; helper normalizes to UUID inside
              courseId,
              amount: count, // IMPORTANT: count, not 1
            });

            if (!ok || ok.reachedCap) {
              const used = Number(ok?.lessons_used ?? currentUsed);
              const cap = Number(ok?.max_lessons ?? lessonCap);
              return res.status(409).json({
                error: 'LESSON_CAP_REACHED',
                message: 'Lesson limit reached (60).',
                lessons_used: used,
                lesson_cap: cap,
              });
            }

            entitlementUsage = {
              max: ok.max_lessons,
              used: ok.lessons_used,
            };
          }
        } catch (e) {
          console.warn('[ai] entitlement check failed', e?.message);
        }
      }



      const { status, data, headers } = await generateLessonSSMLService(
        {
          courseId,
          outline,
          voiceName:
            voiceName || process.env.GOOGLE_TTS_VOICE || 'en-US-Wavenet-C',
          courseSize,
          count,
          start,
          programTrack,
        },
        {
          // default true; allow client to disable server-side prewarm
          prewarm:
            !boolish(req.query.noPrewarm) && !boolish(req.body?.noPrewarm),
        },
      );
      setHeaders(res, headers);

      // Attach gating metadata
      data.mode = 'narration';
      data.notice = data.notice || buildGateNotice(gate);
      data.usage = data.usage || gate?.usage || [];
      if (entitlementUsage) data.entitlement = entitlementUsage;

      // Compute actual usage + settle reservation
      let actualSeconds = 0;
      if (Array.isArray(data?.lessons)) {
        actualSeconds = data.lessons.reduce(
          (sum, lesson) => sum + (Number(lesson?.estSeconds) || 0),
          0,
        );
      }
      if (!actualSeconds && typeof data?.joinedSsml === 'string') {
        actualSeconds = Math.round(data.joinedSsml.length / 20);
      }
      if (!actualSeconds && gate?.reserveMin) {
        actualSeconds = Number(gate.reserveMin) * 60;
      }

      if (gate?.reservation) {
        try {
          const settled = await finalizeNarrationUsage({
            reservation: gate.reservation,
            actualSeconds,
          });
          if (settled?.updates?.length) {
           data.usage = settled.updates.map((u) => ({
            bucket: u.bucket,
            remainingSeconds:
              typeof u.limit_int === 'number'
                ? Math.max(0, Number(u.limit_int) - Number(u.used_int || 0) - Number(u.reserved_int || 0))
                : undefined,
            limitSeconds: u.limit_int || undefined,
            resetsAt: u.period_end || null,
          }));
          }
        } catch (e) {
          console.warn(
            '[api:lesson-ssml] finalizeNarrationUsage failed',
            e?.message || e,
          );
        }
      }

      // If degraded but payload exists, send 206 so clients can consume it.
      let statusOut = status;
      const hasPayload =
        (Array.isArray(data?.lessons) && data.lessons.length > 0) ||
        (typeof data?.joinedSsml === 'string' &&
          data.joinedSsml.trim().length > 0);
      if (status >= 500 && status < 600 && hasPayload) {
        statusOut = 206;
        res.set('X-Degraded', 'true');
      }

      console.log('[api:lesson-ssml] resp', {
        status: statusOut,
        lessons: Array.isArray(data?.lessons) ? data.lessons.length : 0,
        joinedBytes:
          typeof data?.joinedSsml === 'string' ? data.joinedSsml.length : 0,
        notice: !!data?.notice,
      });
      return res.status(statusOut).json(data);
    });
  } catch (err) {
    const info = {
      name: err?.name,
      msg: err?.message || err?.msg,
      timeout: !!err?._isTimeoutAbort,
      busy: !!err?._serverBusy,
    };
    console.error('[ai] generateLessonSSML error:', info);

    if (err?._serverBusy) {
      return res
        .status(429)
        .set('Retry-After', '1')
        .json({ msg: 'Server busy' });
    }

    if (isAbortLike(err)) {
      res.set('Retry-After', '5');
      return res
        .status(504)
        .json({ error: 'AI service timeout. Please try again.' });
    }

    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('rate limit') || msg.includes('temporarily unavailable')) {
      res.set('Retry-After', '10');
      return res
        .status(503)
        .json({ error: 'AI temporarily unavailable. Please retry shortly.' });
    }
    return res.status(500).json({ error: 'Failed to generate lesson SSML' });
  }
}

export async function generateQuiz(req, res) {
  try {
    await withGate(async () => {
      const { value, error } = quizSchema.validate(req.body, {
        abortEarly: false,
        allowUnknown: true,
      });
      if (error) {
        console.warn(
          '[ai] quiz validation failed',
          error.details?.map((d) => d.message),
        );
        return res.status(400).json({
          error: 'VALIDATION_FAILED',
          message: error.message,
          details: error.details?.map((d) => d.message) || [],
        });
      }

      // Always initialize locals from validated payload
      const courseId = value.courseId;
      const outline = value.outline;
      const courseSize = value.courseSize;
      let numQ = value.numQuestions; // <- local working copy

      // ✅ Require explicit quizType in the request body
      const qt = String(value?.quizType ?? req.body?.quizType ?? '')
        .trim()
        .toLowerCase();
      if (!['mcq', 'short'].includes(qt)) {
        return res.status(400).json({
          error: 'INVALID_QUIZ_TYPE',
          message: "quizType must be 'mcq' or 'short'.",
        });
      }
      const quizType = qt;

      const meta = olMeta(outline);
      console.log('[api:quiz] req', {
        courseId,
        outlineLen: meta.len,
        numQuestions_in: numQ,
        courseSize,
        quizType_in: quizType,
      });

      if (!courseId) {
        return res.status(400).json({ error: 'MISSING_COURSE_ID' });
      }
      if (!Array.isArray(outline) || !outline.length) {
        return res.status(400).json({ error: 'EMPTY_OUTLINE' });
      }

      // 🔒 Read org locked_config for quiz size and/or type
      // 🔒 Read org assignment timer + locked_config
      // 🔒 Read org assignment timer + locked_config (org lock always wins)
      const assignmentId =
        typeof req.body?.assignmentId === 'string' &&
        req.body.assignmentId.trim()
          ? req.body.assignmentId.trim()
          : undefined;

      let lockedTimerSec;
      let lockedNumQ; // NEW
      if (assignmentId) {
        try {
          const q = await pool.query(
            `SELECT
         timer_s                           AS assign_timer_s,
         COALESCE(locked_config, '{}'::jsonb) AS lc
       FROM org_course_assignments
       WHERE id = $1::uuid
       LIMIT 1`,
            [assignmentId],
          );
          const row = q.rows?.[0] || {};
          const lc = row.lc || {};

          // Size lock (always overrides FE if provided)
          const nLocked = Number(lc.quizSize ?? lc.quiz_size);
          if (Number.isFinite(nLocked) && nLocked > 0) lockedNumQ = nLocked;

          // Timer precedence
          const tAssign = Number(row.assign_timer_s);
          const tLocked = Number(lc.timer_s ?? lc.timerSec ?? lc.timerSeconds);
          const t =
            Number.isFinite(tAssign) && tAssign > 0
              ? tAssign
              : Number.isFinite(tLocked) && tLocked > 0
                ? tLocked
                : undefined;
          if (Number.isFinite(t) && t > 0) lockedTimerSec = t;
        } catch (e) {
          console.warn('[api:quiz] assignment lookup failed', e?.message || e);
        }
      }

      // Respect org lock if present; otherwise use the caller's number (or let the service decide)
      let effectiveNumQ =
        (Number.isFinite(lockedNumQ) ? lockedNumQ : undefined) ??
        (Number.isFinite(Number(value.numQuestions))
          ? Number(value.numQuestions)
          : undefined);

       if (
       boolish(req.query.refresh) ||
       boolish(req.query.refreshCache) ||
       boolish(req.body?.refresh) ||
       boolish(req.body?.refreshCache)
     ) {
       await cacheDeleteByPattern(`ai:quiz:*:${courseId}:*`);
     }


      const { status, data, headers } = await generateQuizService({
        courseId,
        outline,
        numQuestions: effectiveNumQ,
        courseSize,
        quizType,
      });

      // --- Enforce/compute timer & expose HH:MM:SS ---
      function fmtHHMMSS(totalSec) {
        const s = Math.max(0, Math.floor(Number(totalSec) || 0));
        const hh = String(Math.floor(s / 3600)).padStart(2, '0');
        const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
      }
      try {
        if (data?.quiz) {
          const qLen = Array.isArray(data.quiz?.questions)
            ? data.quiz.questions.length
            : 0;
          const ENV_MIN = Number(process.env.QUIZ_TIMER_MIN_SEC || 120);
          const ENV_MAX = Number(process.env.QUIZ_TIMER_MAX_SEC || 3600);
          const fallbackComputed = Math.max(
            ENV_MIN,
            Math.min(ENV_MAX, qLen * 45 + 20),
          );
          const timerSec =
            Number.isFinite(lockedTimerSec) && lockedTimerSec > 0
              ? lockedTimerSec
              : Number.isFinite(Number(data.quiz?.timerSec)) &&
                  Number(data.quiz.timerSec) > 0
                ? Number(data.quiz.timerSec)
                : fallbackComputed;
          data.quiz.timerSec = timerSec;
          data.quiz.timerHHMMSS = fmtHHMMSS(timerSec);
        }
      } catch {}

      /* >>> Ensure uniform type is present (never mix) <<< */
      try {
        const finalType =
          data &&
          data.quiz &&
          (data.quiz.quizType === 'short' || data.quiz.quizType === 'mcq')
            ? data.quiz.quizType
            : quizType || 'mcq';

        if (data && data.quiz) {
          data.quiz.quizType = finalType;
          if (Array.isArray(data.quiz.questions)) {
            data.quiz.questions = data.quiz.questions.map((q) => ({
              ...q,
              type: finalType,
            }));
          }
        }
      } catch (e) {
        console.warn('[api:quiz] finalize type failed', e?.message || e);
      }

      setHeaders(res, headers);
      console.log('[api:quiz] resp', {
        status,
        numQuestions_effective: numQ ?? 'auto',
        questions: data?.quiz?.questions?.length || 0,
        quizType_effective: data?.quiz?.quizType || quizType || 'mcq',
      });
      return res.status(status).json(data);
    });
  } catch (err) {
    const info = {
      name: err?.name,
      msg: err?.message || err?.msg,
      timeout: !!err?._isTimeoutAbort,
      busy: !!err?._serverBusy,
    };
    console.error('[ai] generateQuiz error:', info);

    if (err?._serverBusy) {
      return res
        .status(429)
        .set('Retry-After', '1')
        .json({ msg: 'Server busy' });
    }

    if (
      String(err?.message || '')
        .toLowerCase()
        .includes('abort') ||
      String(err?.msg || '')
        .toLowerCase()
        .includes('abort') ||
      err?.name === 'AbortError'
    ) {
      res.set('Retry-After', '5');
      return res
        .status(504)
        .json({ error: 'AI service timeout. Please try again.' });
    }
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('rate limit') || msg.includes('temporarily unavailable')) {
      res.set('Retry-After', '10');
      return res
        .status(503)
        .json({ error: 'AI temporarily unavailable. Please retry shortly.' });
    }
    return res.status(500).json({ error: 'Failed to generate quiz' });
  }
}

// Pure sync grading using provided key
export async function gradeQuiz(req, res) {
  try {
    const { value, error } = gradeSchema.validate(req.body, {
      abortEarly: false,
      allowUnknown: true, // let assignmentId/courseId flow through
      convert: true,
    });

    if (error) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: error.message,
        details: error.details?.map((d) => d.message) || [],
      });
    }

    const { quiz, answers } = value;

    // Turn on debug logs when explicitly requested OR when not production
    const debug =
      value?.debug === true ||
      String(process.env.DEBUG_QUIZ_GRADE || '').toLowerCase() === 'true' ||
      process.env.NODE_ENV !== 'production';

    // --- helper: local uuid check ---
    const isUuidLocal = (s) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(s || ''),
      );

    // Extract assignmentId safely
    const assignmentId =
      typeof value.assignmentId === 'string' && value.assignmentId.trim()
        ? value.assignmentId.trim()
        : undefined;

    let passMark =
      value.passMark !== undefined &&
      value.passMark !== null &&
      !Number.isNaN(Number(value.passMark))
        ? Number(value.passMark)
        : undefined;

    // Resolve studentId
    const studentId = req.user?.id ?? req.user?.users_id ?? null;

    // ✅ Resolve courseId from multiple possible sources
    const courseIdFromBody =
      typeof value.courseId === 'string' && value.courseId.trim()
        ? value.courseId.trim()
        : null;

    const courseIdFromQuiz =
      typeof quiz?.courseId === 'string' && quiz.courseId.trim()
        ? quiz.courseId.trim()
        : null;

    const courseId = courseIdFromBody || courseIdFromQuiz || null;
    const courseIdIsUuid = courseId ? isUuidLocal(courseId) : false;

    // If passMark missing, look up from assignment → locked_config → org default → 70
    if ((passMark === undefined || Number.isNaN(passMark)) && assignmentId) {
      try {
        const q = await pool.query(
          `SELECT
             COALESCE(
               a.pass_mark,
               NULLIF((a.locked_config->>'passMark')::int, 0),
               o.default_pass_mark,
               70
             )::int AS effective_pass_mark
           FROM org_course_assignments a
           LEFT JOIN organizations o ON o.id = a.org_id
          WHERE a.id = $1::uuid
          LIMIT 1`,
          [assignmentId],
        );
        if (q.rows?.[0]?.effective_pass_mark != null) {
          passMark = Number(q.rows[0].effective_pass_mark);
        }
      } catch (e) {
        console.warn('[ai] gradeQuiz: passMark lookup failed', e?.message || e);
      }
    }

    // Final fallback + clamp
    if (passMark === undefined || Number.isNaN(passMark)) passMark = 70;
    passMark = Math.max(0, Math.min(100, Math.round(passMark)));

    // ---------- NEW grading: supports MCQ + keyed short + AI short fallback ----------
    const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];

    // ---------------------------
    // ✅ Payload normalizer (web + mobile)
    // ---------------------------
    const questionIdsInOrder = questions.map((q) => String(q?.id ?? ''));

    // Accept many possible key names from FE
    const getAnswerQid = (a) =>
      a?.questionId ??
      a?.questionID ??
      a?.question_id ??
      a?.qid ??
      a?.id ??
      a?.question ??
      null;

    // If FE sends numeric indices (0..n-1) or (1..n), map them to real IDs
    const normalizeQid = (raw) => {
      if (raw == null) return null;
      const s = String(raw).trim();
      if (!s) return null;

      // exact match to real id
      if (questionIdsInOrder.includes(s)) return s;

      // "q1" style but FE sends "1"
      if (/^\d+$/.test(s)) {
        const n = Number(s);
        // try 0-based then 1-based
        if (questionIdsInOrder[n]) return questionIdsInOrder[n]; // 0-based
        if (questionIdsInOrder[n - 1]) return questionIdsInOrder[n - 1]; // 1-based
        // also try "qN"
        const qStyle = `q${n}`;
        if (questionIdsInOrder.includes(qStyle)) return qStyle;
      }

      // fallback: if FE sends "q-1" etc, try to extract a number
      const m = s.match(/(\d+)/);
      if (m) {
        const n = Number(m[1]);
        if (questionIdsInOrder[n - 1]) return questionIdsInOrder[n - 1];
        const qStyle = `q${n}`;
        if (questionIdsInOrder.includes(qStyle)) return qStyle;
      }

      return s; // last resort
    };

    // More tolerant text picker (covers most FE shapes)
  const pickUserTextLoose = (a) => {
  const candidates = [
    a?.answerText,      // ✅ ADD THIS (your FE)
    a?.text,
    a?.answer,
    a?.value,
    a?.response,
    a?.input,
    a?.userText,
    a?.shortAnswer,
  ];
  const t = candidates.find((x) => typeof x === 'string' && x.trim());
  return t ? t.trim() : '';
};


    // More tolerant choice index picker
    const pickChoiceIndexLoose = (a) => {
      const candidates = [
        a?.choiceIndex,
        a?.selectedIndex,
        a?.answerIndex,
        a?.index,
        a?.selected,
      ];
      const v = candidates.find((x) => x !== undefined && x !== null);
      return Number.isFinite(Number(v)) ? Number(v) : -1;
    };

    // Build map using normalized ids
    const answersById = new Map(
      (Array.isArray(answers) ? answers : [])
        .map((a) => {
          const raw = getAnswerQid(a);
          const qid = normalizeQid(raw);
          return [String(qid), a];
        })
        .filter(([qid]) => qid && qid !== 'null' && qid !== 'undefined'),
    );

    // ---------------------------
    // ✅ Debug logs to kill the “0%” bug
    // ---------------------------
    if (debug) {
      console.log('[gradeQuiz] quiz.id:', quiz?.id ?? null);
      console.log('[gradeQuiz] quiz.courseId:', quiz?.courseId ?? null);
      console.log('[gradeQuiz] courseId resolved:', courseId);
      console.log('[gradeQuiz] passMark:', passMark);
      console.log('[gradeQuiz] questions:', questionIdsInOrder);

      const aList = Array.isArray(answers) ? answers : [];
      console.log(
        '[gradeQuiz] incoming answers (sample up to 10):',
        aList.slice(0, 10).map((a, i) => ({
          i,
          questionId: a?.questionId,
          questionID: a?.questionID,
          question_id: a?.question_id,
          qid: a?.qid,
          id: a?.id,
          question: a?.question,
          choiceIndex: a?.choiceIndex,
          selectedIndex: a?.selectedIndex,
          answerIndex: a?.answerIndex,
          text: typeof a?.text === 'string' ? a.text.slice(0, 60) : undefined,
          answer: typeof a?.answer === 'string' ? a.answer.slice(0, 60) : undefined,
          value: typeof a?.value === 'string' ? a.value.slice(0, 60) : undefined,
          keys: Object.keys(a || {}),
        })),
      );

      console.log('[gradeQuiz] mapped answer ids:', Array.from(answersById.keys()));
    }

    const results = [];
    let sum = 0;

    for (const q of questions) {
      const qid = String(q.id);
      const a = answersById.get(qid);

      if (debug) {
        const rawKey = a ? getAnswerQid(a) : null;
        const normKey = rawKey != null ? normalizeQid(rawKey) : null;
        console.log('[gradeQuiz] map-check:', {
          qid,
          hasAnswer: Boolean(a),
          rawKey,
          normKey,
          typeHint: q?.type ?? null,
        });
      }

      // If no answer for this question, count as 0 but still include result entry
      if (!a) {
        results.push({
          questionId: q.id,
          type:
            q?.type === 'mcq' || Array.isArray(q?.choices)
              ? 'mcq'
              : 'short',
          correct: false,
          score: 0,
          feedback: 'No answer provided.',
        });
        continue;
      }

      const isMcq =
        q?.type === 'mcq' ||
        (Array.isArray(q?.choices) && typeof q?.answerIndex === 'number');

      if (isMcq) {
        const picked = pickChoiceIndexLoose(a);
        const ans =
          Number.isFinite(Number(q?.answerIndex)) ? Number(q.answerIndex) : -1;

        const ok = picked >= 0 && ans >= 0 && picked === ans;
        const score = ok ? 1 : 0;
        sum += score;

        results.push({
          questionId: q.id,
          type: 'mcq',
          correct: ok,
          score,
        });

        if (debug) {
          console.log('[gradeQuiz] mcq-grade:', {
            qid,
            picked,
            ans,
            ok,
          });
        }
        continue;
      }

      // SHORT
      const userText = pickUserTextLoose(a);
      if (debug) {
      console.log('[gradeQuiz] picked userText keys:', Object.keys(a || {}));
      console.log('[gradeQuiz] picked userText length:', userText.length);
    }

      const qText = questionText(q);

      if (debug) {
        console.log('[gradeQuiz] short-input:', {
          qid,
          userTextPreview: userText ? userText.slice(0, 120) : '',
          hasKey: Boolean(q?.answer),
        });
      }

      // If answer key exists, keep your existing strict logic
      if (q?.answer) {
  const heuristic = shortMatchesLoose(userText, q);

  if (DEBUG_GRADE) {
    console.log('[gradeQuiz] short-key-debug:', {
      qid,
      key: q.answer,
      userPreview: String(userText || '').slice(0, 120),
      heuristic,
    });
  }

  // If heuristic passes, accept full credit
  if (heuristic.ok) {
    sum += 1;
    results.push({
      questionId: q.id,
      type: 'short',
      correct: true,
      score: 1,
      feedback: heuristic.reason,
    });
    continue;
  }

  // ✅ If heuristic fails but user answered, use AI partial credit
  if (userText && userText.trim()) {
    const g = await gradeShortWithAI({ qText, userText });
    const score = clamp01(g.score);
    sum += score;

    results.push({
      questionId: q.id,
      type: 'short',
      correct: score >= 0.7,
      score,
      feedback: `heuristic:${heuristic.reason} sim:${heuristic.sim.toFixed(2)} | ai:${g.feedback || ''}`,
    });
    continue;
  }

  // no text at all
  results.push({
    questionId: q.id,
    type: 'short',
    correct: false,
    score: 0,
    feedback: 'No answer provided.',
  });
  continue;
}

      // ✅ No key → AI grade (partial credit)
      const g = await gradeShortWithAI({ qText, userText });
      const score = clamp01(g.score);
      sum += score;

      results.push({
        questionId: q.id,
        type: 'short',
        correct: score >= 0.7,
        score,
        feedback: g.feedback,
      });

      if (debug) {
        console.log('[gradeQuiz] short-ai-grade:', {
          qid,
          score,
          feedbackPreview: (g?.feedback || '').slice(0, 140),
        });
      }
    }

    const total = questions.length || 1;
    const scorePct = Math.round((sum / total) * 100);
    const passed = scorePct >= passMark;

    // For DB compatibility (if correct column is INT), store "count of correct" using same threshold as correct=true
    const correctCount = results.reduce((acc, r) => acc + (r.score >= 0.7 ? 1 : 0), 0);

    // ---------- Persist attempt for NON-org flows ----------
    let attemptSaved = false;
    let attemptId = null;

    if (!assignmentId && studentId && courseId && courseIdIsUuid) {
      // ✅ If we don't have a real quiz UUID from `quizzes`, store NULL (avoid FK violations)
      const quizIdToInsert =
        (typeof quiz?.id === 'string' && isUuidLocal(quiz.id) ? quiz.id : null) ||
        (typeof quiz?.quizId === 'string' && isUuidLocal(quiz.quizId)
          ? quiz.quizId
          : null) ||
        null;

      const answersJson = {
        answers: Array.isArray(answers) ? answers : [],
        quizType: quiz?.quizType || null,
        results,
        sumScore: sum, // float 0..total
        debugMap: debug
          ? {
              questionIdsInOrder,
              mappedAnswerIds: Array.from(answersById.keys()),
            }
          : undefined,
      };

      try {
        const ins = await pool.query(
          `
          INSERT INTO quiz_attempts
            (id, quiz_id, total, correct, score_pct, passed, answers_json, created_at, pass_mark, student_id, course_id)
          VALUES
            (gen_random_uuid(),
             $1::uuid,                 -- NULL allowed
             $2, $3, $4, $5, $6::jsonb, NOW(), $7, $8, $9::uuid)
          RETURNING id, created_at
          `,
          [
            quizIdToInsert,
            total,
            correctCount, // ✅ int-safe
            scorePct,     // ✅ reflects partial credit
            passed,
            JSON.stringify(answersJson),
            passMark,
            Number(studentId),
            courseId,
          ],
        );

        attemptSaved = ins.rowCount > 0;
        attemptId = ins.rows?.[0]?.id || null;

        if (debug) {
          console.log('[gradeQuiz] attempt saved:', { attemptSaved, attemptId });
        }
      } catch (e) {
        console.warn('[ai] gradeQuiz: failed to persist quiz_attempts', {
          message: e?.message,
          code: e?.code,
          detail: e?.detail,
          hint: e?.hint,
          constraint: e?.constraint,
          table: e?.table,
          column: e?.column,
          where: e?.where,
        });
      }
    }

    if (passed && courseIdIsUuid) {
      await markLanguageQuizPassed({ courseId, userId: studentId }).catch(() => null);
    }

    return res.json({
      correct: correctCount, // int-friendly
      total,
      scorePct,              // fair score (partial credit)
      passed,
      passMark,
      assignmentId: assignmentId || null,
      attemptSaved,
      attemptId,
      courseId: courseId || null,
      results,
    });
  } catch (err) {
    console.error('[ai] gradeQuiz error:', err);
    return res.status(500).json({ error: 'Failed to grade quiz' });
  }
}



export async function generateCoursePackage(req, res) {
  try {
    await withGate(async () => {
      const {
        courseId,
        level = 'beginner',
        targetMinutes,
        voiceName = process.env.GOOGLE_TTS_VOICE || 'en-US-Wavenet-C',
        numQuestions,
        courseSize,
        totalLessons,
      } = req.body || {};
      if (!courseId)
        return res.status(400).json({ error: 'courseId is required' });
      const programTrack = getProgramTrack(req); // <-- read safely
      res.set('X-Program-Track', programTrack); // (optional header for visibility)

      // Accept optional admin override for quiz type
      const rawQuizType =
        (typeof req.body?.quizType === 'string' && req.body.quizType) ||
        (typeof req.query?.quizType === 'string' && req.query.quizType) ||
        (typeof req.headers['x-quiz-type'] === 'string' &&
          req.headers['x-quiz-type']) ||
        '';
      const isMultipleChoiceBool =
        typeof req.body?.isMultipleChoice === 'boolean'
          ? req.body.isMultipleChoice
          : undefined;
      const normalizeQuizType = (t) => {
        const s = String(t || '')
          .trim()
          .toLowerCase();
        if (
          [
            'mcq',
            'multiple',
            'multiple_choice',
            'multiple-choice',
            'choice',
            'choices',
          ].includes(s)
        )
          return 'mcq';
        if (
          [
            'short',
            'open',
            'free',
            'shortanswer',
            'short-answer',
            'short_answer',
            'written',
            'fill',
            'fill_in',
            'fill-in',
          ].includes(s)
        )
          return 'short';
        return '';
      };
      let quizType = normalizeQuizType(rawQuizType);
      if (!quizType && typeof isMultipleChoiceBool === 'boolean') {
        quizType = isMultipleChoiceBool ? 'mcq' : 'short';
      }

      console.log('[api:course-package] req', {
        courseId,
        level,
        targetMinutes,
        voiceName,
        numQuestions,
        courseSize,
        programTrack,
        totalLessons,
      });

      // Optional refresh before end-to-end package
      if (
        boolish(req.query.refresh) ||
        boolish(req.query.refreshCache) ||
        boolish(req.body?.refresh) ||
        boolish(req.body?.refreshCache)
      ) {
        await cacheBustCourse(courseId);
        if (boolish(req.query.top) || boolish(req.body?.top)) {
          await cacheDeleteByPattern('ai:topCourses:*');
        }
      }

      const { status, data, headers } = await generateCoursePackageService({
        courseId,
        level,
        targetMinutes,
        voiceName,
        numQuestions,
        courseSize,
        totalLessons,
        programTrack,
        quizType,
      });

      try {
        const qt =
          data?.quiz?.quizType === 'short' || data?.quiz?.quizType === 'mcq'
            ? data.quiz.quizType
            : quizType || 'mcq';
        if (data?.quiz) {
          data.quiz.quizType = qt;
          if (Array.isArray(data.quiz.questions)) {
            data.quiz.questions = data.quiz.questions.map((q) => ({
              ...q,
              type: qt,
            }));
          }
        }
      } catch (e) {
        console.warn(
          '[api:course-package] finalize quiz type failed',
          e?.message || e,
        );
      }
      setHeaders(res, headers);

      console.log('[api:course-package] resp', {
        status,
        outlineLen: Array.isArray(data?.outline) ? data.outline.length : 0,
        lessons: Array.isArray(data?.lessons) ? data.lessons.length : 0,
        quizQ: data?.quiz?.questions?.length || 0,
        notice: !!data?.notice,
      });

      return res.status(status).json(data);
    });
  } catch (err) {
    console.error('[ai] generateCoursePackage error:', {
      name: err?.name,
      msg: err?.message || err?.msg,
      timeout: !!err?._isTimeoutAbort,
      busy: !!err?._serverBusy,
    });
    if (err?._serverBusy) {
      return res
        .status(429)
        .set('Retry-After', '1')
        .json({ msg: 'Server busy' });
    }

    if (isAbortLike(err)) {
      res.set('Retry-After', '5');
      return res
        .status(504)
        .json({ error: 'AI service timeout. Please try again.' });
    }
    return res.status(500).json({ error: 'Failed to generate course package' });
  }
}

/* ─────────────────────────────────────────────────────────
 * Cache admin helpers (optional endpoints)
 * ───────────────────────────────────────────────────────── */

// Clear cache for a specific courseId (outline/ssml/quiz). Accepts query or body.
export async function clearCourseCache(req, res) {
  try {
    const courseId = req.body?.courseId || req.query?.courseId;
    if (!courseId)
      return res.status(400).json({ error: 'courseId is required' });
    const removed = await cacheBustCourse(courseId);
    return res.json({ ok: true, removed, courseId });
  } catch (err) {
    console.error('[ai] clearCourseCache error:', err);
    return res.status(500).json({ error: 'Failed to clear course cache' });
  }
}

// Clear top courses cache only
export async function clearTopCoursesCache(req, res) {
  try {
    const removed = await cacheDeleteByPattern('ai:topCourses:*');
    return res.json({ ok: true, removed });
  } catch (err) {
    console.error('[ai] clearTopCoursesCache error:', err);
    return res.status(500).json({ error: 'Failed to clear top courses cache' });
  }
}

/* ─────────────────────────────────────────────────────────
 * Optional default export (helps in some bundlers)
 * ───────────────────────────────────────────────────────── */
export default {
  listTopCourses,
  generateOutline,
  generateLessonSSML,
  generateQuiz,
  gradeQuiz,
  generateCoursePackage,
  // NEW:
  clearCourseCache,
  clearTopCoursesCache,
};
