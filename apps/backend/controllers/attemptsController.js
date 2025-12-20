// apps/backend/controllers/attemptsController.js
import pool from '../config/db.js';

/* ───────────────────────── helpers ───────────────────────── */
const nowIso = () => new Date().toISOString();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      device_id TEXT,
      status TEXT NOT NULL DEFAULT 'active', -- active | submitted | expired | invalid
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_heartbeat TIMESTAMPTZ,
      remaining_ms INTEGER NOT NULL DEFAULT 0,
      seed INTEGER NOT NULL DEFAULT 0,
      heartbeat_sec INTEGER NOT NULL DEFAULT 15,
      max_backgrounds INTEGER NOT NULL DEFAULT 2,
      max_suspicion INTEGER NOT NULL DEFAULT 5,
      backgrounds INTEGER NOT NULL DEFAULT 0,
      suspicions INTEGER NOT NULL DEFAULT 0,
      meta JSONB DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS idx_org_attempts_user ON org_attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_org_attempts_assign ON org_attempts(assignment_id);

    CREATE TABLE IF NOT EXISTS org_attempt_answers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id UUID NOT NULL REFERENCES org_attempts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      assignment_id TEXT NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      answers JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_org_attempt_answers_att ON org_attempt_answers(attempt_id);
  `);
}

function isOrgUser(u) {
  return Boolean(u?.id); // tighten if you have org-specific roles
}

/* ───────────────────────── controllers ───────────────────────── */

/**
 * POST /api/orgs/attempts/start
 * body: { assignmentId: string, timerSec?: number }
 * returns: { attemptId, remainingMs, seed, heartbeatSec, maxBackgrounds, maxSuspicion }
 */
export const startAttempt = async (req, res) => {
  try {
    await ensureTables();
    if (!isOrgUser(req.user))
      return res.status(401).json({ message: 'Unauthorized' });

    const userId = String(req.user.id);
    const assignmentId = String(req.body?.assignmentId || '').trim();
    if (!assignmentId)
      return res.status(400).json({ message: 'assignmentId required' });

    // Optional knobs (fallbacks are conservative)
    const timerSec = clamp(Number(req.body?.timerSec ?? 0), 0, 24 * 3600);
    const heartbeatSec = clamp(Number(req.body?.heartbeatSec ?? 15), 5, 60);
    const maxBackgrounds = clamp(Number(req.body?.maxBackgrounds ?? 2), 0, 10);
    const maxSuspicion = clamp(Number(req.body?.maxSuspicion ?? 5), 1, 20);

    // One active attempt per user+assignment
    const { rows: existing } = await pool.query(
      `SELECT id, status FROM org_attempts
        WHERE user_id=$1 AND assignment_id=$2 AND status='active'
        ORDER BY started_at DESC LIMIT 1`,
      [userId, assignmentId],
    );
    if (existing.length) {
      return res.status(200).json({
        attemptId: existing[0].id,
        remainingMs: 0, // client will use org display timer; heartbeat still enforced
        seed: Math.floor(Date.now() % 2147483647),
        heartbeatSec,
        maxBackgrounds,
        maxSuspicion,
        reused: true,
      });
    }

    const seed = Math.floor((Date.now() * Math.random()) % 2147483647);
    const remainingMs = timerSec > 0 ? timerSec * 1000 : 0;

    const { rows } = await pool.query(
      `INSERT INTO org_attempts
        (assignment_id, user_id, status, remaining_ms, seed, heartbeat_sec, max_backgrounds, max_suspicion, meta)
       VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8)
       RETURNING id, remaining_ms, seed, heartbeat_sec, max_backgrounds, max_suspicion`,
      [
        assignmentId,
        userId,
        remainingMs,
        seed,
        heartbeatSec,
        maxBackgrounds,
        maxSuspicion,
        JSON.stringify({ startedBy: userId, startedAt: nowIso() }),
      ],
    );

    const row = rows[0];
    return res.json({
      attemptId: row.id,
      remainingMs: Number(row.remaining_ms || 0),
      seed: Number(row.seed || seed),
      heartbeatSec: Number(row.heartbeat_sec || heartbeatSec),
      maxBackgrounds: Number(row.max_backgrounds || maxBackgrounds),
      maxSuspicion: Number(row.max_suspicion || maxSuspicion),
    });
  } catch (err) {
    console.error('[attempts] startAttempt error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/orgs/attempts/heartbeat
 * body: { attemptId, deviceId, elapsedMs, backgrounds, suspicions }
 */
export const heartbeatAttempt = async (req, res) => {
  try {
    await ensureTables();
    if (!isOrgUser(req.user))
      return res.status(401).json({ message: 'Unauthorized' });

    const { attemptId, deviceId, elapsedMs, backgrounds, suspicions } =
      req.body || {};
    if (!attemptId)
      return res.status(400).json({ message: 'attemptId required' });

    const { rows } = await pool.query(
      `SELECT id, user_id, device_id, status, remaining_ms, heartbeat_sec, last_heartbeat
         FROM org_attempts WHERE id=$1 LIMIT 1`,
      [attemptId],
    );
    if (!rows.length)
      return res.status(404).json({ message: 'Attempt not found' });
    const a = rows[0];

    if (a.status !== 'active')
      return res.status(409).json({ message: `Attempt is ${a.status}` });

    // First heartbeat binds device
    const bindDeviceId = a.device_id || (deviceId ? String(deviceId) : null);
    if (a.device_id && deviceId && a.device_id !== deviceId) {
      // device mismatch → invalidate
      await pool.query(
        `UPDATE org_attempts SET status='invalid', last_heartbeat=NOW() WHERE id=$1`,
        [attemptId],
      );
      return res
        .status(409)
        .json({ message: 'Device mismatch; attempt invalidated' });
    }

    // Expiry check (client drives countdown, but we enforce if remaining_ms == 0 and has a timer)
    if (
      Number(a.remaining_ms) > 0 &&
      Number(elapsedMs || 0) >= Number(a.remaining_ms)
    ) {
      await pool.query(
        `UPDATE org_attempts SET status='expired', last_heartbeat=NOW() WHERE id=$1`,
        [attemptId],
      );
      return res.status(409).json({ message: 'Attempt expired' });
    }

    await pool.query(
      `UPDATE org_attempts
          SET last_heartbeat=NOW(),
              device_id=COALESCE(device_id,$2),
              backgrounds=GREATEST(COALESCE(backgrounds,0), $3::int),
              suspicions=GREATEST(COALESCE(suspicions,0), $4::int)
        WHERE id=$1`,
      [
        attemptId,
        bindDeviceId,
        Number(backgrounds || 0),
        Number(suspicions || 0),
      ],
    );

    return res.json({ ok: true, boundDevice: bindDeviceId ? true : false });
  } catch (err) {
    console.error('[attempts] heartbeatAttempt error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/orgs/attempts/submit
 * body: { assignmentId, attemptId, deviceId, answers: [{ questionId, answerText? , choiceIndex? }] }
 */
export const submitAttempt = async (req, res) => {
  try {
    await ensureTables();
    if (!isOrgUser(req.user))
      return res.status(401).json({ message: 'Unauthorized' });

    const userId = String(req.user.id);
    const { assignmentId, attemptId, deviceId } = req.body || {};
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];

    if (!assignmentId || !attemptId) {
      return res
        .status(400)
        .json({ message: 'assignmentId and attemptId required' });
    }

    const { rows } = await pool.query(
      `SELECT id, status, device_id, remaining_ms, last_heartbeat, backgrounds, suspicions, heartbeat_sec
         FROM org_attempts WHERE id=$1 AND user_id=$2 AND assignment_id=$3 LIMIT 1`,
      [attemptId, userId, assignmentId],
    );
    if (!rows.length)
      return res.status(404).json({ message: 'Attempt not found' });
    const a = rows[0];

    if (a.status !== 'active')
      return res.status(409).json({ message: `Attempt is ${a.status}` });

    // Device must match (if bound)
    if (a.device_id && deviceId && a.device_id !== deviceId) {
      await pool.query(`UPDATE org_attempts SET status='invalid' WHERE id=$1`, [
        attemptId,
      ]);
      return res
        .status(409)
        .json({ message: 'Device mismatch; attempt invalidated' });
    }

    // Heartbeat freshness (2x heartbeatSec tolerance)
    const hbSec = Math.max(5, Number(a.heartbeat_sec || 15));
    const staleCutoff = Date.now() - hbSec * 2 * 1000;
    if (
      a.last_heartbeat &&
      new Date(a.last_heartbeat).getTime() < staleCutoff
    ) {
      await pool.query(`UPDATE org_attempts SET status='invalid' WHERE id=$1`, [
        attemptId,
      ]);
      return res
        .status(409)
        .json({ message: 'Missing or stale heartbeat. Attempt invalidated.' });
    }

    // Persist answers (verbatim)
    await pool.query(
      `INSERT INTO org_attempt_answers (attempt_id, user_id, assignment_id, answers)
       VALUES ($1,$2,$3,$4)`,
      [attemptId, userId, assignmentId, JSON.stringify(answers)],
    );

    await pool.query(
      `UPDATE org_attempts SET status='submitted', last_heartbeat=NOW() WHERE id=$1`,
      [attemptId],
    );

    return res.json({ ok: true, submitted: true, attemptId });
  } catch (err) {
    console.error('[attempts] submitAttempt error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
