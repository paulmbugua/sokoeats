// apps/backend/controllers/orgController.js
import pool from '../config/db.js';
import { sendOTP as sendEmail } from '../config/emailService.js'; // reuse simple sender name
import { ensureCourse } from '../services/courseEnsure.js';
import crypto from 'crypto';
import { ensureOrgForUser } from '../services/orgBootstrap.js';
import { enqueueWebhook } from '../helpers/webhooks.js';
import PDFDocument from 'pdfkit';
import { resolveInstructorFeeTable } from '../utils/feeAccessTable.js';
// Helpers
const nowPlusSec = (sec) => new Date(Date.now() + sec * 1000);

/* ───────── helpers ───────── */
function parseDomains(raw = '') {
  return String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)); // basic sanity
}

const pickDefined = (obj, keys) =>
  Object.fromEntries(
    keys
      .filter(
        (k) =>
          Object.prototype.hasOwnProperty.call(obj ?? {}, k) &&
          obj[k] !== undefined,
      )
      .map((k) => [k, obj[k]]),
  );

async function getOrgColumns() {
  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='organizations'`,
  );
  return new Set(rows.map((r) => r.column_name));
}

const pick = (obj, keys) =>
  keys.reduce(
    (acc, k) => (obj[k] !== undefined ? ((acc[k] = obj[k]), acc) : acc),
    {},
  );

function emailMatches(email, domainList) {
  if (!domainList.length) return true;
  const at = email.indexOf('@');
  if (at < 0) return false;
  const dom = email.slice(at + 1).toLowerCase();
  return domainList.some((rule) => {
    if (rule.startsWith('*.')) {
      const base = rule.slice(2);
      return dom === base || dom.endsWith('.' + base);
    }
    return dom === rule || dom.endsWith('.' + rule);
  });
}

// Simple stub: replace with your real grading service
async function fakeGrade(courseId, answers) {
  const correct = Array.isArray(answers)
    ? Math.max(0, Math.min(answers.length, Math.round(answers.length * 0.8)))
    : 0;
  const scorePct = answers?.length
    ? Math.round((correct / answers.length) * 100)
    : 0;
  const passMark = 70;
  return { scorePct, passed: scorePct >= passMark, passMark };
}

async function getSeatLimit(client, orgId) {
  const q = await client.query(
    `SELECT
       COALESCE(s.seats,
         CASE
           WHEN LOWER(COALESCE(s.tier,'starter')) IN ('start','starter') THEN 50
           WHEN LOWER(s.tier)='pro' THEN 500
           WHEN LOWER(s.tier)='enterprise' THEN 5000
           ELSE 50
         END
       ) AS seat_limit
     FROM organizations o
     LEFT JOIN org_subscriptions s
       ON s.org_id = o.id AND s.active = TRUE
    WHERE o.id = $1
    LIMIT 1`,
    [orgId],
  );
  return q.rows[0]?.seat_limit ?? 50;
}

// keep this in the same file (orgController.js)

async function emitQuizEvents({ attemptId }) {
  const { rows } = await pool.query(
    `SELECT qa.id,
            qa.user_id,
            qa.assignment_id,
            qa.course_id,
            qa.score_pct AS score,   -- 👈 alias to "score"
            qa.passed,
            qa.submitted_at,
            o.id  AS org_id,
            o.webhook_url,
            o.webhook_enabled
       FROM org_quiz_attempts qa
       JOIN org_course_assignments a ON a.id = qa.assignment_id
       JOIN organizations o          ON o.id = a.org_id
      WHERE qa.id = $1
      LIMIT 1`,
    [attemptId],
  );
  if (!rows.length) return;
  const a = rows[0];
  if (!a.webhook_enabled || !a.webhook_url) return;

  const base = {
    attemptId: a.id,
    userId: a.user_id,
    assignmentId: a.assignment_id,
    courseId: a.course_id,
    score: a.score, // now populated
    submittedAt: a.submitted_at,
  };

  await pool.query(
    `INSERT INTO org_webhook_deliveries (org_id, event_type, payload)
     VALUES ($1, 'quiz_submitted', $2::jsonb)`,
    [a.org_id, JSON.stringify({ ...base, passed: a.passed })],
  );

  if (a.passed) {
    await pool.query(
      `INSERT INTO org_webhook_deliveries (org_id, event_type, payload)
       VALUES ($1, 'quiz_passed', $2::jsonb)`,
      [a.org_id, JSON.stringify(base)],
    );
  }
}

export async function createOrg(req, res) {
  const userId = req.user?.id;
  const { name, slug } = req.body || {};
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (!name) return res.status(400).json({ message: 'Missing name' });

  const { rows } = await pool.query(
    `INSERT INTO organizations (owner_user_id, name, slug)
     VALUES ($1, $2, $3) RETURNING id, name, slug`,
    [userId, name, slug || null],
  );
  // auto-membership owner
  await pool.query(
    `INSERT INTO org_memberships (org_id, user_id, role, invited_by, joined_at)
     VALUES ($1, $2, 'owner', $2, NOW())`,
    [rows[0].id, userId],
  );
  return res.json(rows[0]);
}

// IDP: idempotent create (UPSERT) so (org_id, course_id) won't 23505
// IDP: idempotent create (UPSERT) so (org_id, course_id) won't 23505
export async function createAssignment(req, res) {
  const userId = req.user?.id;
  const { orgId } = req.params;

  const {
    courseId,
    title_override,
    pass_mark,
    timer_s,
    max_attempts = 1,
    due_at,
    org_class_label,
    orgClassLabel,
    class_label,
    classLabel: classLabelBody,
    org_subject_key,
    orgSubjectKey,
    subject_key,
    subject: subjectBody,
  } = req.body || {};

  // ── Correlation / logging helpers ─────────────────────────
  const DEBUG =
    String(process.env.DEBUG_ORG_ASSIGNMENTS || '') === '1' ||
    String(process.env.NODE_ENV || '') !== 'production';

  let rid =
    req.get?.('x-request-id') ||
    req.headers?.['x-request-id'] ||
    null;

  if (!rid) {
    try {
      // ESM-safe random
      rid = crypto.randomUUID?.() || crypto.randomBytes(6).toString('hex');
    } catch {
      rid = Math.random().toString(36).slice(2, 10);
    }
  }

  const tag = (m) => `[org.createAssignment(ai) ${rid}] ${m}`;
  const log = (...a) => DEBUG && console.log(tag(''), ...a);
  const warn = (...a) => console.warn(tag('WARN'), ...a);
  const errlog = (...a) => console.error(tag('ERROR'), ...a);

  log('incoming', {
    orgId,
    userId,
    bodyKeys: Object.keys(req.body || {}),
    courseId,
    title_override,
    pass_mark,
    timer_s,
    max_attempts,
    due_at,
    org_class_label,
    orgClassLabel,
    class_label,
    classLabelBody,
    org_subject_key,
    orgSubjectKey,
    subject_key,
    subjectBody,
  });

  if (!userId) {
    warn('unauthorized');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!orgId) {
    warn('bad request: missing orgId');
    return res.status(400).json({ message: 'Missing orgId' });
  }

  if (!courseId) {
    warn('bad request: missing courseId (AI assignment requires a courseId)');
    return res.status(400).json({ message: 'Missing courseId' });
  }

  // admin/instructor only
  const mem = await pool.query(
    `SELECT role
       FROM org_memberships
      WHERE org_id=$1 AND user_id=$2
        AND role IN ('owner','admin','instructor')
      LIMIT 1`,
    [orgId, userId],
  );

  log('membership.check', {
    rowCount: mem.rowCount,
    role: mem.rows?.[0]?.role || null,
  });

  if (!mem.rowCount) {
    warn('forbidden: not owner/admin/instructor', { orgId, userId });
    return res.status(403).json({ message: 'Forbidden' });
  }

  const classLabel =
    (org_class_label ||
      orgClassLabel ||
      class_label ||
      classLabelBody ||
      null);

  const subjectKey =
    (org_subject_key ||
      orgSubjectKey ||
      subject_key ||
      subjectBody ||
      null);

  // normalize (optional but helps debugging mismatches)
  const classLabelNorm = classLabel ? String(classLabel).trim() : null;
  const subjectKeyNorm = subjectKey ? String(subjectKey).trim() : null;

  // used for invite links
  const invite = crypto.randomBytes(10).toString('base64url');

  try {
    // show what already exists for this (org,course) — helps confirm upsert behavior
    const pre = await pool.query(
      `SELECT id, org_id, course_id, org_class_label, org_subject_key, invite_code, source_kind, created_at, updated_at
         FROM org_course_assignments
        WHERE org_id=$1 AND course_id=$2
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 3`,
      [orgId, courseId],
    );

    log('pre.existingRows', {
      count: pre.rowCount,
      rows: pre.rows?.map((r) => ({
        id: r.id,
        org_class_label: r.org_class_label,
        org_subject_key: r.org_subject_key,
        invite_code: r.invite_code,
        source_kind: r.source_kind,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    });

    const q = await pool.query(
      `
      INSERT INTO org_course_assignments
        (
          org_id,
          course_id,
          title_override,
          pass_mark,
          timer_s,
          max_attempts,
          due_at,
          invite_code,
          created_by,
          created_at,
          updated_at,
          org_class_label,
          org_subject_key,
          source_kind
        )
      VALUES
        (
          $1, $2, $3, $4, $5, $6, $7,
          COALESCE(
            (SELECT invite_code FROM org_course_assignments WHERE org_id=$1 AND course_id=$2),
            $8
          ),
          $9, NOW(), NOW(), $10, $11, 'robot'
        )
      ON CONFLICT (org_id, course_id) DO UPDATE
         SET title_override = COALESCE(EXCLUDED.title_override, org_course_assignments.title_override),
             pass_mark      = COALESCE(EXCLUDED.pass_mark,      org_course_assignments.pass_mark),
             timer_s        = COALESCE(EXCLUDED.timer_s,        org_course_assignments.timer_s),
             max_attempts   = COALESCE(EXCLUDED.max_attempts,   org_course_assignments.max_attempts),
             due_at         = COALESCE(EXCLUDED.due_at,         org_course_assignments.due_at),
             org_class_label= COALESCE(EXCLUDED.org_class_label, org_course_assignments.org_class_label),
             org_subject_key= COALESCE(EXCLUDED.org_subject_key, org_course_assignments.org_subject_key),
             source_kind    = COALESCE(EXCLUDED.source_kind,    org_course_assignments.source_kind),
             updated_at     = NOW()
      RETURNING *;
      `,
      [
        orgId, // $1
        courseId, // $2
        title_override || null, // $3
        pass_mark ?? null, // $4
        timer_s ?? null, // $5
        max_attempts ?? 1, // $6
        due_at || null, // $7
        invite, // $8
        userId, // $9
        classLabelNorm, // $10
        subjectKeyNorm, // $11
      ],
    );

    const row = q.rows[0];

    log('createdOrUpdated', {
      id: row?.id,
      org_id: row?.org_id,
      course_id: row?.course_id,
      source_kind: row?.source_kind,
      org_class_label: row?.org_class_label,
      org_subject_key: row?.org_subject_key,
      invite_code: row?.invite_code,
      due_at: row?.due_at,
      created_by: row?.created_by,
      created_at: row?.created_at,
      updated_at: row?.updated_at,
    });

    return res.json(row);
  } catch (e) {
    errlog('failed', {
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      constraint: e?.constraint,
      stack: e?.stack,
      orgId,
      courseId,
      classLabel: classLabelNorm,
      subjectKey: subjectKeyNorm,
    });

    return res
      .status(500)
      .json({ message: 'Failed to create/update assignment' });
  }
}

export async function submitAttempt(req, res) {
  const userId = req.user?.id;
  const { assignmentId, attemptId, answers } = req.body || {};
  if (!userId || (!assignmentId && !attemptId)) {
    return res.status(400).json({ message: 'Bad request' });
  }

  // Load the learner's active attempt (by attemptId if provided, else by assignmentId)
  const params = attemptId ? [attemptId, userId] : [assignmentId, userId];
  const whereClause = attemptId
    ? 'qa.id=$1 AND qa.user_id=$2'
    : 'qa.assignment_id=$1 AND qa.user_id=$2';

  const q = await pool.query(
    `
    SELECT qa.*,
           a.course_id,
           a.max_attempts,
           o.allow_retry,
           o.webhook_url,
           o.webhook_enabled,
           o.webhook_secret
      FROM org_quiz_attempts qa
      JOIN org_course_assignments a ON a.id = qa.assignment_id
      JOIN organizations o          ON o.id = qa.org_id
     WHERE ${whereClause}
     ORDER BY qa.created_at DESC
     LIMIT 1
    `,
    params,
  );
  if (!q.rowCount)
    return res.status(404).json({ message: 'Attempt not found' });

  const att = q.rows[0];

  // Hard stop if time is up
  const nowMs = Date.now();
  const dueMs = att.due_at ? new Date(att.due_at).getTime() : 0;
  if (dueMs && dueMs < nowMs) {
    await pool.query(
      `UPDATE org_quiz_attempts SET status='expired' WHERE id=$1`,
      [att.id],
    );
    return res.status(403).json({ message: 'Time expired. Attempt locked.' });
  }

  // If already submitted and passed, no further submits
  if (att.status !== 'active' && att.passed) {
    return res.status(403).json({ message: 'Attempt is already submitted.' });
  }

  // TODO: replace with your real grading
  const grade = await fakeGrade(att.course_id, answers); // { scorePct, passed, passMark }

  // Persist: always finalize the attempt on submit so "used attempts" is accurate
  const allowRetry = att.allow_retry !== false; // default true
  const sql = `
    UPDATE org_quiz_attempts
       SET submitted_at = NOW(),
           status       = 'submitted',
           score_pct    = $2,
           passed       = $3,
           answers      = $4
     WHERE id = $1
     RETURNING id, assignment_id, org_id, user_id, status, score_pct, passed, due_at
  `;
  const { rows: upRows } = await pool.query(sql, [
    att.id,
    grade.scorePct,
    grade.passed,
    JSON.stringify(answers || []),
  ]);
  const updatedAttempt = upRows[0];

  // How many attempts are now used (submitted/expired)?
  const usedQ = await pool.query(
    `SELECT COUNT(*)::int AS used
       FROM org_quiz_attempts
      WHERE assignment_id=$1 AND user_id=$2
        AND status IN ('submitted','expired')`,
    [att.assignment_id, userId],
  );
  const used = usedQ.rows[0]?.used ?? 0;
  const maxAttempts = att.max_attempts || 1;
  const attemptsLeft = Math.max(0, maxAttempts - used);
  const canRetry = allowRetry && !grade.passed && attemptsLeft > 0;

  // Define finalize condition (for your email + general completion semantics)
  const shouldFinalize = grade.passed || !canRetry;

  // 🔔 Enqueue webhooks (non-blocking) — fires on submit, and a second event if passed
  try {
    if (att.webhook_enabled && att.webhook_url) {
      await enqueueWebhook(att.org_id, 'quiz_submitted', {
        attemptId: att.id,
        userId: att.user_id,
        assignmentId: att.assignment_id,
        courseId: att.course_id,
        score: grade.scorePct,
        passed: grade.passed,
        submittedAt: new Date().toISOString(),
      });

      if (grade.passed) {
        await enqueueWebhook(att.org_id, 'quiz_passed', {
          attemptId: att.id,
          userId: att.user_id,
          assignmentId: att.assignment_id,
          courseId: att.course_id,
          score: grade.scorePct,
          submittedAt: new Date().toISOString(),
        });
      }
    }
  } catch (e) {
    console.warn('[webhook] enqueue failed', e?.message);
  }

  // Optional: mail only when finalized (passed or no-retry)
  try {
    if (shouldFinalize) {
      const u = await pool.query(`SELECT email, name FROM users WHERE id=$1`, [
        userId,
      ]);
      if (u.rowCount && u.rows[0].email) {
        await sendEmail(
          u.rows[0].email,
          `Quiz result: ${grade.scorePct}%`,
          `You scored ${grade.scorePct}% ${grade.passed ? '✅ (passed)' : '❌ (not passed)'}.`,
        );
      }
    }
  } catch (e) {
    console.warn('[email] result mail failed', e?.message);
  }

  return res.json({
    ok: true,
    grade,
    attempt: updatedAttempt,
    attempts: { used, max: maxAttempts, left: attemptsLeft, canRetry },
  });
}

export async function orgAnalytics(req, res) {
  const userId = req.user?.id;
  const { orgId } = req.params;
  const { period = 'month' } = req.query; // 'month' | 'term' | 'year'

  const mem = await pool.query(
    `SELECT 1 
       FROM org_memberships 
      WHERE org_id=$1 AND user_id=$2 
        AND role IN ('owner','admin','instructor')`,
    [orgId, userId],
  );
  if (!mem.rowCount) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Use submitted_at (not created_at) so analytics reflects *completed* quizzes only
  const tsCol = 'submitted_at';
  const bucketExpr =
    period === 'year'
      ? `date_trunc('year', ${tsCol})`
      : period === 'term'
        ? `date_trunc('quarter', ${tsCol})`
        : `date_trunc('month', ${tsCol})`;

  const { rows } = await pool.query(
    `
      SELECT
        ${bucketExpr}                         AS bucket,
        COUNT(*)                              AS attempts,
        AVG(score_pct)                        AS avg_score,
        SUM(CASE WHEN passed THEN 1 ELSE 0 END) AS passes
      FROM org_quiz_attempts
      WHERE org_id = $1
        AND status = 'submitted'
        AND ${tsCol} IS NOT NULL
      GROUP BY 1
      ORDER BY 1 ASC
      LIMIT 60
    `,
    [orgId],
  );

  const data = rows.map((r) => {
    const attempts = Number(r.attempts || 0);
    const passes = Number(r.passes || 0);
    const avgScore =
      r.avg_score === null || r.avg_score === undefined
        ? null
        : Number(r.avg_score);
    const passRate = attempts > 0 ? Math.round((passes * 100) / attempts) : 0;

    // pg returns bucket as JS Date
    const bucketDate = r.bucket instanceof Date ? r.bucket : new Date(r.bucket);
    const iso = bucketDate.toISOString();
    const bucketLabel = iso.slice(0, 10); // YYYY-MM-DD; FE can reformat

    return {
      bucket: bucketDate, // raw date (for serious consumers)
      bucket_label: bucketLabel,
      attempts,
      avg_score: avgScore,
      passes,
      pass_rate: passRate,
    };
  });

  return res.json({
    ok: true,
    period,
    data,
  });
}

export async function getMyOrg(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const feeTable = await resolveInstructorFeeTable(pool); // ✅ you added this helper

    // whitelist join/selection only (prevents SQL injection)
    const feeJoin = feeTable
      ? `LEFT JOIN ${feeTable} i ON i.org_id = m.org_id AND i.user_id = m.user_id`
      : ``;

    const feeSelect = feeTable
      ? `COALESCE(i.can_access_fees, false) AS can_access_fees`
      : `false AS can_access_fees`;

    // Pick the first org the user belongs to (prefer owner/admin)
    const q = await pool.query(
      `
      SELECT o.*,
             CASE
               WHEN LOWER(COALESCE(s.tier,'')) IN ('start','starter') THEN 'starter'
               WHEN LOWER(COALESCE(s.tier,'')) = 'pro' THEN 'pro'
               WHEN LOWER(COALESCE(s.tier,'')) = 'enterprise' THEN 'enterprise'
               ELSE COALESCE(s.tier, 'starter')
             END AS tier,
             s.seats,
             u.email AS owner_email,
             m.role AS my_role,
             ${feeSelect}
        FROM organizations o
        JOIN org_memberships m ON m.org_id = o.id
        ${feeJoin}
        LEFT JOIN org_subscriptions s ON s.org_id = o.id AND s.active = TRUE
        LEFT JOIN users u ON u.id = o.owner_user_id
       WHERE m.user_id = $1
       ORDER BY CASE WHEN m.role IN ('owner','admin') THEN 0 ELSE 1 END,
                o.created_at DESC
       LIMIT 1
      `,
      [userId],
    );

    if (!q.rowCount) {
      return res.status(404).json({ message: 'No organization for user' });
    }

    return res.json(q.rows[0]);
  } catch (e) {
    console.error('[getMyOrg] failed', e);
    return res.status(500).json({ message: 'Server error' });
  }
}


// controllers/orgController.js
export async function getOrgUsage(req, res) {
  const userId = req.user?.id;
  const { orgId } = req.params;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  // must be a member of this org
  const mem = await pool.query(
    `SELECT 1 FROM org_memberships WHERE org_id=$1 AND user_id=$2`,
    [orgId, userId],
  );
  if (!mem.rowCount) return res.status(403).json({ message: 'Forbidden' });

  // seats = learners only
  const r = await pool.query(
    `SELECT COUNT(*)::int AS seats_used
       FROM org_memberships
      WHERE org_id=$1 AND role='learner'`,
    [orgId],
  );
  return res.json({ seats_used: r.rows[0]?.seats_used ?? 0 });
}

export async function bootstrapMyOrg(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const org = await ensureOrgForUser(userId);
    return res.json(org);
  } catch (e) {
    console.error('[bootstrapMyOrg]', e);
    return res.status(500).json({ message: 'Failed to bootstrap org' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ensure (idempotent) shareable assignment and return inviteUrl
export async function ensureShareableAssignment(req, res) {
  const userId = req.user?.id;
  const { orgId } = req.params;
  const {
    courseId,
    title,
    courseSize,
    minutes,
    title_override,
    pass_mark,
    timer_s,
    max_attempts = 1,
    due_at,
    locked_config,
  } = req.body || {};

  // ── Logging helpers (no TS types; ESM-safe crypto) ───────────────────────
  let rid = req.get?.('x-request-id') || null;
  if (!rid) {
    try {
      const { randomUUID, randomBytes } = await import('crypto');
      rid =
        (typeof randomUUID === 'function' && randomUUID()) ||
        randomBytes(6).toString('hex');
    } catch {
      rid = Math.random().toString(36).slice(2, 10);
    }
  }
  const tag = (msg) => `[org.share ${rid}] ${msg}`;
  const log = (...args) => console.log(tag(''), ...args);
  const warn = (...args) => console.warn(tag('WARN'), ...args);
  const errlog = (...args) => console.error(tag('ERROR'), ...args);

  log('incoming', {
    orgId,
    userId,
    body: {
      courseId,
      title,
      courseSize,
      minutes,
      title_override,
      pass_mark,
      timer_s,
      max_attempts,
      due_at,
      locked_config_type: typeof locked_config,
    },
  });

  if (!userId) {
    warn('unauthorized: missing userId');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // ── Permission check ──────────────────────────────────────────────────────
  const mem = await pool.query(
    `SELECT role FROM org_memberships
      WHERE org_id=$1 AND user_id=$2
        AND role IN ('owner','admin','instructor')`,
    [orgId, userId],
  );
  log('membership', {
    rowCount: mem.rowCount,
    roles: mem.rows?.map((r) => r.role),
  });
  if (!mem.rowCount) {
    warn('forbidden: not owner/admin/instructor');
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    // ── Tier clamp ──────────────────────────────────────────────────────────
    const tierQ = await pool.query(
      `SELECT COALESCE(LOWER(s.tier), 'starter') AS tier
         FROM organizations o
    LEFT JOIN org_subscriptions s ON s.org_id=o.id AND s.active=TRUE
        WHERE o.id=$1
        LIMIT 1`,
      [orgId],
    );
    const tier = tierQ.rows[0]?.tier || 'starter';
    const isStarter = tier === 'starter' || tier === 'start';
    const safeMinutes = isStarter
      ? Math.min(Number(minutes ?? 30), 30)
      : Number(minutes ?? 20);
    log('tier', { tier, isStarter, inputMinutes: minutes, safeMinutes });

    // ── Ensure course (create/lookup) ───────────────────────────────────────
    const course = await ensureCourse({
      courseId,
      title,
      courseSize,
      minutes: safeMinutes,
    });
    const cid = course.id;
    log('course.ensure', {
      ensuredId: cid,
      ensuredTitle: course?.title,
      size: courseSize,
      minutes: safeMinutes,
    });

    // ── Existing invite (for visibility) ────────────────────────────────────
    const existingInviteQ = await pool.query(
      `SELECT invite_code FROM org_course_assignments WHERE org_id=$1 AND course_id=$2 LIMIT 1`,
      [orgId, cid],
    );
    const existingInvite = existingInviteQ.rows[0]?.invite_code || null;
    log('existingInvite', {
      exists: Boolean(existingInvite),
      invite_code: existingInvite,
    });

    // ── Upsert assignment (includes locked_config) ──────────────────────────
    const { randomBytes } = await import('crypto');
    const invite = randomBytes(10).toString('base64url');
    const lockedJSON =
      locked_config && typeof locked_config === 'object'
        ? JSON.stringify(locked_config)
        : null;

    const text = `
      INSERT INTO org_course_assignments
        (
          org_id,
          course_id,
          title_override,
          pass_mark,
          timer_s,
          max_attempts,
          due_at,
          locked_config,
          invite_code,
          created_by,
          created_at,
          updated_at,
          source_kind
        )
      VALUES
        (
          $1, $2, $3, $4, $5, $6, $7, $8,
          COALESCE(
            (SELECT invite_code FROM org_course_assignments WHERE org_id=$1 AND course_id=$2),
            $9
          ),
          $10, NOW(), NOW(),
          'robot' 
        )
      ON CONFLICT (org_id, course_id) DO UPDATE
         SET title_override = COALESCE(EXCLUDED.title_override, org_course_assignments.title_override),
             pass_mark      = COALESCE(EXCLUDED.pass_mark,      org_course_assignments.pass_mark),
             timer_s        = COALESCE(EXCLUDED.timer_s,        org_course_assignments.timer_s),
             max_attempts   = COALESCE(EXCLUDED.max_attempts,   org_course_assignments.max_attempts),
             due_at         = COALESCE(EXCLUDED.due_at,         org_course_assignments.due_at),
             locked_config  = COALESCE(EXCLUDED.locked_config,  org_course_assignments.locked_config),
              source_kind    = COALESCE(EXCLUDED.source_kind,    org_course_assignments.source_kind),
             updated_at     = NOW()
      RETURNING *;
    `;

    const values = [
      orgId, // $1
      cid, // $2
      title_override || null, // $3
      pass_mark || null, // $4
      timer_s || null, // $5
      max_attempts, // $6
      due_at || null, // $7
      lockedJSON, // $8
      invite, // $9 (fallback if none exists)
      userId, // $10
    ];

    // Verbose bind logging + sanity check
    const placeholders = [...text.matchAll(/\$(\d+)/g)].map((m) =>
      Number(m[1]),
    );
    const maxIndex = placeholders.length ? Math.max(...placeholders) : 0;
    log('sql.binds', {
      maxPlaceholder: maxIndex,
      uniquePlaceholders: Array.from(new Set(placeholders)).sort(
        (a, b) => a - b,
      ),
      valuesCount: values.length,
    });
    values.forEach((v, i) => log(`sql.bind $${i + 1}`, v));

    if (maxIndex !== values.length) {
      throw new Error(
        `SQL placeholder/value count mismatch: ${maxIndex} vs ${values.length}`,
      );
    }

    const q = await pool.query({
      text,
      values,
      name: 'ensure_shareable_assignment_v2',
    });
    const assignment = q.rows[0];

    log('assignment.upserted', {
      id: assignment?.id,
      org_id: assignment?.org_id,
      course_id: assignment?.course_id,
      title_override: assignment?.title_override ?? null,
      pass_mark: assignment?.pass_mark ?? null,
      timer_s: assignment?.timer_s ?? null,
      max_attempts: assignment?.max_attempts ?? null,
      due_at: assignment?.due_at ?? null,
      invite_code: assignment?.invite_code,
      locked_config_present: Boolean(assignment?.locked_config),
      created_by: assignment?.created_by,
      created_at: assignment?.created_at,
      updated_at: assignment?.updated_at,
      reusedInvite: existingInvite
        ? assignment?.invite_code === existingInvite
        : false,
    });

    // Build invite URL
    const base =
      process.env.WEB_BASE_URL ||
      req.get('origin') ||
      req.get('referer') ||
      'http://localhost:5173';
    const inviteUrl = `${base.replace(/\/$/, '')}/org/join/${assignment.invite_code}`;
    log('inviteUrl', { inviteUrl });

    return res.json({
      ok: true,
      courseId: cid,
      courseTitle: course.title,
      assignment,
      inviteUrl,
    });
  } catch (e) {
    errlog('failure', {
      message: e?.message,
      code: e?.code,
      severity: e?.severity,
      stack: e?.stack,
    });
    if (
      e?.message === 'COURSE_NOT_FOUND' ||
      e?.message === 'TITLE_REQUIRED' ||
      e?.message === 'INVALID_SIZE'
    ) {
      return res.status(400).json({ message: e.message });
    }
    return res.status(500).json({ message: 'Failed to ensure assignment' });
  }
}

// GET /api/orgs/attempts/:attemptId/meta   (strict to current user)
export async function getAttemptMeta(req, res) {
  const userId = req.user?.id;
  const { attemptId } = req.params;
  if (!userId || !attemptId)
    return res.status(400).json({ message: 'Bad request' });

  const q = await pool.query(
    `SELECT
       qa.*,
       a.id             AS assignment_id,
       a.course_id,
       a.title_override,
       a.pass_mark      AS assign_pass_mark,
       a.timer_s        AS assign_timer_s,
       a.locked_config,
       o.default_pass_mark AS org_pass_mark,
       o.quiz_time_limit_s AS org_timer_s
     FROM org_quiz_attempts qa
     JOIN org_course_assignments a ON a.id = qa.assignment_id
     JOIN organizations o          ON o.id = qa.org_id
     WHERE qa.id = $1 AND qa.user_id = $2
     LIMIT 1`,
    [attemptId, userId],
  );
  if (!q.rowCount)
    return res.status(404).json({ message: 'Attempt not found' });

  const row = q.rows[0];
  const locked_config = safeParseJSON(row.locked_config);
  const passMark =
    row.pass_mark ?? row.assign_pass_mark ?? row.org_pass_mark ?? 70;
  const timer_s = row.assign_timer_s ?? row.org_timer_s ?? 900;

  return res.json({
    ok: true,
    meta: {
      attemptId: row.id,
      assignmentId: row.assignment_id,
      courseId: row.course_id,
      locked_config,
      passMark,
      timer_s,
      due_at: row.due_at,
      status: row.status,
      org_id: row.org_id,
      title_override: row.title_override || null,
    },
  });
}

function safeParseJSON(v) {
  if (!v) return null;
  try {
    return typeof v === 'object' ? v : JSON.parse(v);
  } catch {
    return null;
  }
}

// GET /api/orgs/assignments/:assignmentId/mine  (find or lazily create an attempt)
export async function getMyAttemptForAssignment(req, res) {
  const userId = req.user?.id;
  const { assignmentId } = req.params;
  if (!userId || !assignmentId)
    return res.status(400).json({ message: 'Bad request' });

  // find assignment + org defaults
  const a = await pool.query(
    `SELECT a.*, o.default_pass_mark, o.quiz_time_limit_s
       FROM org_course_assignments a
       JOIN organizations o ON o.id = a.org_id
      WHERE a.id = $1`,
    [assignmentId],
  );
  if (!a.rowCount)
    return res.status(404).json({ message: 'Assignment not found' });
  const assign = a.rows[0];

  // find existing attempt for this user
  const e = await pool.query(
    `SELECT *
     FROM org_quiz_attempts
    WHERE assignment_id=$1 AND user_id=$2
    ORDER BY created_at DESC
    LIMIT 1`,
    [assignmentId, userId],
  );

  if (!e.rowCount) {
    const locked_config = safeParseJSON(assign.locked_config);
    const passMark = assign.pass_mark ?? assign.default_pass_mark ?? 70;
    const timer_s = assign.timer_s ?? assign.quiz_time_limit_s ?? 900;

    return res.json({
      ok: true,
      meta: {
        attemptId: null,
        assignmentId: assign.id,
        courseId: assign.course_id,
        locked_config,
        passMark,
        timer_s,
        due_at: assign.due_at ?? null, // ← was null
        status: 'none',
        org_id: assign.org_id,
        title_override: assign.title_override || null,
      },
    });
  }

  const attempt = e.rows[0];
  // Re-hydrate full meta (including org timers) for the active/last attempt
  const q = await pool.query(
    `SELECT
       qa.*,
       a.id             AS assignment_id,
       a.course_id,
       a.title_override,
       a.pass_mark      AS assign_pass_mark,
       a.timer_s        AS assign_timer_s,
       a.locked_config,
       o.default_pass_mark AS org_pass_mark,
       o.quiz_time_limit_s AS org_timer_s
     FROM org_quiz_attempts qa
     JOIN org_course_assignments a ON a.id = qa.assignment_id
     JOIN organizations o          ON o.id = qa.org_id
     WHERE qa.id = $1
     LIMIT 1`,
    [attempt.id],
  );
  const row = q.rows[0];
  const locked_config = safeParseJSON(row.locked_config);
  const passMark =
    row.pass_mark ?? row.assign_pass_mark ?? row.org_pass_mark ?? 70;
  const timer_s = row.assign_timer_s ?? row.org_timer_s ?? 900;

  return res.json({
    ok: true,
    meta: {
      attemptId: row.id,
      assignmentId: row.assignment_id,
      courseId: row.course_id,
      locked_config,
      passMark,
      timer_s,
      due_at: row.due_at,
      status: row.status,
      org_id: row.org_id,
      title_override: row.title_override || null,
    },
  });
}

// POST /api/orgs/attempts/start  { assignmentId }

export async function startAttempt(req, res) {
  const userId = req.user?.id;
  const { assignmentId } = req.body || {};
  if (!userId || !assignmentId)
    return res.status(400).json({ message: 'Bad request' });

  // load assignment + org defaults
  const { rows: aRows } = await pool.query(
    `SELECT a.*, o.quiz_time_limit_s, o.default_pass_mark, o.allow_retry
       FROM org_course_assignments a
       JOIN organizations o ON o.id = a.org_id
      WHERE a.id=$1::uuid`,
    [assignmentId],
  );
  if (!aRows.length)
    return res.status(404).json({ message: 'Assignment not found' });
  const a = aRows[0];

  // ensure org membership
  const mem = await pool.query(
    `SELECT 1 FROM org_memberships WHERE org_id=$1::uuid AND user_id=$2 LIMIT 1`,
    [a.org_id, userId],
  );
  if (!mem.rowCount) return res.status(403).json({ message: 'Forbidden' });

  await pool.query('BEGIN');
  try {
    // lock (assignmentId,userId)
    await pool.query(
      `SELECT pg_advisory_xact_lock(
         ('x'||substr(md5($1::text),1,8))::bit(32)::int,
         ('x'||substr(md5($2::text),1,8))::bit(32)::int
       )`,
      [assignmentId, String(userId)],
    );

    // idempotent: reuse active & unexpired
    const { rows: activeRows } = await pool.query(
      `SELECT id, attempt_no, due_at, pass_mark
         FROM org_quiz_attempts
        WHERE assignment_id=$1::uuid AND user_id=$2 AND status='active'`,
      [assignmentId, userId],
    );
    if (activeRows.length) {
      const act = activeRows[0];
      const remainingMs = Math.max(
        0,
        new Date(act.due_at).getTime() - Date.now(),
      );
      if (remainingMs > 0) {
        await pool.query('COMMIT');
        return res.json({
          ok: true,
          attemptId: act.id,
          attemptNo: act.attempt_no,
          remainingMs,
        });
      } else {
        await pool.query(
          `UPDATE org_quiz_attempts SET status='expired' WHERE id=$1`,
          [act.id],
        );
      }
    }

    // attempts used for limit (submitted+expired)
    const { rows: usedRows } = await pool.query(
      `SELECT COUNT(*)::int AS used
         FROM org_quiz_attempts
        WHERE assignment_id=$1::uuid AND user_id=$2
          AND status IN ('submitted','expired')`,
      [assignmentId, userId],
    );
    const used = usedRows[0].used;
    const maxAttempts = a.max_attempts || 1;
    if (used >= maxAttempts) {
      await pool.query('ROLLBACK');
      return res
        .status(409)
        .json({ code: 'ATTEMPTS_EXHAUSTED', message: 'No attempts left.' });
    }

    // ✅ get latest attempt_no row and lock THAT row (legal with FOR UPDATE)
    const { rows: lastRows } = await pool.query(
      `SELECT attempt_no
         FROM org_quiz_attempts
        WHERE assignment_id=$1::uuid AND user_id=$2
        ORDER BY attempt_no DESC
        LIMIT 1
        FOR UPDATE`,
      [assignmentId, userId],
    );
    const lastNo = lastRows[0]?.attempt_no ?? 0;
    const nextNo = lastNo + 1;

    const secs = a.timer_s || a.quiz_time_limit_s || 900;
    const dueAt = new Date(Date.now() + secs * 1000);
    const passMark = a.pass_mark || a.default_pass_mark || 70;

    // insert new active attempt (protect with ON CONFLICT anyway)
    const ins = await pool.query(
      `INSERT INTO org_quiz_attempts
         (org_id, assignment_id, user_id, attempt_no, status, due_at, pass_mark)
       VALUES ($1::uuid,$2::uuid,$3,$4,'active',$5,$6)
       ON CONFLICT (assignment_id, user_id, attempt_no) DO NOTHING
       RETURNING id, attempt_no, due_at`,
      [a.org_id, assignmentId, userId, nextNo, dueAt, passMark],
    );

    let attemptRow = ins.rows[0];
    if (!attemptRow) {
      // fallback: return the latest row (should be the one created by a concurrent txn)
      const { rows: fb } = await pool.query(
        `SELECT id, attempt_no, due_at
           FROM org_quiz_attempts
          WHERE assignment_id=$1::uuid AND user_id=$2
          ORDER BY attempt_no DESC
          LIMIT 1`,
        [assignmentId, userId],
      );
      attemptRow = fb[0];
    }

    await pool.query('COMMIT');

    const remainingMs = Math.max(
      0,
      new Date(attemptRow.due_at).getTime() - Date.now(),
    );
    return res.json({
      ok: true,
      attemptId: attemptRow.id,
      attemptNo: attemptRow.attempt_no,
      remainingMs,
    });
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('[attempts/start] failed', e);
    return res.status(500).json({ message: 'Failed to start attempt' });
  }
}

/* ───────── ENTERPRISE-gated branding update (keeps your route: PUT /:orgId/branding) ───────── */
export async function updateOrgBranding(req, res) {
  const { orgId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Org exists?
  const exists = await pool.query(`SELECT 1 FROM organizations WHERE id=$1`, [
    orgId,
  ]);
  if (!exists.rowCount) {
    return res.status(404).json({ message: 'Org not found' });
  }

  // Load membership + role (owner/admin/instructor/learner etc.)
  const mem = await pool.query(
    `SELECT role
       FROM org_memberships
      WHERE org_id=$1 AND user_id=$2
      LIMIT 1`,
    [orgId, userId],
  );
  if (!mem.rowCount) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const role = String(mem.rows[0].role || '').toLowerCase();

  const cols = await getOrgColumns();
  const body = req.body || {};

  // ─────────────────────────────────────────
  // 1) Instructor path: ONLY instructor_signature_url
  // ─────────────────────────────────────────
  if (role === 'instructor') {
    if (!cols.has('instructor_signature_url')) {
      return res.status(400).json({
        message:
          'instructor_signature_url is not supported on this organization',
      });
    }

    const { instructor_signature_url } = body || {};
    if (!instructor_signature_url) {
      return res
        .status(400)
        .json({ message: 'instructor_signature_url is required' });
    }

    const setClauses = ['instructor_signature_url = $1'];
    const vals = [instructor_signature_url];

    if (cols.has('updated_at')) {
      setClauses.push('updated_at = NOW()');
    }

    const { rows } = await pool.query(
      `UPDATE organizations
          SET ${setClauses.join(', ')}
        WHERE id = $${vals.length + 1}
        RETURNING *`,
      [...vals, orgId],
    );

    return res.json(rows[0]);
  }

  // ─────────────────────────────────────────
  // 2) Owner/admin path: full branding update (your original logic)
  // ─────────────────────────────────────────
  if (!['owner', 'admin'].includes(role)) {
    // learners and any other roles are blocked
    return res.status(403).json({ message: 'Forbidden' });
  }

  const baseKeys = [
    'name',
    'logo_url',
    'signature_url',
    'instructor_signature_url',
    'bursar_signature_url',
    'certificate_title',
    'default_pass_mark',
    'quiz_time_limit_s',
    'allow_retry',
  ].filter((k) => cols.has(k));

  const extraKeys = ['email_domain', 'webhook_url', 'webhook_enabled'].filter(
    (k) => cols.has(k),
  );

  // NEW: school contact details (only if columns exist)
  const contactKeys = [
    'address_line1',
    'address_line2',
    'phone_number',
    'contact_email',
    'website_url',
  ].filter((k) => cols.has(k));

  const updates = {
    ...pickDefined(body, baseKeys),
    ...pickDefined(body, extraKeys),
    ...pickDefined(body, contactKeys),
  };

  const setClauses = [];
  const vals = [];

  for (const [k, v] of Object.entries(updates)) {
    setClauses.push(`${k} = $${vals.length + 1}`);
    vals.push(v);
  }

  // Auto-create webhook_secret if relevant fields are being set and column exists
  if (
    (body.webhook_url !== undefined || body.webhook_enabled !== undefined) &&
    cols.has('webhook_secret')
  ) {
    setClauses.push(
      `webhook_secret = COALESCE(webhook_secret, $${vals.length + 1})`,
    );
    vals.push(crypto.randomBytes(32).toString('hex'));
  }

  // Always bump updated_at if column exists
  if (cols.has('updated_at')) {
    setClauses.push('updated_at = NOW()');
  }

  if (!setClauses.length) {
    // Nothing to change → just return the row
    const { rows: r } = await pool.query(
      `SELECT * FROM organizations WHERE id=$1`,
      [orgId],
    );
    return res.json(r[0]);
  }

  const { rows: r2 } = await pool.query(
    `UPDATE organizations
        SET ${setClauses.join(', ')}
      WHERE id = $${vals.length + 1}
      RETURNING *`,
    [...vals, orgId],
  );
  return res.json(r2[0]);
}

/** POST /accept  (auth) – join assignment; enforce domain restriction here */
export async function acceptInvite(req, res) {
  const userId = req.user?.id;
  let userEmail = (req.user?.email || '').toLowerCase(); // may be empty; we’ll fallback below
  const { code } = req.body || {};

  // ── Correlation / logging helpers ─────────────────────────────────────────
  let rid = req.get?.('x-request-id') || req.headers?.['x-request-id'] || null;
  if (!rid) {
    try {
      const { randomUUID, randomBytes } = await import('crypto');
      rid =
        (typeof randomUUID === 'function' && randomUUID()) ||
        randomBytes(6).toString('hex');
    } catch {
      rid = Math.random().toString(36).slice(2, 10);
    }
  }
  const tag = (m) => `[org.acceptInvite ${rid}] ${m}`;
  const log = (...a) => console.log(tag(''), ...a);
  const warn = (...a) => console.warn(tag('WARN'), ...a);
  const err = (...a) => console.error(tag('ERROR'), ...a);

  // ── Fast param check ──────────────────────────────────────────────────────
  if (!userId || !code) {
    warn('bad request', { userId: !!userId, hasCode: !!code });
    return res.status(400).json({ message: 'Bad request' });
  }
  log('begin', { userId, code });

  try {
    // 1) Resolve assignment + org policy/defaults (no txn needed)
    const q = await pool.query(
      `SELECT 
         a.*,
         o.name                   AS org_name,
         o.email_domain           AS org_email_domain,
         o.default_pass_mark      AS org_default_pass_mark,
         o.quiz_time_limit_s      AS org_quiz_time_limit_s
       FROM org_course_assignments a
       JOIN organizations o ON o.id = a.org_id
      WHERE a.invite_code = $1
      LIMIT 1`,
      [code],
    );
    if (!q.rowCount) {
      warn('invite not found', { code });
      return res.status(404).json({ message: 'Invite not found' });
    }
    const assignment = q.rows[0];

    // 1a) Ensure we actually have the user’s email (fallback to DB if auth payload lacked it)
    if (!userEmail) {
      try {
        const { rows: uRows } = await pool.query(
          'SELECT email FROM users WHERE id=$1',
          [userId],
        );
        userEmail = (uRows[0]?.email || '').toLowerCase();
      } catch (e) {
        warn('failed to fetch user email fallback', {
          userId,
          err: e?.message,
        });
      }
    }

    // 2) Domain restriction (only enforced if domains configured)
    const allowedDomains = parseDomains(assignment.org_email_domain || '');
    if (allowedDomains.length > 0) {
      if (!userEmail) {
        warn('domain-restricted but user has no email', {
          org_id: assignment.org_id,
        });
        return res
          .status(400)
          .json({ message: 'Email required for this organization' });
      }
      if (!emailMatches(userEmail, allowedDomains)) {
        warn('email domain blocked', { email: userEmail, allowedDomains });
        return res.status(403).json({
          message: 'Your email domain is not allowed for this organization',
          code: 'EMAIL_DOMAIN_BLOCKED',
        });
      }
    }

    // 3) Transaction + org advisory lock — use a SINGLE client for the whole txn
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      log('tx:BEGIN');

      await client.query(
        `SELECT pg_advisory_xact_lock(
           ('x'||substr(md5($1::text),1,8))::bit(32)::int,
           ('x'||substr(md5($1::text),9,8))::bit(32)::int
         )`,
        [assignment.org_id],
      );
      log('advisory lock acquired', { org_id: assignment.org_id });

      // 4) Seat limits (learners only). Staff do not count against seats.
      const seatLimit = await getSeatLimit(client, assignment.org_id).catch(
        (e) => {
          err('getSeatLimit failed', { message: e?.message, code: e?.code });
          return 50; // safe fallback
        },
      );

      const learnersQ = await client.query(
        `SELECT COUNT(*)::int AS c
           FROM org_memberships
          WHERE org_id=$1::uuid AND role='learner'`,
        [assignment.org_id],
      );
      const learnersUsed = learnersQ.rows[0]?.c ?? 0;

      const existing = await client.query(
        `SELECT role
           FROM org_memberships
          WHERE org_id=$1::uuid AND user_id=$2
          LIMIT 1`,
        [assignment.org_id, userId],
      );
      const isAlreadyMember = !!existing.rowCount;
      const existingRole = existing.rows[0]?.role || null;
      const isStaff = ['owner', 'admin', 'instructor'].includes(
        (existingRole || '').toLowerCase(),
      );

      log('seats', {
        seatLimit,
        learnersUsed,
        isAlreadyMember,
        existingRole,
        isStaff,
      });

      if (!isStaff && !isAlreadyMember && learnersUsed >= seatLimit) {
        await client.query('ROLLBACK');
        warn('seat limit reached', { seatLimit, learnersUsed });
        return res.status(403).json({
          ok: false,
          message:
            'Seat limit reached. Upgrade your plan to add more learners.',
          code: 'SEAT_LIMIT_REACHED',
        });
      }

      // 5) Email-based upgrade (attach pending invite rows to this user, keep staff roles intact)
      if (userEmail) {
        const up = await client.query(
          `UPDATE org_memberships
              SET user_id   = COALESCE(user_id, $2),
                  role      = CASE
                               WHEN role IN ('owner','admin','instructor') THEN role
                               ELSE 'learner'
                             END,
                  joined_at = COALESCE(joined_at, NOW()),
                  invited_at= COALESCE(invited_at, NOW())
            WHERE org_id=$1::uuid
              AND LOWER(COALESCE(email,''))=$3`,
          [assignment.org_id, userId, userEmail],
        );
        log('email upgrade', { userEmail, updated: up.rowCount });
      } else {
        log('email upgrade skipped (no email)');
      }

      // 6) Ensure org membership row (don’t downgrade staff)
      const insMem = await client.query(
        `INSERT INTO org_memberships (org_id, user_id, role, invited_by, invited_at, joined_at)
         VALUES ($1::uuid,$2,'learner',$3,NOW(),NOW())
         ON CONFLICT (org_id, user_id) DO UPDATE
           SET role = CASE
                       WHEN org_memberships.role IN ('owner','admin','instructor') THEN org_memberships.role
                       ELSE 'learner'
                      END,
               joined_at = COALESCE(org_memberships.joined_at, EXCLUDED.joined_at)`,
        [assignment.org_id, userId, assignment.created_by],
      );
      log('membership upsert', { insertedOrUpdated: insMem.rowCount });

      // 7) Ensure assignment enrollment (idempotent)
      await client.query(
        `INSERT INTO org_assignment_enrollments (assignment_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (assignment_id, user_id) DO NOTHING`,
        [assignment.id, userId],
      );
      log('assignment enrollment ensured');

      await client.query('COMMIT');
      log('tx:COMMIT');
    } catch (txErr) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      err('tx failed', { message: txErr?.message });
      return res.status(500).json({ message: 'Failed to accept invite' });
    } finally {
      client.release();
    }

    // 8) Compute effective assessment policy for the response
    const passMark =
      assignment.pass_mark ?? assignment.org_default_pass_mark ?? 70;
    const timerS =
      assignment.timer_s ?? assignment.org_quiz_time_limit_s ?? 900;
      const lockedConfig = safeParseJSON(assignment.locked_config);

    const payload = {
      ok: true,
      enrollment: {
        orgId: assignment.org_id,
        assignmentId: assignment.id,
        courseId: assignment.course_id,
        userId,
        passMark,
        timerS,
        maxAttempts: assignment.max_attempts ?? 1,
        dueAt: assignment.due_at ?? null,
         lockedConfig,
         locked_config: lockedConfig,
      },
    };
    log('success', payload.enrollment);
    return res.json(payload);
  } catch (e) {
    err('failed', {
      message: e?.message,
      code: e?.code,
      severity: e?.severity,
      detail: e?.detail,
      constraint: e?.constraint,
      stack: e?.stack,
    });
    return res.status(500).json({ message: 'Failed to accept invite' });
  }
}

export async function resolveInvite(req, res) {
  const { code } = req.params;

  const { rows } = await pool.query(
    `
    SELECT
      a.id                    AS assignment_id,
      a.course_id,
      a.title_override,

      -- ✅ course title from courses (works for both toplist + sandbox)
      COALESCE(NULLIF(BTRIM(a.title_override), ''), NULLIF(BTRIM(c.title), ''), 'Assigned Course') AS course_title,

      COALESCE(a.pass_mark, o.default_pass_mark)              AS pass_mark,
      COALESCE(a.timer_s, o.quiz_time_limit_s)                AS quiz_time_limit_s,
      a.max_attempts,
      a.due_at,
      a.locked_config,

      o.id                    AS org_id,
      o.name                  AS org_name,
      o.logo_url,
      o.signature_url,
      o.instructor_signature_url,
      o.certificate_title,
      o.email_domain
    FROM org_course_assignments a
    JOIN organizations o ON o.id = a.org_id
    LEFT JOIN courses c ON c.id = a.course_id
    WHERE a.invite_code = $1
    LIMIT 1
    `,
    [code],
  );

  if (!rows.length) return res.status(404).json({ message: 'Invite not found' });

  const r = rows[0];
  const lockedConfig = safeParseJSON(r.locked_config);
  const domains = parseDomains(r.email_domain || '');

  return res.json({
    ok: true,
    assignment: {
      id: r.assignment_id,
      course_id: r.course_id,
      title: r.title_override ?? null,

      // ✅ this fixes your OrgInviteLanding fallback snapshot
      course_title: r.course_title,
      courseTitle: r.course_title,

      locked_config: lockedConfig,
      lockedConfig,
      max_attempts: r.max_attempts ?? null,
      due_at: r.due_at ?? null,
    },
    org: {
      id: r.org_id,
      name: r.org_name,
      branding: {
        logo_url: r.logo_url ?? null,
        signature_url: r.signature_url ?? null,
        instructor_signature_url: r.instructor_signature_url ?? null,
        certificate_title: r.certificate_title ?? null,
      },
    },
    policy: {
      domain_restricted: domains.length > 0,
      allowed_domains: domains,
      assessment: {
        default_pass_mark: r.pass_mark ?? null,
        quiz_time_limit_s: r.quiz_time_limit_s ?? null,
      },
    },

    // back-compat fields (what your UI already checks)
    course_id: r.course_id,
    courseId: r.course_id,
    course_title: r.course_title,
    pass_mark: r.pass_mark ?? null,
    quiz_time_limit_s: r.quiz_time_limit_s ?? null,
    timer_s: r.quiz_time_limit_s ?? null,
    max_attempts: r.max_attempts ?? null,
    due_at: r.due_at ?? null,
    org_name: r.org_name ?? null,
    locked_config: lockedConfig,
    lockedConfig,
  });
}


export async function getOrgLearnersProgress(req, res) {
  const userId = req.user?.id;
  const { orgId } = req.params;
  const { q = '', limit = 50, cursor } = req.query || {};

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  // staff gate
  const mem = await pool.query(
    `SELECT 1 FROM org_memberships
      WHERE org_id=$1 AND user_id=$2 AND role IN ('owner','admin','instructor')
      LIMIT 1`,
    [orgId, userId],
  );
  if (!mem.rowCount) return res.status(403).json({ message: 'Forbidden' });

  // total assignments in org (used to compute % progress)
  const taQ = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM org_course_assignments
      WHERE org_id=$1`,
    [orgId],
  );
  const totalAssignments = taQ.rows[0]?.total ?? 0;

  // basic pagination using an integer offset cursor
  const pageSize = Math.max(1, Math.min(Number(limit) || 50, 200));
  const offset = Math.max(0, Number(cursor) || 0);

  // optional search on name/email
  const hasQ = String(q || '').trim().length > 0;
  const qLike = `%${String(q || '')
    .trim()
    .toLowerCase()}%`;

  // aggregate progress WITHOUT exposing answers/transcripts
  const { rows } = await pool.query(
    `
    WITH learners AS (
      SELECT u.id AS user_id, COALESCE(u.name,'') AS name, LOWER(u.email) AS email
        FROM org_memberships m
        JOIN users u ON u.id = m.user_id
       WHERE m.org_id = $1 AND m.role = 'learner'
         ${hasQ ? `AND (LOWER(u.name) LIKE $4 OR LOWER(u.email) LIKE $4)` : ``}
       ORDER BY COALESCE(u.name, u.email) ASC
       OFFSET $2 LIMIT $3
    )
    SELECT
      l.user_id,
      l.name,
      l.email,
      COUNT(qa.*)::int                                      AS attempts,
      COALESCE(ROUND(AVG(qa.score_pct)::numeric, 2), 0)::float AS avg_score,
      SUM(CASE WHEN qa.passed THEN 1 ELSE 0 END)::int       AS passes,
      COUNT(DISTINCT CASE WHEN qa.passed THEN qa.assignment_id END)::int AS completed_assignments,
      MAX(qa.submitted_at)                                  AS last_submit_at
    FROM learners l
    LEFT JOIN org_quiz_attempts qa
      ON qa.org_id = $1 AND qa.user_id = l.user_id
    GROUP BY l.user_id, l.name, l.email
    ORDER BY last_submit_at DESC NULLS LAST, name ASC
    `,
    hasQ ? [orgId, offset, pageSize, qLike] : [orgId, offset, pageSize],
  );

  // compute progress_pct per row on the server for convenience
  const data = rows.map((r) => ({
    user_id: r.user_id,
    name: r.name,
    email: r.email,
    attempts: Number(r.attempts || 0),
    passes: Number(r.passes || 0),
    avg_score: r.avg_score !== null ? Number(r.avg_score) : null,
    completed_assignments: Number(r.completed_assignments || 0),
    last_submit_at: r.last_submit_at
      ? new Date(r.last_submit_at).toISOString()
      : null,
    progress_pct:
      totalAssignments > 0
        ? Math.round(
            (Number(r.completed_assignments || 0) * 100) / totalAssignments,
          )
        : 0,
  }));

  const next_cursor =
    rows.length === pageSize ? String(offset + pageSize) : null;

  return res.json({
    ok: true,
    total_assignments: totalAssignments,
    data,
    next_cursor,
  });
}

// ─────────────────────────────────────────────────────────
// ROSTER: GET /api/orgs/:orgId/roster
export async function getOrgRoster(req, res) {
  const userId = req.user?.id;
  const { orgId } = req.params;

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  // must be a member of org
  const mem = await pool.query(
    `SELECT 1 FROM org_memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId],
  );
  if (!mem.rowCount) return res.status(403).json({ message: 'Forbidden' });

  try {
    // ✅ resolve fee table (org_instructors vs org_instructor_profiles, etc)
    const feeTable = await resolveInstructorFeeTable(pool);

    // whitelist join/selection only (prevents SQL injection)
    const feeJoin = feeTable
      ? `LEFT JOIN ${feeTable} fi ON fi.org_id = m.org_id AND fi.user_id = m.user_id`
      : ``;

    const feeSelect = feeTable
      ? `COALESCE(fi.can_access_fees, false) AS can_access_fees`
      : `false AS can_access_fees`;

    // Pull memberships + user + learner + instructor profiles in one query
    const q = await pool.query(
      `
      SELECT
        m.user_id         AS id,
        m.role,
        u.name,
        u.email,

        -- ✅ fee access (only meaningful for instructors; safe default false)
        ${feeSelect},

        -- learner profile
        lp.admission_code,
        lp.class_label,
        lp.guardian_email,
        lp.temp_password AS learner_temp_password,

        -- instructor profile
        ip.staff_code,
        ip.subject,
        ip.temp_password AS instructor_temp_password
      FROM org_memberships m
      JOIN users u
        ON u.id = m.user_id
      LEFT JOIN org_learner_profiles lp
        ON lp.org_id = m.org_id
       AND lp.user_id = m.user_id
      LEFT JOIN org_instructor_profiles ip
        ON ip.org_id = m.org_id
       AND ip.user_id = m.user_id
      ${feeJoin}
      WHERE m.org_id = $1
      ORDER BY
        CASE
          WHEN m.role IN ('owner','admin','instructor') THEN 0
          ELSE 1
        END,
        COALESCE(lp.class_label, '') ASC,
        COALESCE(lp.admission_code, '') ASC,
        COALESCE(u.name, u.email, '') ASC
      `,
      [orgId],
    );

    const instructors = [];
    const learners = [];

    for (const r of q.rows) {
      const base = {
        id: r.id,
        name: r.name,
        email: r.email,
      };

      const role = String(r.role || '').toLowerCase();

      // staff: owner/admin/instructor
      if (['owner', 'admin', 'instructor'].includes(role)) {
        instructors.push({
          ...base,
          staff_code: r.staff_code || null,
          subject: r.subject || null,
          temp_password: r.instructor_temp_password || null,

          // ✅ this is what your UI uses after refresh
          can_access_fees: r.can_access_fees === true,
        });
      }

      // learners: include profile fields + temp_password
      if (role === 'learner') {
        learners.push({
          ...base,
          admission_code: r.admission_code || null,
          class_label: r.class_label || null,
          guardian_email: r.guardian_email || null,
          temp_password: r.learner_temp_password || null,
        });
      }
    }

    return res.json({ instructors, learners });
  } catch (e) {
    console.error('[getOrgRoster] failed', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

// ─────────────────────────────────────────────────────────
// CREATE ORG INVITE: POST /api/orgs/:orgId/invites
// body: { role: 'instructor'|'learner', email?: string, expiresSec?: number }
// returns { invite_code, invite_url }
// ─────────────────────────────────────────────────────────
export async function createOrgInvite(req, res) {
  const userId = req.user?.id;
  const { orgId } = req.params;
  const { role, email, expiresSec } = req.body || {};
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  // owner/admin only (let owners/admins invite both; instructors cannot invite instructors)
  const mem = await pool.query(
    `SELECT role FROM org_memberships WHERE org_id=$1 AND user_id=$2`,
    [orgId, userId],
  );
  if (!mem.rowCount) return res.status(403).json({ message: 'Forbidden' });
  const myRole = String(mem.rows[0].role);
  if (!['owner', 'admin'].includes(myRole))
    return res.status(403).json({ message: 'Forbidden' });

  if (!['instructor', 'learner'].includes(String(role))) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  const { randomBytes } = await import('crypto');
  const code = randomBytes(10).toString('base64url');
  const expires_at = expiresSec
    ? new Date(Date.now() + Number(expiresSec) * 1000)
    : null;

  const ins = await pool.query(
    `INSERT INTO org_invites (org_id, role, code, email, created_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING code`,
    [orgId, role, code, email || null, userId, expires_at],
  );

  const base =
    process.env.WEB_BASE_URL ||
    req.get('origin') ||
    req.get('referer') ||
    'http://localhost:5173';

  const invite_url = `${String(base).replace(/\/$/, '')}/org/join/${ins.rows[0].code}`;
  res.json({ ok: true, invite_code: ins.rows[0].code, invite_url });
}

// ─────────────────────────────────────────────────────────
// ACCEPT ORG INVITE (membership): POST /api/orgs/accept
// body: { code }
// NOTE: you already have acceptInvite for assignment links.
// This one handles membership invites created above.
// ─────────────────────────────────────────────────────────
export async function acceptOrgMembershipInvite(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ message: 'Missing code' });

  const iv = await pool.query(
    `SELECT * FROM org_invites WHERE code=$1 LIMIT 1`,
    [code],
  );
  if (!iv.rowCount)
    return res.status(404).json({ message: 'Invite not found' });
  const invite = iv.rows[0];

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ message: 'Invite expired' });
  }

  // idempotent: if already a member, just mark accepted fields
  const already = await pool.query(
    `SELECT 1 FROM org_memberships WHERE org_id=$1 AND user_id=$2`,
    [invite.org_id, userId],
  );

  await pool.query('BEGIN');
  try {
    if (!already.rowCount) {
      // seat limit enforcement for learners only
      if (invite.role === 'learner') {
        const limit = await getSeatLimit(pool, invite.org_id);
        const usedQ = await pool.query(
          `SELECT COUNT(*)::int AS used FROM org_memberships WHERE org_id=$1 AND role='learner'`,
          [invite.org_id],
        );
        const used = usedQ.rows[0]?.used ?? 0;
        if (used >= limit) {
          await pool.query('ROLLBACK');
          return res.status(409).json({ message: 'Seat limit reached' });
        }
      }

      await pool.query(
        `INSERT INTO org_memberships (org_id, user_id, role, invited_by, joined_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (org_id, user_id) DO NOTHING`,
        [invite.org_id, userId, invite.role, invite.created_by],
      );
    }

    await pool.query(
      `UPDATE org_invites SET accepted_by=$1, accepted_at=NOW() WHERE id=$2`,
      [userId, invite.id],
    );

    await pool.query('COMMIT');
    res.json({ ok: true, orgId: invite.org_id, role: invite.role });
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('[acceptOrgMembershipInvite]', e);
    res.status(500).json({ message: 'Failed to accept invite' });
  }
}

export async function removeOrgMember(req, res) {
  const actorId = req.user?.id;
  const { orgId, userId } = req.params;
  if (!actorId) return res.status(401).json({ message: 'Unauthorized' });

  const actorQ = await pool.query(
    `SELECT role FROM org_memberships WHERE org_id=$1 AND user_id=$2`,
    [orgId, actorId],
  );
  if (!actorQ.rowCount) return res.status(403).json({ message: 'Forbidden' });
  const actorRole = String(actorQ.rows[0].role || '').toLowerCase();

  const targetQ = await pool.query(
    `SELECT role FROM org_memberships WHERE org_id=$1 AND user_id=$2`,
    [orgId, userId],
  );
  if (!targetQ.rowCount)
    return res.status(404).json({ message: 'Member not found' });
  const targetRole = String(targetQ.rows[0].role || '').toLowerCase();

  if (targetRole === 'owner') {
    return res
      .status(409)
      .json({ message: 'Owners cannot be removed. Transfer ownership first.' });
  }
  if (
    actorRole === 'admin' &&
    (targetRole === 'admin' || targetRole === 'owner')
  ) {
    return res
      .status(403)
      .json({ message: 'Admins can remove instructors & learners only.' });
  }

  await pool.query('BEGIN');
  try {
    // Drop enrollments in this org
    await pool.query(
      `DELETE FROM org_assignment_enrollments
        WHERE user_id=$1
          AND assignment_id IN (SELECT id FROM org_course_assignments WHERE org_id=$2)`,
      [userId, orgId],
    );

    // End any active attempts (use allowed status)
    await pool.query(
      `UPDATE org_quiz_attempts
          SET status='expired',
              due_at = LEAST(due_at, NOW())
        WHERE user_id=$1 AND org_id=$2 AND status='active'`,
      [userId, orgId],
    );

    // Remove membership
    await pool.query(
      `DELETE FROM org_memberships WHERE org_id=$1 AND user_id=$2`,
      [orgId, userId],
    );

    await pool.query('COMMIT');
    return res.json({ ok: true });
  } catch (e) {
    try {
      await pool.query('ROLLBACK');
    } catch {}
    console.error('[removeOrgMember]', e);
    return res.status(500).json({ message: 'Failed to remove member' });
  }
}

// controllers/orgController.js
export async function setClassTeacherSignature(req, res) {
  const userId = req.user?.id;
  const { orgId, classLabel } = req.params;
  const { signature_url } = req.body || {};

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (!classLabel || !signature_url) {
    return res
      .status(400)
      .json({ message: 'Missing classLabel or signature_url' });
  }

  // staff gate: owner/admin/instructor only
  const mem = await pool.query(
    `SELECT role
       FROM org_memberships
      WHERE org_id=$1 AND user_id=$2
      LIMIT 1`,
    [orgId, userId],
  );
  if (!mem.rowCount) return res.status(403).json({ message: 'Forbidden' });

  await pool.query(
    `UPDATE org_learner_profiles
        SET class_teacher_signature_url = $3
      WHERE org_id=$1 AND class_label=$2`,
    [orgId, classLabel, signature_url],
  );

  return res.json({ ok: true });
}
