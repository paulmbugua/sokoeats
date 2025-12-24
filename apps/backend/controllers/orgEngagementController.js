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

const normalizeOrgId = (req) => req.params?.orgId || req.body?.org_id || req.query?.org_id;

function isUuid(v) {
  const s = String(v || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
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
      `select id
         from org_attendance_sessions
        where org_id=$1 and id=$2
        limit 1`,
      [orgId, sessionId],
    );
    if (!session.rows.length) return res.status(404).json({ message: 'Session not found' });

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
  };
}

export async function createAnnouncement(req, res) {
  const orgId = req.params?.orgId || normalizeOrgId(req);
  if (!orgId) return res.status(400).json({ message: 'orgId required' });

  const body = normalizeAnnouncementPayload(req.body);
  const { error, value } = announcementSchema.validate(body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const actorUuid = await resolveOrgActorUuid(pool, orgId, req.user || {});

    console.log('[createAnnouncement] ctx', {
      orgId,
      userId: req.user?.id,
      userIdType: typeof req.user?.id,
      actorUuid,
      actorUuid_ok: Boolean(actorUuid),
    });

    if (!actorUuid) {
      return res.status(400).json({
        message: 'Unable to resolve actor profile for this org user.',
        debug: { orgId, userId: req.user?.id },
      });
    }

    const { rows } = await pool.query(
      `insert into org_announcements
         (org_id, author_id, audience, title, body, pinned, start_at, end_at, category,
          meeting_at, meeting_location, meeting_url, agenda_md, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning *`,
      [
        orgId,
        actorUuid, // ✅ uuid now
        value.audience,
        value.title,
        value.body,
        value.pinned,
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
    console.error('[createAnnouncement] error:', err, {
      orgId,
      userId: req.user?.id,
      userIdType: typeof req.user?.id,
    });
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
              title = coalesce($4, title),
              body = coalesce($5, body),
              pinned = coalesce($6, pinned),
              start_at = coalesce($7, start_at),
              end_at = coalesce($8, end_at),
              category = coalesce($9, category),
              meeting_at = coalesce($10, meeting_at),
              meeting_location = coalesce($11, meeting_location),
              meeting_url = coalesce($12, meeting_url),
              agenda_md = coalesce($13, agenda_md),
              metadata = coalesce($14, metadata)
        where org_id = $1 and id = $2
        returning *`,
      [
        orgId,
        announcementId,
        value.audience || null,
        value.title || null,
        value.body || null,
        value.pinned,
        value.start_at || null,
        value.end_at || null,
        value.category || null,
        value.meeting_at || null,
        value.meeting_location || null,
        value.meeting_url || null,
        value.agenda_md || null,
        value.metadata || null,
      ],
    );
    if (!rows.length) return res.status(404).json({ message: 'Announcement not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[updateAnnouncement]', err);
    res.status(500).json({ message: 'Unable to update announcement' });
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
        order by pinned desc, created_at desc
        limit $3 offset $4`,
      [orgId, audience, value.limit, value.offset],
    );
    res.json({ items: rows });
  } catch (err) {
    console.error('[listAnnouncements]', err);
    res.status(500).json({ message: 'Unable to load announcements' });
  }
}


export async function getAnnouncementFeed(req, res) {
  const orgId = normalizeOrgId(req);
  const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
  const limit = Math.min(50, parseInt(req.query?.limit, 10) || 20);
  const offset = (page - 1) * limit;
  const audience = req.query?.audience || 'all';

  try {
    const { rows } = await pool.query(
      `select *
         from org_announcements
        where org_id = $1
          and (audience = 'all' or audience = $2)
          and (start_at is null or start_at <= now())
          and (end_at is null or end_at >= now())
        order by pinned desc, created_at desc
        limit $3 offset $4`,
      [orgId, audience, limit, offset],
    );
    res.json({ items: rows, page, limit });
  } catch (err) {
    console.error('[getAnnouncementFeed]', err);
    res.status(500).json({ message: 'Unable to load announcement feed' });
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
export async function createSportsEvent(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = sportsEventSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
      `insert into org_sports_events (org_id, title, description, event_at, location, audience, created_by)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning *`,
      [
        orgId,
        value.title,
        value.description || null,
        value.event_at || null,
        value.location || null,
        value.audience || 'all',
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
  const { error, value } = sportsEventUpdateSchema.min(1).validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
      `update org_sports_events
          set title = coalesce($3, title),
              description = coalesce($4, description),
              event_at = coalesce($5, event_at),
              location = coalesce($6, location),
              audience = coalesce($7, audience)
        where org_id = $1 and id = $2
        returning *`,
      [orgId, eventId, value.title || null, value.description || null, value.event_at || null, value.location || null, value.audience || null],
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
    const { rowCount } = await pool.query(`delete from org_sports_events where org_id=$1 and id=$2`, [
      orgId,
      eventId,
    ]);
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

  try {
    const { rows } = await pool.query(
      `select *
         from org_sports_events
        where org_id = $1
          and ($2::timestamptz is null or event_at >= $2)
          and ($3::timestamptz is null or event_at <= $3)
        order by event_at asc nulls last, created_at desc
        limit $4 offset $5`,
      [orgId, value.start || null, value.end || null, value.limit, value.offset],
    );

    if (value.format === 'csv') {
      const lines = ['id,title,description,event_at,location,audience'];
      rows.forEach((r) =>
        lines.push(
          [r.id, r.title, r.description || '', r.event_at || '', r.location || '', r.audience || '']
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
      `select m.*, u.first_name, u.last_name, u.email
         from org_club_memberships m
         left join users u on u.id = m.member_id
        where m.club_id = $1
          and exists (select 1 from org_clubs c where c.id = m.club_id and c.org_id = $2)
        order by m.joined_at desc`,
      [clubId, orgId],
    );
    res.json({ members: rows });
  } catch (err) {
    console.error('[listClubMembers]', err);
    res.status(500).json({ message: 'Unable to load club members' });
  }
}

export async function enrollClubMember(req, res) {
  const orgId = normalizeOrgId(req);
  const clubId = Number(req.params?.clubId);
  const { error, value } = membershipParamsSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const clubRes = await pool.query(`select id from org_clubs where org_id=$1 and id=$2 limit 1`, [
      orgId,
      clubId,
    ]);
    if (!clubRes.rows.length) return res.status(404).json({ message: 'Club not found' });

    const { rows } = await pool.query(
      `insert into org_club_memberships (club_id, member_id, role)
       values ($1,$2,$3)
       on conflict (club_id, member_id)
       do update set role = excluded.role
       returning *`,
      [clubId, value.member_id, value.role || 'member'],
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[enrollClubMember]', err);
    res.status(500).json({ message: 'Unable to enroll member' });
  }
}

export async function unenrollClubMember(req, res) {
  const orgId = normalizeOrgId(req);
  const clubId = Number(req.params?.clubId);
  const { error, value } = membershipParamsSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rowCount } = await pool.query(
      `delete from org_club_memberships
        where club_id = $1 and member_id = $2
          and exists (select 1 from org_clubs c where c.id=$1 and c.org_id=$3)`,
      [clubId, value.member_id, orgId],
    );
    if (!rowCount) return res.status(404).json({ message: 'Membership not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[unenrollClubMember]', err);
    res.status(500).json({ message: 'Unable to unenroll member' });
  }
}

export async function getMyClubs(req, res) {
  const orgId = normalizeOrgId(req);
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const { rows } = await pool.query(
      `select c.*
         from org_club_memberships m
         join org_clubs c on c.id = m.club_id
        where m.member_id = $1 and c.org_id = $2
        order by c.name asc`,
      [userId, orgId],
    );
    res.json({ items: rows });
  } catch (err) {
    console.error('[getMyClubs]', err);
    res.status(500).json({ message: 'Unable to load clubs' });
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
