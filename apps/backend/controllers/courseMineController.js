// apps/backend/controllers/courseMineController.js
import pool from '../config/db.js';

// eslint-disable-next-line no-console
console.log('[unlocked-ai][build] module loaded', {
  file: __filename,
  build: 'UNLOCKED_AI_BUILD_2026_01_11B',
});

const DBG_ENV =
  process.env.DBG_UNLOCKED === '1' ||
  process.env.DBG_COURSE_MINE === '1' ||
  process.env.DBG_AUTH === '1';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v.trim());
}

function log(enabled, label, payload) {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.log(`[unlocked-ai] ${label}`, payload ?? '');
}

function shortRows(rows, keys) {
  return (rows || []).slice(0, 8).map((r) => {
    const out = {};
    for (const k of keys) out[k] = r?.[k];
    return out;
  });
}

async function tableExists(tableName) {
  const q = await pool.query(`SELECT to_regclass($1) AS reg`, [`public.${tableName}`]);
  return Boolean(q.rows?.[0]?.reg);
}

async function pickTimeColumn(tableName, candidates) {
  const q = await pool.query(
    `
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name=$1
       AND column_name = ANY($2::text[])
    `,
    [tableName, candidates],
  );
  const set = new Set((q.rows || []).map((r) => r.column_name));
  return candidates.find((c) => set.has(c)) || null;
}

function normalizeQueryToken(qVal) {
  if (!qVal) return null;
  if (Array.isArray(qVal)) return String(qVal[0]);
  return String(qVal);
}

function coerceInt(val) {
  if (val == null) return null;
  if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
  const s = String(val).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve numeric users.id (used by enrollments.student_id, course_purchases.student_id, etc.)
 * With updated anyAuth, req.user.users_id should exist.
 */
async function resolveUsersIdFromReq(req, dbg = false) {
  const directUsersId = coerceInt(req.user?.users_id);
  if (directUsersId) return { userId: directUsersId, via: 'req.user.users_id', raw: directUsersId };

  // Fallbacks (legacy)
  const candidates = [
    req.user?.userId,
    req.user?.user_id,
    req.user?.id,
    req.user?.profileId,
    req.user?.profile_id,
  ].filter((v) => v != null && String(v).trim() !== '');

  for (const cand of candidates) {
    const n = coerceInt(cand);
    if (!n) continue;

    // Try as users.id
    const u = await pool.query(`SELECT id FROM users WHERE id=$1 LIMIT 1`, [n]);
    if (u.rowCount) return { userId: n, via: 'users.id', raw: cand };

    // Try as profiles.id -> user_id
    const p = await pool.query(`SELECT user_id FROM profiles WHERE id=$1 LIMIT 1`, [n]);
    const mapped = coerceInt(p.rows?.[0]?.user_id);
    if (mapped) return { userId: mapped, via: 'profiles.id→user_id', raw: cand };
  }

  // Optional: email fallback
  const email = String(req.user?.email || '').trim().toLowerCase();
  if (email) {
    const u = await pool.query(`SELECT id FROM users WHERE lower(email)=$1 LIMIT 1`, [email]);
    const id = coerceInt(u.rows?.[0]?.id);
    if (id) return { userId: id, via: 'users.email', raw: email };
  }

  if (dbg) {
    // eslint-disable-next-line no-console
    console.log('[unlocked-ai][dbg] failed to resolve users.id', {
      snapshot: {
        id: req.user?.id,
        users_id: req.user?.users_id,
        userId: req.user?.userId,
        user_id: req.user?.user_id,
        profileId: req.user?.profileId,
        profile_id: req.user?.profile_id,
        email: req.user?.email,
        auth_uuid: req.user?.auth_uuid,
        sub: req.user?.sub,
        uid: req.user?.uid,
        user_uuid: req.user?.user_uuid,
      },
      candidates,
    });
  }

  return { userId: null, via: 'none', raw: candidates[0] };
}

/**
 * Resolve UUID used by ai_course_entitlements.user_id (uuid).
 * With updated anyAuth, req.user.auth_uuid should exist.
 */
function pickAuthUuidFromReq(req) {
  const cand = [
    req.user?.auth_uuid,
    req.user?.uid,
    req.user?.sub,
    req.user?.auth_user_id,
    req.user?.user_uuid,
    req.auth?.sub,
    req.auth?.uid,
  ];
  for (const v of cand) {
    if (isUuid(v)) return String(v).trim();
  }
  return null;
}

async function resolveAuthUuidFromReq(req, userIdNum, dbg = false) {
  const direct = pickAuthUuidFromReq(req);
  if (direct) return { authUuid: direct, via: 'req/token', raw: direct };

  const n = coerceInt(userIdNum);
  if (!n) return { authUuid: null, via: 'none', raw: null };

  try {
    const q = await pool.query(`SELECT auth_uuid::text AS uid FROM users WHERE id=$1 LIMIT 1`, [n]);
    const uid = q.rows?.[0]?.uid ? String(q.rows[0].uid) : null;
    if (isUuid(uid)) return { authUuid: uid, via: 'users.auth_uuid', raw: uid };
  } catch (e) {
    log(dbg, 'users.auth_uuid lookup failed', e?.message || e);
  }

  log(dbg, 'could not resolve auth UUID', {
    userIdNum: n,
    snapshot: {
      users_id: req.user?.users_id,
      id: req.user?.id,
      email: req.user?.email,
      auth_uuid: req.user?.auth_uuid,
      sub: req.user?.sub,
      uid: req.user?.uid,
    },
  });

  return { authUuid: null, via: 'none', raw: null };
}

export async function listMyUnlockedAiCourses(req, res) {
  const dbg =
    DBG_ENV ||
    String(req.query?.dbg || '') === '1' ||
    String(req.headers['x-dbg'] || '') === '1';

  res.set('x-unlocked-ai-build', 'UNLOCKED_AI_BUILD_2026_01_11B');

  // Always-on entry log to confirm routing + auth normalization
  // eslint-disable-next-line no-console
  console.log('[unlocked-ai][controller] entry', {
    path: req.path,
    method: req.method,
    users_id: req.user?.users_id,
    auth_uuid: req.user?.auth_uuid,
    email: req.user?.email,
  });

  // helpful note (only for dbg)
  if (!req.headers.authorization && req.query?.token) {
    const t = normalizeQueryToken(req.query.token);
    if (t) log(dbg, 'note: token provided via ?token=... (middleware should set Authorization)');
  }

  const reqId =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  log(dbg, 'hit', {
    reqId,
    path: req.path,
    method: req.method,
    q: req.query,
    user: {
      legacy_id: req.user?.id,
      users_id: req.user?.users_id,
      profile_id: req.user?.profile_id,
      auth_uuid: req.user?.auth_uuid,
      email: req.user?.email,
    },
  });

  try {
    const resolved = await resolveUsersIdFromReq(req, dbg);
    const userId = resolved.userId;

    if (!userId) {
      log(dbg, 'deny: no users.id', { reqId, resolved });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const authResolved = await resolveAuthUuidFromReq(req, userId, dbg);
    let authUuid = authResolved.authUuid;

    const usersRowQ = await pool.query(
      `SELECT id, email, auth_uuid::text AS auth_uuid FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const usersRow = usersRowQ.rows?.[0] || null;

    const rowAuthUuid = usersRow?.auth_uuid ? String(usersRow.auth_uuid) : null;
    const authMatch = Boolean(rowAuthUuid && authUuid && rowAuthUuid === authUuid);

    // eslint-disable-next-line no-console
    console.log('[unlocked-ai][resolve] ids', {
      reqId,
      resolvedUsersId: userId,
      resolvedAuthUuid: authUuid,
      via: { usersId: resolved.via, authUuid: authResolved.via },
      usersRow: usersRow
        ? { id: usersRow.id, email: usersRow.email, auth_uuid: usersRow.auth_uuid }
        : null,
      authUuidMatch: authMatch,
    });

    if (rowAuthUuid && rowAuthUuid !== authUuid) {
      authUuid = rowAuthUuid;
      // eslint-disable-next-line no-console
      console.log('[unlocked-ai][resolve] auth_uuid override', {
        reqId,
        resolvedAuthUuid: authResolved.authUuid,
        usersAuthUuid: rowAuthUuid,
      });
    }

    log(dbg, 'resolved ids', {
      reqId,
      userId,
      authUuid,
      via: { usersId: resolved.via, authUuid: authResolved.via },
    });

    let dbgDbIdentity = null;
    let dbgEntitlementsCount = null;
    let dbgEntitlementsJoinSample = [];
    if (dbg && authUuid) {
      const dbIdentity = await pool.query(
        `SELECT current_database() AS db, inet_server_addr()::text AS addr, inet_server_port() AS port`,
      );
      dbgDbIdentity = dbIdentity.rows?.[0] || null;

      const entCount = await pool.query(
        `SELECT COUNT(*)::int AS n FROM ai_course_entitlements WHERE user_id=$1::uuid`,
        [authUuid],
      );
      dbgEntitlementsCount = entCount.rows?.[0]?.n ?? 0;

      const entSample = await pool.query(
        `
        SELECT t.user_id::text, t.course_id::text, c.title
          FROM ai_course_entitlements t
          JOIN courses c ON c.id::text = t.course_id::text
         WHERE t.user_id = $1::uuid
         ORDER BY t.created_at DESC
         LIMIT 8
        `,
        [authUuid],
      );
      dbgEntitlementsJoinSample = entSample.rows || [];
    }

    const hasEnrollments = await tableExists('enrollments');
    const hasPurchases = await tableExists('course_purchases');
    const hasIssuances = await tableExists('ai_certificate_issuances');
    const hasAiCourseEnt = await tableExists('ai_course_entitlements');

    const enrollTimeCol = hasEnrollments
      ? await pickTimeColumn('enrollments', [
          'updated_at',
          'unlocked_at',
          'enrolled_at',
          'created_at',
          'started_at',
          'completed_at',
        ])
      : null;

    const purchasesTimeCol = hasPurchases
      ? await pickTimeColumn('course_purchases', ['created_at', 'purchased_at', 'updated_at'])
      : null;

    const issuancesTimeCol = hasIssuances
      ? await pickTimeColumn('ai_certificate_issuances', ['created_at', 'issued_at', 'updated_at'])
      : null;

    // include more candidates so it doesn’t silently exclude the table
    const aiEntTimeCol = hasAiCourseEnt
      ? await pickTimeColumn('ai_course_entitlements', [
          'updated_at',
          'created_at',
          'entitled_at',
          'unlocked_at',
        ])
      : null;

    log(dbg, 'tables', {
      reqId,
      hasEnrollments,
      hasPurchases,
      hasIssuances,
      hasAiCourseEnt,
      cols: { enrollTimeCol, purchasesTimeCol, issuancesTimeCol, aiEntTimeCol },
    });

    // 👇 the important part: show counts so you know WHY items=[]
    const debugCounts = {};
    if (dbg) {
      if (hasEnrollments) {
        const c = await pool.query(`SELECT COUNT(*)::int AS n FROM enrollments WHERE student_id=$1`, [
          userId,
        ]);
        debugCounts.enrollments = c.rows?.[0]?.n ?? 0;
      }
      if (hasPurchases) {
        const c = await pool.query(
          `SELECT COUNT(*)::int AS n FROM course_purchases WHERE student_id=$1`,
          [userId],
        );
        debugCounts.purchases = c.rows?.[0]?.n ?? 0;
      }
      if (hasIssuances) {
        const idTexts = [String(userId), authUuid].filter(Boolean);
        const c = await pool.query(
          `SELECT COUNT(*)::int AS n FROM ai_certificate_issuances WHERE user_id::text = ANY($1::text[])`,
          [idTexts],
        );
        debugCounts.issuances = c.rows?.[0]?.n ?? 0;
      }
      if (hasAiCourseEnt && authUuid) {
        const c = await pool.query(
          `SELECT COUNT(*)::int AS n FROM ai_course_entitlements WHERE user_id=$1::uuid`,
          [authUuid],
        );
        debugCounts.entitlements = c.rows?.[0]?.n ?? 0;
      } else if (hasAiCourseEnt) {
        debugCounts.entitlements = '(skipped: no authUuid)';
      }
      log(dbg, 'counts', debugCounts);
    }

    // Union parts
    const unionParts = [
      `
      SELECT
        NULL::text AS course_id,
        NULL::timestamptz AS unlocked_at,
        'none'::text AS unlock_source
      WHERE false
    `,
    ];

    if (hasEnrollments) {
      unionParts.push(`
        SELECT
          e.course_id::text AS course_id,
          ${enrollTimeCol ? `e.${enrollTimeCol}` : 'NULL::timestamptz'} AS unlocked_at,
          'enrollment' AS unlock_source
        FROM enrollments e
        WHERE e.student_id = $1
      `);
    }

    if (hasPurchases && purchasesTimeCol) {
      unionParts.push(`
        SELECT
          p.course_id::text AS course_id,
          p.${purchasesTimeCol} AS unlocked_at,
          'purchase' AS unlock_source
        FROM course_purchases p
        WHERE p.student_id = $1
      `);
    }

    if (hasIssuances && issuancesTimeCol) {
      unionParts.push(`
        SELECT
          i.course_id::text AS course_id,
          i.${issuancesTimeCol} AS unlocked_at,
          'ai_issuance' AS unlock_source
        FROM ai_certificate_issuances i
        WHERE i.course_id IS NOT NULL
          AND i.user_id::text = ANY($3::text[])
      `);
    }

    if (hasAiCourseEnt) {
      unionParts.push(`
        SELECT
          t.course_id::text AS course_id,
          ${aiEntTimeCol ? `t.${aiEntTimeCol}` : 'NULL::timestamptz'} AS unlocked_at,
          'ai_entitlement' AS unlock_source
        FROM ai_course_entitlements t
        WHERE t.course_id IS NOT NULL
          AND $2::uuid IS NOT NULL
          AND t.user_id = $2::uuid
      `);
    }

    const idTexts = Array.from(
      new Set(
        [
          String(userId),
          authUuid,
          String(req.user?.id ?? ''),
          String(req.user?.profileId ?? ''),
          String(req.user?.profile_id ?? ''),
        ].filter((x) => x && x.trim() !== ''),
      ),
    );

    const sql = `
      WITH unlocked AS (
        ${unionParts.join('\nUNION ALL\n')}
      )
      SELECT DISTINCT ON (u.course_id)
        c.*,
        u.unlock_source,
        u.unlocked_at
      FROM unlocked u
      JOIN courses c
        ON (
          u.course_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND c.id = u.course_id::uuid
        )
        OR (
          u.course_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND c.id::text = u.course_id
        )
      ORDER BY u.course_id, u.unlocked_at DESC NULLS LAST
      LIMIT 48
    `;

    const { rows } = await pool.query(sql, [userId, authUuid, idTexts]);

    log(dbg, 'result', {
      reqId,
      count: rows.length,
      sample: shortRows(rows, ['id', 'title', 'unlock_source', 'unlocked_at']),
    });

    let dbgUnlockedSample = [];
    if (dbg) {
      const unlockedSampleQ = await pool.query(
        `
        WITH unlocked AS (
          ${unionParts.join('\nUNION ALL\n')}
        )
        SELECT
          u.course_id,
          u.unlock_source,
          u.unlocked_at
        FROM unlocked u
        ORDER BY u.unlocked_at DESC NULLS LAST
        LIMIT 8
        `,
        [userId, authUuid, idTexts],
      );
      dbgUnlockedSample = unlockedSampleQ.rows || [];
    }

    return res.json({
      items: rows,
      ...(dbg
        ? {
            debug: {
              reqId,
              resolved: {
                userId,
                authUuid,
                via: { usersId: resolved.via, authUuid: authResolved.via },
                snapshot: {
                  id: req.user?.id,
                  users_id: req.user?.users_id,
                  profile_id: req.user?.profile_id,
                  email: req.user?.email,
                  auth_uuid: req.user?.auth_uuid,
                  sub: req.user?.sub,
                  uid: req.user?.uid,
                },
              },
              idTexts,
              counts: debugCounts,
              db: dbgDbIdentity,
              entitlementsCount: dbgEntitlementsCount,
              entitlementsJoinSample: dbgEntitlementsJoinSample,
              unlockedSample: dbgUnlockedSample,
            },
          }
        : {}),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[listMyUnlockedAiCourses] failed', {
      message: err?.message || String(err),
      stack: err?.stack,
    });
    return res.status(500).json({ error: 'Failed to load unlocked courses' });
  }
}
