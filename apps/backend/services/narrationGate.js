import pool from '../config/db.js';
import { getEntitlement } from '../controllers/_entitlements.js';

const PLAN_LIMITS_MIN = {
  pro: 1000,
  enterprise: 10000,
};

const DAILY_CAP_SECONDS = 10 * 60; // 10 minutes/day per learner

function todayRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function billingRange(sub = {}) {
  const started = sub.started_at ? new Date(sub.started_at) : new Date();
  const expires = sub.expires_at
    ? new Date(sub.expires_at)
    : new Date(started.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { start: started, end: expires };
}

function wordCount(text = '') {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function estimateMinutesFromText(text = '') {
  const words = wordCount(text);
  const estMinutes = Math.ceil(words / 140) || 1;
  return Math.max(1, estMinutes);
}

async function ensureBucket(client, { bucketKey, ownerId, periodStart, periodEnd }) {
  const { rows } = await client.query(
    `INSERT INTO usage_buckets (bucket, owner_id, period_start, period_end, used_seconds, reserved_seconds)
     VALUES ($1, $2, $3, $4, 0, 0)
     ON CONFLICT (bucket, owner_id, period_start, period_end)
     DO UPDATE SET reserved_seconds = usage_buckets.reserved_seconds
     RETURNING *`,
    [bucketKey, ownerId, periodStart, periodEnd]
  );

  return rows[0];
}

function remainingSeconds(row, limitSeconds) {
  const used = Number(row?.used_seconds || 0);
  const reserved = Number(row?.reserved_seconds || 0);
  return Math.max(0, limitSeconds - used - reserved);
}

async function hasCertificateEntitlement(userId, courseId) {
  if (!userId || !courseId) return false;
  try {
    const ent = await getEntitlement(pool, userId, courseId);
    if (ent && (ent.can_certificate || ent.tier)) return true;
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[narrationGate] entitlement lookup failed', e?.message || e);
    }
  }

  // certificates table (legacy numeric student_id)
  try {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM certificates WHERE course_id = $2 AND (student_id::text = $1 OR $1 IS NULL) LIMIT 1`,
      [String(userId), courseId]
    );
    if (rowCount) return true;
  } catch (e) {
    if (e?.code !== '42P01') throw e; // table missing
  }

  // payments meta fallback
  try {
    const { rowCount } = await pool.query(
      `SELECT 1
         FROM payments
        WHERE user_id = $1
          AND status IN ('Completed','Success')
          AND meta->>'purpose' = 'certificate'
          AND meta->>'courseId' = $2
        LIMIT 1`,
      [userId, courseId]
    );
    if (rowCount) return true;
  } catch (e) {
    if (e?.code !== '42P01') throw e;
  }

  return false;
}

async function reserveBuckets({ client, buckets, reserveSeconds }) {
  const reservations = [];
  for (const b of buckets) {
    const updated = await client.query(
      `UPDATE usage_buckets
          SET reserved_seconds = reserved_seconds + $2
        WHERE id = $1
      RETURNING *`,
      [b.row.id, reserveSeconds]
    );
    reservations.push({
      bucketId: updated.rows[0]?.id || b.row.id,
      bucket: b.row.bucket,
      limitSeconds: b.limit,
      periodEnd: b.row.period_end,
      reservedSeconds: reserveSeconds,
    });
  }
  return reservations;
}

export async function narrationPreflight({ userId, orgId, courseId, estimateText }) {
  const reserveMin = estimateMinutesFromText(estimateText);
  const reserveSeconds = reserveMin * 60;

  // org-managed path
  if (orgId) {
    const { rows, rowCount } = await pool.query(
      `SELECT tier, started_at, expires_at, active
         FROM org_subscriptions
        WHERE org_id = $1
        ORDER BY started_at DESC
        LIMIT 1`,
      [orgId]
    );

    if (!rowCount || !rows[0].active) {
      return { ok: false, mode: 'notes_only', reason: 'org_subscription_inactive', resetsAt: null, remainingMinutes: 0 };
    }

    const tier = String(rows[0].tier || '').toLowerCase();
    if (tier === 'starter') {
      return {
        ok: false,
        mode: 'notes_only',
        reason: 'tier_locked',
        resetsAt: rows[0].expires_at || null,
        remainingMinutes: 0,
      };
    }

    const limitMinutes = PLAN_LIMITS_MIN[tier] || PLAN_LIMITS_MIN.pro;
    const limitSeconds = limitMinutes * 60;
    const period = billingRange(rows[0]);
    const learnerDay = todayRange();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orgBucket = await ensureBucket(client, {
        bucketKey: `org:narration:${orgId}`,
        ownerId: orgId,
        periodStart: period.start,
        periodEnd: period.end,
      });

      if (!userId) {
        await client.query('ROLLBACK');
        return { ok: false, mode: 'notes_only', reason: 'login_required', resetsAt: period.end, remainingMinutes: 0 };
      }

      const profileBucket = await ensureBucket(client, {
        bucketKey: `profile:narration:${userId}`,
        ownerId: userId,
        periodStart: learnerDay.start,
        periodEnd: learnerDay.end,
      });

      const orgRemaining = remainingSeconds(orgBucket, limitSeconds);
      const dailyRemaining = remainingSeconds(profileBucket, DAILY_CAP_SECONDS);
      const hardRemaining = Math.min(orgRemaining, dailyRemaining);

      if (hardRemaining < reserveSeconds) {
        await client.query('ROLLBACK');
        const resetsAt = hardRemaining === orgRemaining ? period.end : learnerDay.end;
        return {
          ok: false,
          mode: 'notes_only',
          reason: 'quota_exhausted',
          resetsAt,
          remainingMinutes: Math.floor(hardRemaining / 60),
          usage: [
            { bucket: 'org', remainingSeconds: orgRemaining, limitSeconds, resetsAt: period.end },
            { bucket: 'profile', remainingSeconds: dailyRemaining, limitSeconds: DAILY_CAP_SECONDS, resetsAt: learnerDay.end },
          ],
        };
      }

      const reservations = await reserveBuckets({
        client,
        buckets: [
          { row: orgBucket, limit: limitSeconds },
          { row: profileBucket, limit: DAILY_CAP_SECONDS },
        ],
        reserveSeconds,
      });

      await client.query('COMMIT');
      return {
        ok: true,
        mode: 'narration',
        reserveMin,
        resetsAt: period.end,
        remainingMinutes: Math.floor((hardRemaining - reserveSeconds) / 60),
        usage: reservations,
        reservation: { reserveSeconds, buckets: reservations },
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // self-serve user path
  if (!userId) {
    return { ok: false, mode: 'notes_only', reason: 'login_required', resetsAt: null, remainingMinutes: 0 };
  }

  const entitled = await hasCertificateEntitlement(userId, courseId);
  if (!entitled) {
    return { ok: false, mode: 'notes_only', reason: 'entitlement_required', resetsAt: null, remainingMinutes: 0 };
  }

  // Daily cap only
  const learnerDay = todayRange();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const profileBucket = await ensureBucket(client, {
      bucketKey: `profile:narration:${userId}`,
      ownerId: userId,
      periodStart: learnerDay.start,
      periodEnd: learnerDay.end,
    });

    const dailyRemaining = remainingSeconds(profileBucket, DAILY_CAP_SECONDS);
    if (dailyRemaining < reserveSeconds) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        mode: 'notes_only',
        reason: 'quota_exhausted',
        resetsAt: learnerDay.end,
        remainingMinutes: Math.floor(dailyRemaining / 60),
        usage: [
          { bucket: 'profile', remainingSeconds: dailyRemaining, limitSeconds: DAILY_CAP_SECONDS, resetsAt: learnerDay.end },
        ],
      };
    }

    const reservations = await reserveBuckets({
      client,
      buckets: [{ row: profileBucket, limit: DAILY_CAP_SECONDS }],
      reserveSeconds,
    });

    await client.query('COMMIT');
    return {
      ok: true,
      mode: 'narration',
      reserveMin,
      resetsAt: learnerDay.end,
      remainingMinutes: Math.floor((dailyRemaining - reserveSeconds) / 60),
      usage: reservations,
      reservation: { reserveSeconds, buckets: reservations },
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function finalizeNarrationUsage({ reservation, actualSeconds }) {
  if (!reservation?.buckets?.length) return null;
  const usedSeconds = Math.max(0, Math.round(actualSeconds || 0));
  const reserveSeconds = Math.max(0, Math.round(reservation.reserveSeconds || usedSeconds));
  const billSeconds = Math.min(reserveSeconds, usedSeconds || reserveSeconds);
  const refundSeconds = Math.max(0, reserveSeconds - billSeconds);

  const client = await pool.connect();
  const updates = [];
  try {
    await client.query('BEGIN');
    for (const b of reservation.buckets) {
      const bucketReserve = Math.max(0, Math.round(b.reservedSeconds || reserveSeconds));
      const { rows } = await client.query(
        `UPDATE usage_buckets
            SET reserved_seconds = GREATEST(reserved_seconds - $2, 0),
                used_seconds      = used_seconds + $3
          WHERE id = $1
        RETURNING *`,
        [b.bucketId, bucketReserve, billSeconds]
      );
      if (rows[0]) updates.push(rows[0]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return {
    billedSeconds: billSeconds,
    refundSeconds,
    updates,
  };
}

export function buildGateNotice({ ok, reason, resetsAt, remainingMinutes }) {
  if (ok) return null;
  return { reason: reason || 'locked', resetsAt: resetsAt || null, remainingMinutes: remainingMinutes ?? null };
}

export function blankLessonsFromOutline(outline = [], start = 0, count = 1) {
  const slice = Array.isArray(outline) ? outline.slice(start, start + count) : [];
  return slice.map((s, idx) => {
    const id = `L${start + idx + 1}`;
    const title = s?.title || `Lesson ${start + idx + 1}`;
    const bullets = Array.isArray(s?.keyPoints) ? s.keyPoints : [];
    const markdown = bullets.length
      ? `## ${title}\n\n${bullets.map((b) => `- ${b}`).join('\n')}`
      : `## ${title}\n\nNotes are locked to text-only for now.`;
    return { id, title, ssml: '', markdown };
  });
}

export default narrationPreflight;
