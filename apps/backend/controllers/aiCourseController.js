// apps/backend/controllers/aiCourseController.js
import pool from '../config/db.js';

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
import { getEntitlement } from './_entitlements.js';
import {
  incrementLessonUsage,
  getCertificateEntitlement,
} from './_aiCourseEntitlements.js';


/* ─────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────── */

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
function shortMatches(user, q) {
  const u = normalizeChemAnswer(user);
  const canon = normalizeChemAnswer(q.answer || '');
  if (u === canon) return true;
  for (const a of q.accept || []) {
    if (u === normalizeChemAnswer(a)) return true;
  }
  if (q.regex) {
    try {
      if (new RegExp(q.regex).test(user)) return true;
    } catch {}
  }
  return false;
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

async function hasCertificateEntitlement(userId, courseId) {
  if (!userId || !courseId) return false;
  try {
    const ent = await getEntitlement(pool, userId, courseId);
    return !!(ent && (ent.can_certificate || ent.tier));
  } catch {
    return false;
  }
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
  await ensureProfileIdForUser(userId, { role: effectiveRole });
}


const estimateText = Array.isArray(outline)
  ? outline
      .map(
        (s) =>
          `${s?.title || ''} ${Array.isArray(s?.keyPoints) ? s.keyPoints.join(' ') : ''}`,
      )
      .join(' ')
  : '';

      const anonId =
        req.get('x-anon-id') ||
        req.body?.anonId ||
        req.query?.anonId ||
        null;

      const gate = await narrationPreflight({
        userId: req.user?.id || req.body?.userId || null,
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


      let entitlementUsage = null;
      if (userId) {
        try {
          const ent = await getCertificateEntitlement(userId, courseId);
          if (ent) {
            const inc = await incrementLessonUsage({
              userId,
              courseId,
              amount: count,
            });
            if (!inc) {
              return res
                .status(403)
                .json({ error: 'LESSON_LIMIT_REACHED', max: ent.max_lessons || 60 });
            }
            entitlementUsage = {
              max: inc.max_lessons,
              used: inc.lessons_used,
            };
          }
        } catch (e) {
          console.warn('[ai] entitlement check failed', e.message);
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

      const programTrack =
        req.body?.programTrack ||
        req.query?.programTrack ||
        req.headers['x-program-track'] ||
        'general';
      // Respect org lock if present; otherwise use the caller's number (or let the service decide)
      let effectiveNumQ =
        (Number.isFinite(lockedNumQ) ? lockedNumQ : undefined) ??
        (Number.isFinite(Number(value.numQuestions))
          ? Number(value.numQuestions)
          : undefined);

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
// Pure sync grading using provided key (MCQ + short-answer)
export async function gradeQuiz(req, res) {
  try {
    const { value, error } = gradeSchema.validate(req.body, {
      abortEarly: false,
      allowUnknown: true, // let assignmentId flow through even if not in schema
      convert: true,
    });
    if (error) {
      console.warn(
        '[ai] grade validation failed',
        error.details?.map((d) => d.message),
      );
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: error.message,
        details: error.details?.map((d) => d.message) || [],
      });
    }

    const { quiz, answers } = value;

    // Extract passMark/assignmentId without TS
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

    // ---------- NEW: mixed-type grading (MCQ + short) ----------
    const byId = new Map((answers || []).map((a) => [a.questionId, a]));

    // prefer per-question type; else pack-level; else infer from presence of choices
    const normType = (t) => {
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

    let correct = 0;
    const total = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
    const packType = normType(quiz?.quizType);

    for (const q of quiz?.questions || []) {
      const a = byId.get(q.id);
      if (!a) continue;

      const qType =
        normType(q?.type) ||
        packType ||
        (Array.isArray(q?.choices) && Number.isFinite(Number(q?.answerIndex))
          ? 'mcq'
          : 'short');

      if (qType === 'mcq') {
        // MCQ path: use answerIndex vs provided choiceIndex
        const choiceIndex = Number.isFinite(Number(a.choiceIndex))
          ? Number(a.choiceIndex)
          : -1;
        const answerIndex = Number.isFinite(Number(q?.answerIndex))
          ? Number(q.answerIndex)
          : -1;
        if (choiceIndex >= 0 && choiceIndex === answerIndex) correct += 1;
      } else {
        // Short-answer path: allow several common payload keys for the typed answer
        const userRaw =
          a?.text ?? a?.answerText ?? a?.value ?? a?.free ?? a?.written ?? '';
        const userStr = String(userRaw ?? '').trim();

        // Edge fallback: if (wrongly) sent choiceIndex for a short item, try to map it
        let candidate = userStr;
        if (
          !candidate &&
          Array.isArray(q?.choices) &&
          Number.isFinite(Number(a?.choiceIndex))
        ) {
          const idx = Number(a.choiceIndex);
          if (idx >= 0 && idx < q.choices.length)
            candidate = String(q.choices[idx] || '');
        }

        if (candidate && shortMatches(candidate, q)) correct += 1;
      }
    }

    const scorePct = total ? Math.round((correct / total) * 100) : 0;
    const passed = scorePct >= passMark;

    return res.json({
      correct,
      total,
      scorePct,
      passed,
      passMark,
      assignmentId: assignmentId || null,
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
