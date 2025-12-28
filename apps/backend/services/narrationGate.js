// apps/backend/services/narrationGate.js
import pool from '../config/db.js';
import crypto from 'node:crypto';
import { getCertificateEntitlement } from '../controllers/_aiCourseEntitlements.js';

const PLAN_LIMITS_MIN = { pro: 1000, enterprise: 10000 };
const DAILY_CAP_SECONDS = 10 * 60;
const ANON_DAILY_CAP_SECONDS = 3 * 60;

// how long a reservation is allowed to sit before auto-release
const RESERVATION_TTL_SECONDS = 5 * 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return UUID_RE.test(String(v || '').trim());
}

// Deterministic UUID from string (anonId -> uuid)
function anonToUuid(s) {
  const hex = crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(
    17,
    20,
  )}-${hex.slice(20)}`;
}

/**
 * Safe UUID resolver for any "subject id" that must be stored as uuid in usage_buckets.
 * - If already UUID, return as-is.
 * - Else generate deterministic UUID from a namespaced string.
 */
function resolveSubjectUuid(namespace, value) {
  const v = String(value ?? '').trim();
  if (isUuid(v)) return v;
  return anonToUuid(`${namespace}:${v}`);
}

/**
 * ✅ Course access check (purchase/unlock):
 * Uses ai_course_entitlements via getCertificateEntitlement()
 */
async function hasCourseAccess(userId, courseId, db = pool) {
  if (!userId || !courseId) return false;
  try {
    const ent = await getCertificateEntitlement(userId, courseId, db);
    return !!ent;
  } catch {
    return false;
  }
}

// Map JWT userId (often int) -> profiles.id (uuid)
async function resolveProfileId(userId) {
  if (!userId) return null;
  if (isUuid(userId)) return String(userId);

  const q = await pool.query(`SELECT id FROM profiles WHERE user_id = $1 LIMIT 1`, [userId]);
  return q.rows?.[0]?.id ? String(q.rows[0].id) : null;
}

/**
 * ✅ Always returns a UUID suitable for usage_buckets.subject_id
 * - Prefer real profile UUID if it exists.
 * - Fallback to deterministic UUID from userId to avoid "434" -> ::uuid crashes.
 */
async function resolveProfileSubjectUuid(userId) {
  const profileId = await resolveProfileId(userId);
  if (profileId && isUuid(profileId)) return String(profileId);
  return anonToUuid(`user:${String(userId)}`);
}

function todayRange() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const toDate = (d) => d.toISOString().slice(0, 10);
  return { start: toDate(start), end: toDate(end) };
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

/**
 * Ensure a bucket row exists for (subject_type, subject_id, bucket, period_start, period_end).
 * Store limits in limit_int (seconds), usage in used_int, reservations in reserved_int.
 */
async function ensureBucket(
  client,
  { subjectType, subjectId, bucket, periodStart, periodEnd, limitSeconds },
) {
  const { rows } = await client.query(
    `
    INSERT INTO usage_buckets
      (subject_type, subject_id, bucket, period_start, period_end, used_int, reserved_int, limit_int)
    VALUES
      ($1, $2::uuid, $3, $4::date, $5::date, 0, 0, $6)
    ON CONFLICT (subject_type, subject_id, bucket, period_start, period_end)
    DO UPDATE
      SET limit_int = GREATEST(usage_buckets.limit_int, EXCLUDED.limit_int),
          updated_at = now()
    RETURNING *;
    `,
    [
      subjectType,
      String(subjectId),
      bucket,
      periodStart,
      periodEnd,
      Math.max(0, Math.floor(limitSeconds || 0)),
    ],
  );

  return rows[0];
}

function remainingSeconds(row, limitSeconds) {
  const used = Number(row?.used_int || 0);
  const reserved = Number(row?.reserved_int || 0);
  const limit =
    Number.isFinite(Number(row?.limit_int)) && Number(row?.limit_int) > 0
      ? Number(row.limit_int)
      : Number(limitSeconds || 0);
  return Math.max(0, limit - used - reserved);
}

/**
 * Release any expired reservations (safe to call frequently).
 * Uses reservation rows + decrements reserved_int on affected buckets.
 */
async function releaseExpiredReservations(client) {
  const { rows } = await client.query(
    `
    SELECT id, reservation_group, bucket_id, reserved_seconds
      FROM usage_reservations
     WHERE status = 'reserved'
       AND expires_at <= now()
     FOR UPDATE SKIP LOCKED
     LIMIT 200;
    `,
  );

  if (!rows.length) return 0;

  const ids = rows.map((r) => r.id);
  await client.query(
    `
    UPDATE usage_reservations
       SET status = 'expired',
           settled_at = now(),
           settled_seconds = 0
     WHERE id = ANY($1::uuid[]);
    `,
    [ids],
  );

  const byBucket = new Map();
  for (const r of rows) {
    const prev = byBucket.get(r.bucket_id) || 0;
    byBucket.set(r.bucket_id, prev + Number(r.reserved_seconds || 0));
  }

  for (const [bucketId, seconds] of byBucket.entries()) {
    await client.query(
      `
      UPDATE usage_buckets
         SET reserved_int = GREATEST(reserved_int - $2, 0),
             updated_at = now()
       WHERE id = $1;
      `,
      [bucketId, Math.max(0, Math.floor(seconds))],
    );
  }

  return rows.length;
}

/**
 * Reserve from multiple buckets AND write reservation rows with expiry.
 * Returns a reservation group + per-bucket reservations.
 */
async function reserveBuckets({ client, buckets, reserveSeconds }) {
  const reservations = [];
  const r = Math.max(0, Math.floor(reserveSeconds || 0));
  const group = crypto.randomUUID();

  for (const b of buckets) {
    const updated = await client.query(
      `
      UPDATE usage_buckets
         SET reserved_int = reserved_int + $2,
             updated_at = now()
       WHERE id = $1
       RETURNING *;
      `,
      [b.row.id, r],
    );

    const bucketRow = updated.rows[0] || b.row;

    const { rows } = await client.query(
      `
      INSERT INTO usage_reservations
        (reservation_group, bucket_id, reserved_seconds, expires_at)
      VALUES
        ($1::uuid, $2, $3, now() + ($4::int || ' seconds')::interval)
      RETURNING id, expires_at;
      `,
      [group, bucketRow.id, r, RESERVATION_TTL_SECONDS],
    );

    reservations.push({
      reservationId: rows?.[0]?.id || null,
      reservationGroup: group,
      expiresAt: rows?.[0]?.expires_at || null,

      bucketId: bucketRow.id,
      bucket: b.label, // 'org' | 'profile' | 'anon'
      subjectType: bucketRow.subject_type,
      subjectId: bucketRow.subject_id,
      limitSeconds: b.limit,
      periodEnd: bucketRow.period_end,
      reservedSeconds: r,
    });
  }

  return { group, reservations };
}

export async function narrationPreflight({
  userId,
  anonId,
  orgId,
  courseId,
  estimateText,
  programTrack, // kept for signature parity (not required here)
}) {
  const reserveMin = estimateMinutesFromText(estimateText);
  const reserveSeconds = reserveMin * 60;

  // --- ORG PATH ---
  if (orgId) {
    const { rows, rowCount } = await pool.query(
      `SELECT tier, started_at, expires_at, active
         FROM org_subscriptions
        WHERE org_id = $1
        ORDER BY started_at DESC
        LIMIT 1`,
      [orgId],
    );

    if (!rowCount || !rows[0].active) {
      return {
        ok: false,
        mode: 'notes_only',
        reason: 'org_subscription_inactive',
        resetsAt: null,
        remainingMinutes: 0,
      };
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

    if (!userId) {
      return {
        ok: false,
        mode: 'notes_only',
        reason: 'login_required',
        resetsAt: period.end,
        remainingMinutes: 0,
      };
    }

    // ✅ Use safe profile subject UUID (never crashes)
    const profileSubjectId = await resolveProfileSubjectUuid(userId);
    const orgSubjectId = resolveSubjectUuid('org', orgId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await releaseExpiredReservations(client);

      const orgBucket = await ensureBucket(client, {
        subjectType: 'org',
        subjectId: orgSubjectId,
        bucket: 'narration_pool',
        periodStart: period.start,
        periodEnd: period.end,
        limitSeconds,
      });

      const profileBucket = await ensureBucket(client, {
        subjectType: 'profile',
        subjectId: profileSubjectId,
        bucket: 'narration_daily',
        periodStart: learnerDay.start,
        periodEnd: learnerDay.end,
        limitSeconds: DAILY_CAP_SECONDS,
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
            {
              bucket: 'org',
              remainingSeconds: orgRemaining,
              limitSeconds,
              resetsAt: period.end,
            },
            {
              bucket: 'profile',
              remainingSeconds: dailyRemaining,
              limitSeconds: DAILY_CAP_SECONDS,
              resetsAt: learnerDay.end,
            },
          ],
        };
      }

      const { group, reservations } = await reserveBuckets({
        client,
        reserveSeconds,
        buckets: [
          { row: orgBucket, limit: limitSeconds, label: 'org' },
          { row: profileBucket, limit: DAILY_CAP_SECONDS, label: 'profile' },
        ],
      });

      await client.query('COMMIT');
      return {
        ok: true,
        mode: 'narration',
        reserveMin,
        resetsAt: period.end,
        remainingMinutes: Math.floor((hardRemaining - reserveSeconds) / 60),
        usage: reservations,
        reservation: {
          reservationGroup: group,
          reserveSeconds,
          buckets: reservations,
        },
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // --- SELF-SERVE ANON (free daily cap only) ---
  if (!userId) {
    const safeAnon = String(anonId || '').trim().slice(0, 80);
    if (!safeAnon) {
      return {
        ok: false,
        mode: 'notes_only',
        reason: 'login_or_anon_required',
        resetsAt: null,
        remainingMinutes: 0,
      };
    }

    const anonUuid = anonToUuid(safeAnon);
    const learnerDay = todayRange();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await releaseExpiredReservations(client);

      const anonBucket = await ensureBucket(client, {
        subjectType: 'anon',
        subjectId: anonUuid,
        bucket: 'narration_daily',
        periodStart: learnerDay.start,
        periodEnd: learnerDay.end,
        limitSeconds: ANON_DAILY_CAP_SECONDS,
      });

      const dailyRemaining = remainingSeconds(anonBucket, ANON_DAILY_CAP_SECONDS);
      if (dailyRemaining < reserveSeconds) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          mode: 'notes_only',
          reason: 'anon_quota_exhausted',
          resetsAt: learnerDay.end,
          remainingMinutes: Math.floor(dailyRemaining / 60),
          usage: [
            {
              bucket: 'anon',
              remainingSeconds: dailyRemaining,
              limitSeconds: ANON_DAILY_CAP_SECONDS,
              resetsAt: learnerDay.end,
            },
          ],
        };
      }

      const { group, reservations } = await reserveBuckets({
        client,
        reserveSeconds,
        buckets: [{ row: anonBucket, limit: ANON_DAILY_CAP_SECONDS, label: 'anon' }],
      });

      await client.query('COMMIT');
      return {
        ok: true,
        mode: 'narration',
        reserveMin,
        resetsAt: learnerDay.end,
        remainingMinutes: Math.floor((dailyRemaining - reserveSeconds) / 60),
        usage: reservations,
        reservation: {
          reservationGroup: group,
          reserveSeconds,
          buckets: reservations,
        },
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // --- SELF-SERVE LOGGED-IN (daily cap; purchase unlocks narration) ---
  const learnerDay = todayRange();

  // ✅ APPLY: use hasCourseAccess() here
  const entitled = await hasCourseAccess(userId, courseId);

  // Not purchased: 10 minutes/day narration cap
  // Purchased: effectively unlimited per day (lesson generation cap enforced elsewhere)
  const BASE_LIMIT = DAILY_CAP_SECONDS; // 10 min
  const ENTITLED_LIMIT = Math.max(24 * 60 * 60, reserveSeconds + 60); // 24h or enough for this request

  const limitSeconds = entitled ? ENTITLED_LIMIT : BASE_LIMIT;
  const bucketName = entitled ? 'narration_entitled_daily' : 'narration_daily';

  // ✅ Use safe profile subject UUID (never crashes)
  const profileSubjectId = await resolveProfileSubjectUuid(userId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await releaseExpiredReservations(client);

    const profileBucket = await ensureBucket(client, {
      subjectType: 'profile',
      subjectId: profileSubjectId,
      bucket: bucketName,
      periodStart: learnerDay.start,
      periodEnd: learnerDay.end,
      limitSeconds,
    });

    const dailyRemaining = remainingSeconds(profileBucket, limitSeconds);

    // If NOT entitled and daily cap is exhausted -> show CTA
    if (!entitled && dailyRemaining < reserveSeconds) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        mode: 'notes_only',
        reason: 'quota_exhausted',
        resetsAt: learnerDay.end,
        remainingMinutes: Math.floor(dailyRemaining / 60),
        usage: [
          {
            bucket: 'profile',
            remainingSeconds: dailyRemaining,
            limitSeconds: BASE_LIMIT,
            resetsAt: learnerDay.end,
          },
        ],
      };
    }

    const { group, reservations } = await reserveBuckets({
      client,
      reserveSeconds,
      buckets: [{ row: profileBucket, limit: limitSeconds, label: 'profile' }],
    });

    await client.query('COMMIT');

    return {
      ok: true,
      mode: 'narration',
      reserveMin,
      resetsAt: learnerDay.end,
      remainingMinutes: Math.floor(Math.max(0, dailyRemaining - reserveSeconds) / 60),
      usage: reservations,
      reservation: {
        reservationGroup: group,
        reserveSeconds,
        buckets: reservations,
      },
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function finalizeNarrationUsage({ reservation, actualSeconds }) {
  const group = reservation?.reservationGroup || null;
  if (!group) return null;

  const usedSeconds = Math.max(0, Math.round(actualSeconds || 0));
  const reserveSeconds = Math.max(0, Math.round(reservation.reserveSeconds || usedSeconds));
  const billSeconds = Math.min(reserveSeconds, usedSeconds || reserveSeconds);

  const client = await pool.connect();
  const updates = [];
  try {
    await client.query('BEGIN');

    await releaseExpiredReservations(client);

    const { rows } = await client.query(
      `
      SELECT id, bucket_id, reserved_seconds
        FROM usage_reservations
       WHERE reservation_group = $1::uuid
         AND status = 'reserved'
       FOR UPDATE;
      `,
      [group],
    );

    if (!rows.length) {
      await client.query('COMMIT');
      return { billedSeconds: 0, updates: [] };
    }

    const ids = rows.map((r) => r.id);
    await client.query(
      `
      UPDATE usage_reservations
         SET status = 'settled',
             settled_at = now(),
             settled_seconds = $2
       WHERE id = ANY($1::uuid[]);
      `,
      [ids, billSeconds],
    );

    for (const r of rows) {
      const bucketReserve = Math.max(0, Math.round(r.reserved_seconds || 0));
      const { rows: bRows } = await client.query(
        `
        UPDATE usage_buckets
           SET reserved_int = GREATEST(reserved_int - $2, 0),
               used_int     = used_int + $3,
               updated_at   = now()
         WHERE id = $1
         RETURNING *;
        `,
        [r.bucket_id, bucketReserve, billSeconds],
      );
      if (bRows?.[0]) updates.push(bRows[0]);
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { billedSeconds: billSeconds, updates };
}

export function buildGateNotice({ ok, reason, resetsAt, remainingMinutes }) {
  if (ok) return null;
  return {
    reason: reason || 'locked',
    resetsAt: resetsAt || null,
    remainingMinutes: remainingMinutes ?? null,
  };
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
