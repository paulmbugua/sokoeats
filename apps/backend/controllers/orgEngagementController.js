// apps/backend/controllers/orgEngagementController.js
import pool from '../config/db.js';
import {
  attendanceSessionSchema,
  attendanceSessionUpdateSchema,
  attendanceEntrySchema,
  attendanceQuerySchema,
  announcementSchema,
  announcementUpdateSchema,
  announcementQuerySchema,
  sportsEventSchema,
  sportsEventUpdateSchema,
  sportsQuerySchema,
  clubSchema,
  clubUpdateSchema,
  membershipParamsSchema,
  messageSendSchema,
} from '../validators/orgEngagementValidators.js';
import { renderAnnouncementPdf } from '../services/orgAnnouncementPdfService.js';
import { notifyEvent } from '../services/notificationEvents.js';

const normalizeOrgId = (req) => req.params?.orgId || req.body?.org_id || req.query?.org_id;

function isUuid(v) {
  const s = String(v || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

async function resolveLearnerProfileId(orgId, memberRefRaw) {
  const raw = String(memberRefRaw || '').trim();
  if (!raw) return null;

  // Case A: already a learner_profile UUID
  if (isUuid(raw)) {
    const { rows } = await pool.query(
      `select id
         from org_learner_profiles
        where org_id = $1 and id = $2
        limit 1`,
      [orgId, raw],
    );
    return rows?.[0]?.id || null;
  }

  // Case B: numeric user_id -> lookup learner_profile
  const n = Number(raw);
  if (Number.isFinite(n)) {
    const { rows } = await pool.query(
      `select id
         from org_learner_profiles
        where org_id = $1 and user_id = $2
        limit 1`,
      [orgId, n],
    );
    return rows?.[0]?.id || null;
  }

  return null;
}

async function resolveClubMemberUserId(orgId, memberRefRaw) {
  const raw = String(memberRefRaw || '').trim();
  if (!raw) return null;

  // A) If they sent learner_profile UUID -> convert to user_id
  if (isUuid(raw)) {
    // try learner profiles first
    const a = await pool.query(
      `select user_id
         from org_learner_profiles
        where org_id = $1 and id = $2
        limit 1`,
      [orgId, raw],
    );
    if (a.rows?.[0]?.user_id) return Number(a.rows[0].user_id);

    // optionally support instructors too
    const b = await pool.query(
      `select user_id
         from org_instructor_profiles
        where org_id = $1 and id = $2
        limit 1`,
      [orgId, raw],
    );
    if (b.rows?.[0]?.user_id) return Number(b.rows[0].user_id);

    return null;
  }

  // B) Numeric user_id -> verify user belongs to this org
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;

  const ok = await pool.query(
    `select 1
       from org_learner_profiles
      where org_id=$1 and user_id=$2
      union all
     select 1
       from org_instructor_profiles
      where org_id=$1 and user_id=$2
      limit 1`,
    [orgId, n],
  );

  return ok.rows?.length ? n : null;
}


function normalizeClassLabel(v) {
  const s = String(v || '').trim().replace(/\s+/g, ' ');
  return s ? s : null;
}

async function resolveMyLearnerClassLabel(pool, orgId, userId) {
  const uid = Number(userId);
  if (!orgId || !Number.isFinite(uid) || uid <= 0) return null;

  const { rows } = await pool.query(
    `select class_label
       from org_learner_profiles
      where org_id = $1 and user_id = $2
      limit 1`,
    [orgId, uid],
  );

  return normalizeClassLabel(rows?.[0]?.class_label);
}


function safeIdent(name) {
  // allow only simple identifiers (no injection)
  return /^[a-z_][a-z0-9_]*$/i.test(name) ? name : null;
}

async function tableExists(pool, tableName) {
  const fq = tableName.includes('.') ? tableName : `public.${tableName}`;
  const { rows } = await pool.query(`select to_regclass($1) as reg`, [fq]);
  return Boolean(rows?.[0]?.reg);
}

const _uuidColCache = new Map(); // key: "schema.table" -> uuid column or null

async function pickUuidColumn(pool, tableName) {
  const fq = tableName.includes('.') ? tableName : `public.${tableName}`;
  if (_uuidColCache.has(fq)) return _uuidColCache.get(fq);

  const [schema, table] = fq.split('.');
  const { rows } = await pool.query(
    `select column_name, data_type, udt_name
       from information_schema.columns
      where table_schema = $1
        and table_name   = $2
      order by ordinal_position`,
    [schema, table]
  );

  // prefer these names IF they are uuid-typed
  const preferred = [
    'id',
    'uuid',
    'profile_id',
    'actor_id',
    'author_id',
    'created_by',
    'staff_id',
    'member_id',
    'learner_id',
    'instructor_id',
  ];

  const isUuidCol = (r) => r && (r.data_type === 'uuid' || r.udt_name === 'uuid');

  let picked = null;

  for (const name of preferred) {
    const r = rows.find((x) => x.column_name === name);
    if (isUuidCol(r)) {
      picked = name;
      break;
    }
  }

  // fallback: first uuid column in the table
  if (!picked) {
    const r = rows.find((x) => isUuidCol(x));
    if (r) picked = r.column_name;
  }

  // must be a safe identifier
  picked = safeIdent(picked);

  _uuidColCache.set(fq, picked || null);

  console.log('[resolveOrgActorUuid] uuid column scan', {
    table: fq,
    picked,
    availableCols: rows.map((r) => `${r.column_name}:${r.data_type}`),
  });

  return picked || null;
}

async function tryResolveActorUuidFromTable(pool, orgId, userId, tableName) {
  const fq = tableName.includes('.') ? tableName : `public.${tableName}`;

  const exists = await tableExists(pool, fq);
  if (!exists) {
    console.log('[resolveOrgActorUuid] table missing:', fq);
    return null;
  }

  const uuidCol = await pickUuidColumn(pool, fq);
  if (!uuidCol) {
    console.log('[resolveOrgActorUuid] no uuid column found for table:', fq);
    return null;
  }

  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;

  // safe identifiers only (already validated)
  const safeTable = fq.split('.').map(safeIdent);
  if (!safeTable[0] || !safeTable[1]) return null;

  const sql = `
    select ${uuidCol} as actor_uuid
      from ${safeTable[0]}.${safeTable[1]}
     where org_id = $1
       and user_id = $2
     limit 1
  `;

  const { rows } = await pool.query(sql, [orgId, uid]);
  return rows?.[0]?.actor_uuid || null;
}

async function resolveOrgActorUuid(pool, orgId, user) {
  if (!orgId || !user) return null;

  // If auth middleware provides a UUID anywhere, use it.
  const direct =
    user.profile_id || user.profileId || user.uuid || user.user_uuid || user.userUuid;
  if (isUuid(direct)) {
    console.log('[resolveOrgActorUuid] using direct uuid from req.user', { direct });
    return String(direct);
  }

  // otherwise use numeric user.id and resolve from org profile tables
  const userId = user.id ?? user.user_id ?? null;
  if (!userId) return null;
  if (isUuid(userId)) return String(userId);

  // Try tables you *actually* have. Add more here if needed.
  const candidates = [
    'org_instructor_profiles',
    'org_learner_profiles',
    // 'org_members' (if you have it),
    // 'org_users' (if you have it),
  ];

  for (const t of candidates) {
    try {
      const actorUuid = await tryResolveActorUuidFromTable(pool, orgId, userId, t);
      console.log('[resolveOrgActorUuid] try', { table: t, userId, actorUuid });
      if (actorUuid) return actorUuid;
    } catch (e) {
      // keep it resilient across envs
      console.error('[resolveOrgActorUuid] table resolve failed', { table: t, code: e?.code, msg: e?.message });
      if (e?.code === '42P01' || e?.code === '42703') continue; // undefined_table / undefined_column
      throw e;
    }
  }

  return null;
}



function isIntLike(v) {
  const s = String(v || '');
  return /^\d+$/.test(s);
}

// ───────────────────────── Attendance ─────────────────────────
export async function listAttendanceSessions(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = attendanceQuerySchema.validate(req.query, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
  `select s.*,
          json_agg(
            json_build_object(
              'learner_id', e.learner_id,
              'user_id', lp.user_id,
              'status', e.status,
              'note', e.note
            )
          ) filter (where e.id is not null) as entries
     from org_attendance_sessions s
     left join org_attendance_entries e on e.session_id = s.id
     left join org_learner_profiles lp on lp.id = e.learner_id
    where s.org_id = $1
      and ($2::date is null or s.session_date >= $2)
      and ($3::date is null or s.session_date <= $3)
      and ($4::text is null or s.class_label = $4)
    group by s.id
    order by s.session_date desc, s.id desc
    limit $5 offset $6`,
  [orgId, value.start || null, value.end || null, value.class_label || null, value.limit, value.offset],
);


    res.json({ sessions: rows });
  } catch (err) {
    console.error('[listAttendanceSessions]', err);
    res.status(500).json({ message: 'Unable to load sessions' });
  }
}

export async function getAttendanceSession(req, res) {
  const orgId = normalizeOrgId(req);
  const sessionId = Number(req.params?.sessionId);
  if (!sessionId) return res.status(400).json({ message: 'sessionId required' });

  try {
   const { rows } = await pool.query(
  `select s.*,
          json_agg(
            json_build_object(
              'learner_id', e.learner_id,
              'user_id', lp.user_id,
              'status', e.status,
              'note', e.note
            )
          ) filter (where e.id is not null) as entries
     from org_attendance_sessions s
     left join org_attendance_entries e on e.session_id = s.id
     left join org_learner_profiles lp on lp.id = e.learner_id
    where s.org_id = $1 and s.id = $2
    group by s.id
    limit 1`,
  [orgId, sessionId],
);

    if (!rows.length) return res.status(404).json({ message: 'Session not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[getAttendanceSession]', err);
    res.status(500).json({ message: 'Unable to load session' });
  }
}

// createAttendanceSession (FIX)
export async function createAttendanceSession(req, res) {
  const orgId = req.params.orgId; // uuid from route
  const { session_date, class_label, period_label } = req.body || {};

  const userId = Number(req.user?.id || 0) || null;

  // ✅ instructor_id is UUID, so DO NOT put userId here
  // Option A (safe now): set instructor_id null
  let instructorId = null;

  // Option B (recommended): resolve org instructor profile UUID by user_id + org_id
  // Uncomment if you have org_instructor_profiles (id uuid, org_id uuid, user_id int)
  /*
  const ir = await pool.query(
    `SELECT id FROM org_instructor_profiles WHERE org_id=$1 AND user_id=$2 LIMIT 1`,
    [orgId, userId],
  );
  instructorId = ir.rows?.[0]?.id || null; // uuid or null
  */

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO org_attendance_sessions
        (org_id, instructor_id, session_date, class_label, period_label, created_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        orgId,
        instructorId,                 // ✅ uuid or null
        session_date,                 // date
        class_label || null,
        period_label || null,
        userId,                       // ✅ integer
      ],
    );

    return res.json(rows[0]);
  } catch (e) {
    console.error('[createAttendanceSession] error:', e);
    return res.status(500).json({ message: 'failed' });
  }
}


export async function updateAttendanceSession(req, res) {
  const orgId = normalizeOrgId(req);
  const sessionId = Number(req.params?.sessionId);
  if (!sessionId) return res.status(400).json({ message: 'sessionId required' });
  const { error, value } = attendanceSessionUpdateSchema
    .min(1)
    .validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
      `update org_attendance_sessions
          set session_date = coalesce($3, session_date),
              class_label = coalesce($4, class_label),
              period_label = coalesce($5, period_label)
        where org_id = $1 and id = $2
        returning *`,
      [orgId, sessionId, value.session_date || null, value.class_label || null, value.period_label || null],
    );
    if (!rows.length) return res.status(404).json({ message: 'Session not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[updateAttendanceSession]', err);
    res.status(500).json({ message: 'Unable to update session' });
  }
}

export async function deleteAttendanceSession(req, res) {
  const orgId = normalizeOrgId(req);
  const sessionId = Number(req.params?.sessionId);
  if (!sessionId) return res.status(400).json({ message: 'sessionId required' });

  try {
    const { rowCount } = await pool.query(`delete from org_attendance_sessions where org_id=$1 and id=$2`, [
      orgId,
      sessionId,
    ]);
    if (!rowCount) return res.status(404).json({ message: 'Session not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[deleteAttendanceSession]', err);
    res.status(500).json({ message: 'Unable to delete session' });
  }
}

// apps/backend/controllers/orgEngagementController.js



export async function upsertAttendanceEntries(req, res) {
  const orgId = normalizeOrgId(req);

  // keep your current “either params or body” pattern
  const sessionId = Number(req.params?.sessionId || req.body?.session_id);
  if (!sessionId) return res.status(400).json({ message: 'session_id required' });

  // validate (keep as-is)
  const { error, value } = attendanceEntrySchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    // ensure session exists for org
    const session = await pool.query(
      `select id, session_date, class_label, period_label
         from org_attendance_sessions
        where org_id=$1 and id=$2
        limit 1`,
      [orgId, sessionId],
    );
    if (!session.rows.length) return res.status(404).json({ message: 'Session not found' });
    const sessionRow = session.rows[0];

    const entries = Array.isArray(value?.entries) ? value.entries : [];

    // 1) collect numeric learner ids (user_ids)
    const userIds = Array.from(
      new Set(
        entries
          .map((e) => e?.learner_id)
          .filter((x) => isIntLike(x))
          .map((x) => Number(x)),
      ),
    );

    // 2) resolve user_id -> org_learner_profiles.id (uuid)
    const userIdToLearnerUuid = new Map();
    if (userIds.length) {
      const r = await pool.query(
        `select id, user_id
           from org_learner_profiles
          where org_id = $1
            and user_id = any($2::int[])`,
        [orgId, userIds],
      );
      for (const row of r.rows) {
        userIdToLearnerUuid.set(String(row.user_id), row.id);
      }
    }

    // 3) normalize entries to always use uuid learner_id
    const normalized = entries.map((e) => {
      const raw = String(e?.learner_id || '').trim();
      const learner_id = isUuid(raw) ? raw : userIdToLearnerUuid.get(raw);

      if (!learner_id) {
        // turn this into a 400 (bad request) rather than a 500
        const msg = `Invalid learner_id "${raw}" (expected learner profile uuid or valid org user_id)`;
        const err = new Error(msg);
        err.statusCode = 400;
        throw err;
      }

      return {
        learner_id,
        status: String(e?.status || '').toLowerCase(),
        note: e?.note ?? null,
      };
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const entry of normalized) {
        await client.query(
          `insert into org_attendance_entries (session_id, learner_id, status, note, updated_at)
           values ($1,$2,$3,$4, now())
           on conflict (session_id, learner_id)
           do update
             set status = excluded.status,
                 note = excluded.note,
                 updated_at = now()`,
          [sessionId, entry.learner_id, entry.status, entry.note],
        );
      }

      await client.query('COMMIT');

      const absentLearnerIds = normalized
        .filter((entry) => entry.status === 'absent')
        .map((entry) => entry.learner_id);
      if (absentLearnerIds.length) {
        const learnerUsers = await pool.query(
          `select user_id
             from org_learner_profiles
            where org_id = $1 and id = any($2::uuid[]) and user_id is not null`,
          [orgId, absentLearnerIds],
        );
        const sessionLabelParts = [];
        if (sessionRow?.class_label) sessionLabelParts.push(String(sessionRow.class_label));
        if (sessionRow?.session_date) {
          sessionLabelParts.push(new Date(sessionRow.session_date).toDateString());
        }
        if (sessionRow?.period_label) sessionLabelParts.push(String(sessionRow.period_label));

        void notifyEvent(
          'ORG_ATTENDANCE_ABSENT',
          learnerUsers.rows.map((r) => r.user_id).filter(Boolean),
          {
            sessionId,
            sessionLabel: sessionLabelParts.join(' • ') || undefined,
          },
        ).catch((e) =>
          console.warn('[push] attendance notify failed', e?.message || e),
        );
      }

      return res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    const status = err?.statusCode || 500;
    if (status === 400) {
      return res.status(400).json({ message: err.message });
    }
    console.error('[upsertAttendanceEntries]', err);
    return res.status(500).json({ message: 'Unable to save attendance' });
  }
}

function summarizeAttendance(rows = []) {
  return rows.reduce((acc, row) => {
    (row.entries || []).forEach((ent) => {
      acc[ent.status] = (acc[ent.status] || 0) + 1;
    });
    return acc;
  }, {});
}


export async function getAttendanceReport(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = attendanceQuerySchema.validate(req.query, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
      `
      select
        s.id as session_id,
        s.session_date,
        s.class_label,
        s.period_label,
        json_agg(
          json_build_object(
            'learner_id', e.learner_id,
            'user_id', lp.user_id,         -- ✅ add
            'status', e.status,
            'note', e.note
          )
        ) filter (where e.id is not null) as entries
      from org_attendance_sessions s
      left join org_attendance_entries e
        on e.session_id = s.id
      left join org_learner_profiles lp
        on lp.id = e.learner_id           -- ✅ add
      where s.org_id = $1
        and ($2::date is null or s.session_date >= $2)
        and ($3::date is null or s.session_date <= $3)
        and ($4::text is null or s.class_label = $4)
      group by s.id
      order by s.session_date desc, s.id desc
      limit $5 offset $6
      `,
      [orgId, value.start || null, value.end || null, value.class_label || null, value.limit, value.offset],
    );

    return res.json({ sessions: rows, summary: summarizeAttendance(rows) });
  } catch (err) {
    console.error('[getAttendanceReport]', err);
    return res.status(500).json({ message: 'Unable to load attendance' });
  }
}

export async function getAttendanceReportCsv(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = attendanceQuerySchema.validate(req.query, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
      `select s.id as session_id, s.session_date, s.class_label, s.period_label,
              json_agg(json_build_object('learner_id', e.learner_id, 'status', e.status, 'note', e.note))
                filter (where e.id is not null) as entries
         from org_attendance_sessions s
         left join org_attendance_entries e on e.session_id = s.id
        where s.org_id = $1
          and ($2::date is null or s.session_date >= $2)
          and ($3::date is null or s.session_date <= $3)
          and ($4::text is null or s.class_label = $4)
        group by s.id
        order by s.session_date desc
        limit $5 offset $6`,
      [orgId, value.start || null, value.end || null, value.class_label || null, value.limit, value.offset],
    );

    const lines = ['session_id,date,class,period,learner_id,status,note'];
    rows.forEach((row) => {
      (row.entries || []).forEach((ent) => {
        lines.push(
          [
            row.session_id,
            row.session_date,
            row.class_label || '',
            row.period_label || '',
            ent.learner_id,
            ent.status,
            (ent.note || '').replace(/"/g, '""'),
          ]
            .map((v) => `"${String(v ?? '')}"`)
            .join(','),
        );
      });
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.csv"');
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('[getAttendanceReportCsv]', err);
    res.status(500).json({ message: 'Unable to export attendance' });
  }
}

// ───────────────────────── Announcements ─────────────────────────
function normalizeAnnouncementPayload(raw = {}) {
  return {
    ...raw,

    // allow both client styles
    pinned: raw.pinned ?? raw.is_pinned ?? false,
    start_at: raw.start_at ?? raw.visible_from ?? null,
    end_at: raw.end_at ?? raw.visible_to ?? null,
    category: raw.category ?? raw.kind ?? 'general',

    // safe default
    audience: raw.audience ?? 'all',
     class_label: normalizeClassLabel(raw.class_label ?? raw.classLabel ?? raw.class ?? null),
  };
}

export async function createAnnouncement(req, res) {
  const orgId = req.params?.orgId || normalizeOrgId(req);
  const userId = req.user?.id;

  if (!orgId) return res.status(400).json({ message: 'orgId required' });
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const body = normalizeAnnouncementPayload(req.body);
  const { error, value } = announcementSchema.validate(body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
      `insert into org_announcements
         (org_id, author_id, audience, class_label, title, body, pinned, start_at, end_at, category,
          meeting_at, meeting_location, meeting_url, agenda_md, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       returning *`,
      [
        orgId,
        Number(userId),
        value.audience,
        value.class_label || null, // ✅ NEW
        value.title,
        value.body,
        !!value.pinned,
        value.start_at || null,
        value.end_at || null,
        value.category || 'general',
        value.meeting_at || null,
        value.meeting_location || null,
        value.meeting_url || null,
        value.agenda_md || null,
        value.metadata || {},
      ],
    );

    return res.json(rows[0]);
  } catch (err) {
    console.error('[createAnnouncement] error:', err);
    return res.status(500).json({ message: 'Unable to post announcement' });
  }
}


export async function updateAnnouncement(req, res) {
  const orgId = normalizeOrgId(req);
  const announcementId = Number(req.params?.announcementId);

  const body = normalizeAnnouncementPayload(req.body);
  const { error, value } = announcementUpdateSchema.validate(body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
      `update org_announcements
          set audience = coalesce($3, audience),
              class_label = coalesce($4, class_label), -- ✅ NEW
              title = coalesce($5, title),
              body = coalesce($6, body),
              pinned = coalesce($7, pinned),
              start_at = coalesce($8, start_at),
              end_at = coalesce($9, end_at),
              category = coalesce($10, category),
              meeting_at = coalesce($11, meeting_at),
              meeting_location = coalesce($12, meeting_location),
              meeting_url = coalesce($13, meeting_url),
              agenda_md = coalesce($14, agenda_md),
              metadata = coalesce($15, metadata)
        where org_id = $1 and id = $2
        returning *`,
      [
        orgId,
        announcementId,
        value.audience ?? null,
        value.class_label ?? null, // ✅ NEW
        value.title ?? null,
        value.body ?? null,
        value.pinned,
        value.start_at ?? null,
        value.end_at ?? null,
        value.category ?? null,
        value.meeting_at ?? null,
        value.meeting_location ?? null,
        value.meeting_url ?? null,
        value.agenda_md ?? null,
        value.metadata ?? null,
      ],
    );

    if (!rows.length) return res.status(404).json({ message: 'Announcement not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[updateAnnouncement]', err);
    return res.status(500).json({ message: 'Unable to update announcement' });
  }
}


export async function deleteAnnouncement(req, res) {
  const orgId = normalizeOrgId(req);
  const announcementId = Number(req.params?.announcementId);
  if (!announcementId) return res.status(400).json({ message: 'announcementId required' });

  try {
    const { rowCount } = await pool.query(`delete from org_announcements where org_id=$1 and id=$2`, [
      orgId,
      announcementId,
    ]);
    if (!rowCount) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[deleteAnnouncement]', err);
    res.status(500).json({ message: 'Unable to delete announcement' });
  }
}

export async function listAnnouncements(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = announcementQuerySchema.validate(req.query, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  const audience = req.query?.audience || 'all';
  const classLabel = normalizeClassLabel(req.query?.class_label || null);

  try {
    const { rows } = await pool.query(
      `select *,
              case
                when end_at is not null and end_at < now() then 'expired'
                when start_at is not null and start_at > now() then 'scheduled'
                else 'live'
              end as status
         from org_announcements
        where org_id = $1
          and (audience = 'all' or audience = $2)
          and ($3::text is null or class_label = $3) -- ✅ admin filter
        order by pinned desc, created_at desc
        limit $4 offset $5`,
      [orgId, audience, classLabel, value.limit, value.offset],
    );

    return res.json({ items: rows });
  } catch (err) {
    console.error('[listAnnouncements]', err);
    return res.status(500).json({ message: 'Unable to load announcements' });
  }
}


export async function getAnnouncementFeed(req, res) {
  const orgId = normalizeOrgId(req);

  const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
  const limit = Math.min(50, parseInt(req.query?.limit, 10) || 20);
  const offset = (page - 1) * limit;

  const userId = req.user?.id;

  // allow /?debug=1 to get step-by-step counts
  const debug = String(req.query?.debug || '') === '1';

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────
  const normAudience = (v) =>
    String(v || '')
      .trim()
      .toLowerCase();

  const roleToAudience = (role) => {
    const r = String(role || '').toLowerCase();
    if (r.includes('learner') || r.includes('student')) return 'learners';
    if (r.includes('instructor') || r.includes('teacher') || r.includes('tutor')) return 'instructors';
    if (r.includes('parent') || r.includes('guardian')) return 'parents';
    return 'all'; // staff/admin/unknown
  };

  // ─────────────────────────────────────────────
  // Role + class resolution (works even when req.user.role is empty)
  // ─────────────────────────────────────────────
  const roleRaw = String(req.user?.role || req.user?.type || req.user?.account_type || '').toLowerCase();

  // If this returns a class label, they are definitely a learner in this org
  const resolvedLearnerClass = await resolveMyLearnerClassLabel(pool, orgId, userId);

  // infer role if token doesn't carry it
  const inferredRole = roleRaw || (resolvedLearnerClass ? 'learner' : 'staff');
  const myAudience = roleToAudience(inferredRole);

  // class override: ONLY allow staff/admin to override (learners shouldn't browse other classes)
  const classOverrideRaw = req.query?.class_label || null;
  const classOverride = normalizeClassLabel(classOverrideRaw);

  const effectiveClass = myAudience === 'all' ? (classOverride || null) : (resolvedLearnerClass || null);

  // audience filtering
  // - learners see: ['all','learners']
  // - instructors see: ['all','instructors']
  // - staff see: all audiences unless narrowed by ?audience=
  const audienceReq = normAudience(req.query?.audience || '');
  let audiences;

  if (myAudience === 'all') {
    // staff/admin: allow filter by any audience string, else show everything
    audiences = audienceReq ? [audienceReq] : ['all', 'learners', 'instructors', 'parents'];
  } else {
    // learner/instructor/parent: always include global + their audience
    audiences = ['all', myAudience];
  }

  // ─────────────────────────────────────────────
  // ✅ NEW: scope (live / live_upcoming / all)
  // learners: default live_upcoming (so they see scheduled items too)
  // staff: default all
  // ─────────────────────────────────────────────
  const scopeReq = String(req.query?.scope || '').toLowerCase();
  const scope = scopeReq || (myAudience === 'all' ? 'all' : 'live_upcoming');

  const timeWhere =
    scope === 'all'
      ? `true`
      : scope === 'live'
        ? `(start_at is null or start_at <= now())
           and (end_at is null or end_at >= now())`
        : // live_upcoming: exclude expired, include future
          `(end_at is null or end_at >= now())`;

  if (debug) {
    console.log('[getAnnouncementFeed] filters', {
      orgId,
      userId,
      roleRaw,
      inferredRole,
      myAudience,
      audienceReq,
      audiences,
      classOverride,
      resolvedLearnerClass,
      effectiveClass,
      scopeReq,
      scope,
      now: new Date().toISOString(),
    });
  }

  try {
    // ✅ Main feed query (adds status)
    const { rows } = await pool.query(
      `select *,
              case
                when end_at is not null and end_at < now() then 'expired'
                when start_at is not null and start_at > now() then 'scheduled'
                else 'live'
              end as status
         from org_announcements
        where org_id = $1
          and audience = any($2::text[])
          and (${timeWhere})
          and (
            class_label is null
            or ($3::text is not null and class_label = $3)
          )
        order by pinned desc, created_at desc
        limit $4 offset $5`,
      [orgId, audiences, effectiveClass, limit, offset],
    );

    // ✅ Debug: show which filter killed results (ONLY when debug=1)
    let diag = null;
    if (debug) {
      const c0 = await pool.query(`select count(*)::int as c from org_announcements where org_id=$1`, [orgId]);

      const c1 = await pool.query(
        `select count(*)::int as c
           from org_announcements
          where org_id=$1
            and audience = any($2::text[])`,
        [orgId, audiences],
      );

      // scope-aware time window count
      const c2 = await pool.query(
        `select count(*)::int as c
           from org_announcements
          where org_id=$1
            and audience = any($2::text[])
            and (${timeWhere})`,
        [orgId, audiences],
      );

      const c3 = await pool.query(
        `select count(*)::int as c
           from org_announcements
          where org_id=$1
            and audience = any($2::text[])
            and (${timeWhere})
            and (class_label is null or ($3::text is not null and class_label = $3))`,
        [orgId, audiences, effectiveClass],
      );

      diag = {
        base_org: c0.rows[0]?.c ?? 0,
        after_audience: c1.rows[0]?.c ?? 0,
        after_time_window: c2.rows[0]?.c ?? 0,
        after_class: c3.rows[0]?.c ?? 0,
        scope,
      };

      console.log('[getAnnouncementFeed] diag', diag);
      console.log('[getAnnouncementFeed] result', {
        count: rows.length,
        sample: rows[0]
          ? {
              id: rows[0].id,
              title: rows[0].title,
              audience: rows[0].audience,
              class_label: rows[0].class_label,
              start_at: rows[0].start_at,
              end_at: rows[0].end_at,
              pinned: rows[0].pinned,
              status: rows[0].status,
            }
          : null,
      });
    }

    return res.json({
      items: rows,
      page,
      limit,
      audiences,
      class_label: effectiveClass || null,
      scope,
      ...(debug ? { diag } : {}),
    });
  } catch (err) {
    console.error('[getAnnouncementFeed]', err);
    return res.status(500).json({ message: 'Unable to load announcement feed' });
  }
}



export async function getAnnouncementAgmPdf(req, res) {
  const orgId = normalizeOrgId(req);
  const announcementId = Number(req.params?.announcementId);
  if (!announcementId) return res.status(400).json({ message: 'announcementId required' });

  try {
    const { rows } = await pool.query(
      `select * from org_announcements where org_id = $1 and id = $2 limit 1`,
      [orgId, announcementId],
    );
    if (!rows.length) return res.status(404).json({ message: 'Announcement not found' });

    const announcement = rows[0];
    if ((announcement.category || '').toLowerCase() !== 'agm') {
      return res.status(400).json({ message: 'Not an AGM announcement' });
    }

    const pdf = await renderAnnouncementPdf({ announcement });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="agm.pdf"');
    res.end(pdf, 'binary');
  } catch (err) {
    console.error('[getAnnouncementAgmPdf]', err);
    res.status(500).json({ message: 'Unable to render AGM PDF' });
  }
}

// ───────────────────────── Sports & clubs ─────────────────────────

function normalizeSportsPayload(raw = {}) {
  // support both styles (older UI used start_at/end_at)
  return {
    title: raw.title,
    description: raw.description ?? null,

    kind: raw.kind ?? raw.type ?? 'fixture',
    team_label: raw.team_label ?? raw.teamLabel ?? raw.team ?? null,
    opponent: raw.opponent ?? raw.vs ?? null,

    event_at: raw.event_at ?? raw.start_at ?? raw.startAt ?? null,
    end_at: raw.end_at ?? raw.endAt ?? null,

    location: raw.location ?? null,
    audience: raw.audience ?? 'all',
    status: raw.status ?? 'scheduled',

    score_home: raw.score_home ?? raw.scoreHome ?? null,
    score_away: raw.score_away ?? raw.scoreAway ?? null,

    metadata: raw.metadata ?? {},
  };
}

export async function createSportsEvent(req, res) {
  const orgId = normalizeOrgId(req);
  const body = normalizeSportsPayload(req.body);

  const { error, value } = sportsEventSchema.validate(body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
      `insert into org_sports_events
         (org_id, title, description, kind, team_label, opponent, event_at, end_at, location, audience, status,
          score_home, score_away, metadata, created_by)
       values
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       returning *`,
      [
        orgId,
        value.title,
        value.description || null,
        value.kind || 'fixture',
        value.team_label || null,
        value.opponent || null,
        value.event_at || null,
        value.end_at || null,
        value.location || null,
        value.audience || 'all',
        value.status || 'scheduled',
        value.score_home ?? null,
        value.score_away ?? null,
        value.metadata || {},
        req.user?.id ?? null,
      ],
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[createSportsEvent]', err);
    res.status(500).json({ message: 'Unable to create sports event' });
  }
}

export async function updateSportsEvent(req, res) {
  const orgId = normalizeOrgId(req);
  const eventId = Number(req.params?.eventId);
  if (!eventId) return res.status(400).json({ message: 'eventId required' });

  const body = normalizeSportsPayload(req.body);
  const { error, value } = sportsEventUpdateSchema.min(1).validate(body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
      `update org_sports_events
          set title = coalesce($3, title),
              description = coalesce($4, description),
              kind = coalesce($5, kind),
              team_label = coalesce($6, team_label),
              opponent = coalesce($7, opponent),
              event_at = coalesce($8, event_at),
              end_at = coalesce($9, end_at),
              location = coalesce($10, location),
              audience = coalesce($11, audience),
              status = coalesce($12, status),
              score_home = coalesce($13, score_home),
              score_away = coalesce($14, score_away),
              metadata = coalesce($15, metadata),
              updated_at = now()
        where org_id = $1 and id = $2
        returning *`,
      [
        orgId,
        eventId,
        value.title ?? null,
        value.description ?? null,
        value.kind ?? null,
        value.team_label ?? null,
        value.opponent ?? null,
        value.event_at ?? null,
        value.end_at ?? null,
        value.location ?? null,
        value.audience ?? null,
        value.status ?? null,
        value.score_home ?? null,
        value.score_away ?? null,
        value.metadata ?? null,
      ],
    );
    if (!rows.length) return res.status(404).json({ message: 'Event not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[updateSportsEvent]', err);
    res.status(500).json({ message: 'Unable to update sports event' });
  }
}

export async function deleteSportsEvent(req, res) {
  const orgId = normalizeOrgId(req);
  const eventId = Number(req.params?.eventId);
  if (!eventId) return res.status(400).json({ message: 'eventId required' });

  try {
    const { rowCount } = await pool.query(
      `delete from org_sports_events where org_id=$1 and id=$2`,
      [orgId, eventId],
    );
    if (!rowCount) return res.status(404).json({ message: 'Event not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[deleteSportsEvent]', err);
    res.status(500).json({ message: 'Unable to delete sports event' });
  }
}

export async function listSportsEvents(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = sportsQuerySchema.validate(req.query, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  const q = value.q ? `%${String(value.q).trim()}%` : null;

  try {
    const { rows } = await pool.query(
      `select *,
              case
                when status = 'completed' then 'completed'
                when status = 'cancelled' then 'cancelled'
                when event_at is not null and event_at < now() then 'past'
                else 'upcoming'
              end as bucket
         from org_sports_events
        where org_id = $1
          and ($2::timestamptz is null or event_at >= $2)
          and ($3::timestamptz is null or event_at <= $3)
          and ($4::text is null or status = $4)
          and ($5::text is null or kind = $5)
          and ($6::text is null or team_label = $6)
          and ($7::text is null or audience = $7)
          and ($8::text is null or (
                title ilike $8
                or coalesce(description,'') ilike $8
                or coalesce(opponent,'') ilike $8
                or coalesce(team_label,'') ilike $8
              ))
        order by event_at asc nulls last, created_at desc
        limit $9 offset $10`,
      [
        orgId,
        value.start || null,
        value.end || null,
        value.status || null,
        value.kind || null,
        value.team_label || null,
        value.audience || null,
        q,
        value.limit,
        value.offset,
      ],
    );

    if (value.format === 'csv') {
      const lines = [
        'id,title,kind,team_label,opponent,status,event_at,end_at,location,audience,score_home,score_away,description',
      ];
      rows.forEach((r) =>
        lines.push(
          [
            r.id,
            r.title,
            r.kind || '',
            r.team_label || '',
            r.opponent || '',
            r.status || '',
            r.event_at || '',
            r.end_at || '',
            r.location || '',
            r.audience || '',
            r.score_home ?? '',
            r.score_away ?? '',
            (r.description || '').replace(/\s+/g, ' ').trim(),
          ]
            .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
            .join(','),
        ),
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="sports-events.csv"');
      return res.send(lines.join('\n'));
    }

    res.json({ items: rows });
  } catch (err) {
    console.error('[listSportsEvents]', err);
    res.status(500).json({ message: 'Unable to load sports events' });
  }
}


export async function createClub(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = clubSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
      `insert into org_clubs (org_id, name, description, advisor_id, meeting_schedule, is_active)
       values ($1,$2,$3,$4,$5,$6)
       returning *`,
      [orgId, value.name, value.description || null, value.advisor_id || null, value.meeting_schedule || null, value.is_active],
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[createClub]', err);
    res.status(500).json({ message: 'Unable to create club' });
  }
}

export async function updateClub(req, res) {
  const orgId = normalizeOrgId(req);
  const clubId = Number(req.params?.clubId);
  if (!clubId) return res.status(400).json({ message: 'clubId required' });
  const { error, value } = clubUpdateSchema.min(1).validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
      `update org_clubs
          set name = coalesce($3, name),
              description = coalesce($4, description),
              advisor_id = coalesce($5, advisor_id),
              meeting_schedule = coalesce($6, meeting_schedule),
              is_active = coalesce($7, is_active)
        where org_id = $1 and id = $2
        returning *`,
      [
        orgId,
        clubId,
        value.name || null,
        value.description || null,
        value.advisor_id || null,
        value.meeting_schedule || null,
        value.is_active,
      ],
    );
    if (!rows.length) return res.status(404).json({ message: 'Club not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[updateClub]', err);
    res.status(500).json({ message: 'Unable to update club' });
  }
}

export async function deleteClub(req, res) {
  const orgId = normalizeOrgId(req);
  const clubId = Number(req.params?.clubId);
  if (!clubId) return res.status(400).json({ message: 'clubId required' });

  try {
    const { rowCount } = await pool.query(`delete from org_clubs where org_id=$1 and id=$2`, [orgId, clubId]);
    if (!rowCount) return res.status(404).json({ message: 'Club not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[deleteClub]', err);
    res.status(500).json({ message: 'Unable to delete club' });
  }
}

export async function listClubs(req, res) {
  const orgId = normalizeOrgId(req);
  try {
    const { rows } = await pool.query(
      `select c.*, count(m.id) as member_count
         from org_clubs c
         left join org_club_memberships m on m.club_id = c.id
        where c.org_id = $1
        group by c.id
        order by c.is_active desc, c.updated_at desc, c.id desc
        limit 200`,
      [orgId],
    );
    res.json({ items: rows });
  } catch (err) {
    console.error('[listClubs]', err);
    res.status(500).json({ message: 'Unable to load clubs' });
  }
}

export async function listClubMembers(req, res) {
  const orgId = normalizeOrgId(req);
  const clubId = Number(req.params?.clubId);
  if (!clubId) return res.status(400).json({ message: 'clubId required' });

  try {
    const { rows } = await pool.query(
      `
      select
        m.id,
        m.club_id,
        m.member_id,
        m.role,
        m.joined_at,

        lp.user_id,
        lp.admission_code,
        lp.class_label,

        u.email,

        coalesce(
          nullif(u.email, ''),
          nullif(lp.admission_code, ''),
          'Member ' || m.member_id::text
        ) as member_name

      from org_club_memberships m
      join org_clubs c
        on c.id = m.club_id
       and c.org_id = $2
      left join org_learner_profiles lp
        on lp.id = m.member_id
      left join users u
        on u.id = lp.user_id
      where m.club_id = $1
      order by m.joined_at desc nulls last, m.id desc
      `,
      [clubId, orgId],
    );

    return res.json({ members: rows });
  } catch (err) {
    console.error('[listClubMembers]', err);
    return res.status(500).json({ message: 'Unable to load club members' });
  }
}


export async function enrollClubMember(req, res) {
  const orgId = normalizeOrgId(req);
  const clubId = Number(req.params?.clubId);

  try {
    if (!clubId) return res.status(400).json({ message: 'clubId required' });

    const club = await pool.query(
      `select id from org_clubs where org_id=$1 and id=$2 limit 1`,
      [orgId, clubId],
    );
    if (!club.rows.length) return res.status(404).json({ message: 'Club not found' });

    const { member_id, role } = req.body || {};

    // ✅ MUST be UUID for org_club_memberships.member_id
    const learnerProfileId = await resolveLearnerProfileId(orgId, member_id);

    if (!learnerProfileId) {
      return res.status(400).json({
        message: 'Invalid member_id. Provide learner profile UUID OR numeric user_id that belongs to this org.',
      });
    }

    const safeRole = String(role || 'member').trim() || 'member';

    const { rows } = await pool.query(
      `insert into org_club_memberships (club_id, member_id, role)
       values ($1,$2,$3)
       on conflict (club_id, member_id)
       do update set role = excluded.role
       returning club_id, member_id, role`,
      [clubId, learnerProfileId, safeRole],
    );

    return res.json(rows[0]);
  } catch (e) {
    console.error('[enrollClubMember] failed', e);
    return res.status(500).json({ message: 'Failed to enroll member' });
  }
}

export async function unenrollClubMember(req, res) {
  const orgId = normalizeOrgId(req);
  const clubId = Number(req.params?.clubId);

  const { error, value } = membershipParamsSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const learnerProfileId = await resolveLearnerProfileId(orgId, value.member_id);
    if (!learnerProfileId) {
      return res.status(400).json({
        message: 'Invalid member_id. Provide learner profile UUID OR numeric user_id that belongs to this org.',
      });
    }

    const { rowCount } = await pool.query(
      `delete from org_club_memberships
        where club_id = $1 and member_id = $2
          and exists (select 1 from org_clubs c where c.id=$1 and c.org_id=$3)`,
      [clubId, learnerProfileId, orgId],
    );

    if (!rowCount) return res.status(404).json({ message: 'Membership not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[unenrollClubMember]', err);
    return res.status(500).json({ message: 'Unable to unenroll member' });
  }
}


export async function getMyClubs(req, res) {
  const orgId = normalizeOrgId(req);

  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.json({ items: [] });

    // ✅ resolve learner_profile UUID
    const lp = await pool.query(
      `select id
         from org_learner_profiles
        where org_id=$1 and user_id=$2
        limit 1`,
      [orgId, userId],
    );
    if (!lp.rows.length) return res.json({ items: [] });

    const learnerProfileId = lp.rows[0].id;

    const { rows } = await pool.query(
      `select c.*,
              (select count(*)::int from org_club_memberships mm where mm.club_id = c.id) as member_count
         from org_clubs c
         join org_club_memberships m on m.club_id = c.id
        where c.org_id = $1
          and m.member_id = $2
        order by c.created_at desc nulls last, c.id desc`,
      [orgId, learnerProfileId],
    );

    return res.json({ items: rows });
  } catch (e) {
    console.error('[getMyClubs] failed', e);
    return res.status(500).json({ message: 'Failed to load my clubs' });
  }
}


// ───────────────────────── Message log ─────────────────────────
export async function listMessageLogs(req, res) {
  const orgId = normalizeOrgId(req);
  const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query?.limit, 10) || 50);
  const offset = (page - 1) * limit;

  try {
    const { rows } = await pool.query(
      `select *
         from org_message_log
        where org_id = $1
        order by created_at desc
        limit $2 offset $3`,
      [orgId, limit, offset],
    );
    res.json({ items: rows, page, limit });
  } catch (err) {
    console.error('[listMessageLogs]', err);
    res.status(500).json({ message: 'Unable to load messages' });
  }
}

async function insertLog(orgId, payload) {
  const { rows } = await pool.query(
    `insert into org_message_log (org_id, recipient_id, channel, template_key, subject, payload, status, error, sent_at, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     returning *`,
    [
      orgId,
      payload.recipient_id || null,
      payload.channel || 'email',
      payload.template_key || null,
      payload.subject || null,
      payload.payload || {},
      payload.status || 'queued',
      payload.error || null,
      payload.sent_at || null,
    ],
  );
  return rows[0];
}

export async function sendMessageNow(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = messageSendSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  const results = [];
  for (const recipient of value.recipients || []) {
    let status = 'queued';
    let errorText = null;
    let sentAt = null;

    try {
      if (recipient.email) {
        const { sendNotification } = await import('../utils/sendNotification.js');
        await sendNotification({
          to: recipient.email,
          subject: value.subject || 'Message',
          body: value.body || null,
          details: value.payload?.details || null,
        });
        status = 'sent';
        sentAt = new Date().toISOString();
      } else {
        status = 'sent';
        sentAt = new Date().toISOString();
      }
    } catch (err) {
      status = 'failed';
      errorText = err?.message || 'send failed';
    }

    const log = await insertLog(orgId, {
      recipient_id: recipient.user_id || null,
      channel: recipient.channel || 'email',
      template_key: value.template_key || null,
      subject: value.subject,
      payload: { ...value.payload, recipient },
      status,
      error: errorText,
      sent_at: sentAt,
    });
    results.push(log);
  }

  res.json({ items: results });
}

// ✅ Clear ALL saved attendance entries for a session (DB clear)
export async function clearAttendanceEntries(req, res) {
  const orgId = normalizeOrgId(req);
  const sessionId = Number(req.params?.sessionId);
  if (!sessionId) return res.status(400).json({ message: 'sessionId required' });

  try {
    // ensure session exists and belongs to org
    const s = await pool.query(
      `select id
         from org_attendance_sessions
        where org_id = $1 and id = $2
        limit 1`,
      [orgId, sessionId],
    );
    if (!s.rows.length) return res.status(404).json({ message: 'Session not found' });

    const { rowCount } = await pool.query(
      `delete from org_attendance_entries
        where session_id = $1`,
      [sessionId],
    );

    return res.json({ ok: true, deleted: rowCount || 0 });
  } catch (err) {
    console.error('[clearAttendanceEntries]', err);
    return res.status(500).json({ message: 'Unable to clear attendance' });
  }
}
