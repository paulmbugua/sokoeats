/* eslint-disable no-useless-escape */
// apps/backend/controllers/orgFeesController.js
import pool from '../config/db.js';
import {
  createStructureSchema,
  updateStructureSchema,
  structureParamsSchema,
  feeChargeSchema,
  bulkFeeChargeSchema,
  feePaymentSchema,
  learnerParamsSchema,
  orgParamsSchema,
  balancesQuerySchema,
  dateRangeQuerySchema,
} from '../validators/orgFeesValidators.js';
import {
  renderFeeStatementPdf,
  renderFeeStructurePdf,
  renderInstitutionFeeStatementPdf,
} from '../services/orgFeePdfService.js';
import { resolveInstructorFeeTable } from '../utils/feeAccessTable.js';
import { notifyEvent } from '../services/notificationEvents.js';


function normalizeCurrency(v, fallback = 'USD') {
  const s = String(v ?? '').trim();
  const out = (s || String(fallback || 'USD')).trim().toUpperCase();
  return /^[A-Z]{2,12}$/.test(out) ? out : String(fallback || 'USD').toUpperCase();
}

function parseScopeFromDescription(descRaw) {
  const desc = String(descRaw || '');
  const m = desc.match(/\bScope:\s*([a-zA-Z_]+)\s+(.+)\s*$/i);
  if (!m) return { cleanDescription: desc.trim(), scope_type: null, scope_value: null };

  const scope_type = String(m[1] || '').trim().toLowerCase();
  const scope_value = String(m[2] || '').trim();

  // Remove " | Scope: ..." from description
  const cleanDescription = desc.replace(/\s*\|\s*Scope:.*$/i, '').trim();

  return {
    cleanDescription,
    scope_type: scope_type || null,
    scope_value: scope_value || null,
  };
}

function normalizeScopeType(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s ? s : 'all';
}

function normalizeScopeValue(v) {
  return String(v ?? '').trim().toLowerCase();
}

// Resolve the effective currency for a charge linked to a structure/item.
// Prefers item currency, then structure currency.
async function resolveStructureChargeCurrency(clientOrPool, orgId, structureId, structureItemId) {
  if (!orgId || !structureId) return null;

  const { rows } = await clientOrPool.query(
    `
    SELECT
      UPPER(COALESCE(i.currency, s.currency, 'USD')) AS currency
    FROM org_fee_structures s
    LEFT JOIN org_fee_structure_items i
      ON i.structure_id = s.id
     AND ($3::bigint IS NULL OR i.id = $3)
    WHERE s.org_id = $1
      AND s.id = $2
    LIMIT 1
    `,
    [orgId, structureId, structureItemId || null],
  );

  const cur = rows?.[0]?.currency;
  return cur ? normalizeCurrency(cur, 'USD') : null;
}

function addCentsByCurrency(map, currency, amountCents) {
  const cur = normalizeCurrency(currency, 'USD');
  map.set(cur, (map.get(cur) || 0) + Number(amountCents || 0));
}


function feeInboundNameJoinSql() {
  return `
    LEFT JOIN profiles pr
      ON pr.user_id = lp.user_id
    LEFT JOIN users u
      ON u.id = lp.user_id
  `;
}

function feeInboundLearnerNameExpr(opts = {}) {
  const inboundAlias = opts?.inboundAlias ? String(opts.inboundAlias) : null;

  const parts = ['pr.name', 'u.name', 'lp.admission_code'];
  if (inboundAlias) parts.push(`${inboundAlias}.matched_learner_id`);

  return `COALESCE(${parts.join(', ')})`;
}


function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}


async function requireLearnerInOrg(clientOrPool, orgId, userId) {
  const q = await clientOrPool.query(
    `select id, org_id, user_id, admission_code, class_label
       from org_learner_profiles
      where org_id=$1 and user_id=$2
      limit 1`,
    [orgId, Number(userId)],
  );
  return q.rows[0] || null;
}


function safeQualifiedRel(rel, fallback = 'public.org_learner_profiles') {
  const s = String(rel || '').trim();
  return /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/.test(s) ? s : fallback;
}

async function resolveLearnerProfilesRel(client) {
  const r = await client.query(`select to_regclass('org_learner_profiles') as rel`);
  return safeQualifiedRel(r.rows?.[0]?.rel);
}

async function pickLearnerGradeExpr(client) {
  const rel = await resolveLearnerProfilesRel(client);
  const [schema, table] = rel.split('.');

  const candidates = ['grade', 'school_grade', 'school_grade_label'];

  const r = await client.query(
    `
    select column_name
      from information_schema.columns
     where table_schema=$1
       and table_name=$2
       and column_name = any($3::text[])
     order by array_position($3::text[], column_name)
     limit 1
    `,
    [schema, table, candidates],
  );

  const col = r.rows?.[0]?.column_name;

  if (col === 'grade') return 'lp.grade::text';
  if (col === 'school_grade') return 'lp.school_grade::text';
  if (col === 'school_grade_label') return 'lp.school_grade_label::text';

  return 'lp.class_label::text';
}


function deriveGradeKeys(classLabel) {
  const s = String(classLabel || '').trim();
  const digits = (s.match(/\d+/) || [])[0] || '';
  const keys = new Set();
  if (s) keys.add(s.toLowerCase());
  if (digits) {
    keys.add(digits.toLowerCase());
    keys.add(`grade ${digits}`.toLowerCase());
    keys.add(`class ${digits}`.toLowerCase());
  }
  return Array.from(keys);
}

async function pickBestStructureForLearner(orgId, classLabel) {
  const classKey = String(classLabel || '').trim().toLowerCase();
  const gradeKeys = deriveGradeKeys(classLabel);

  // Prefer: active + class exact, then active + grade keys, then active + all/empty, then newest fallback
  const { rows } = await pool.query(
    `
    select *
      from org_fee_structures s
     where s.org_id = $1
     order by
       case
         when s.is_active = true
          and lower(coalesce(s.scope_type,'')) = 'class'
          and lower(coalesce(s.scope_value,'')) = $2
           then 1
         when s.is_active = true
          and lower(coalesce(s.scope_type,'')) = 'grade'
          and lower(coalesce(s.scope_value,'')) = any($3::text[])
           then 2
         when s.is_active = true
          and (s.scope_type is null or s.scope_type = '' or lower(s.scope_type) = 'all')
           then 3
         when s.is_active = true then 4
         else 9
       end,
       s.is_active desc,
       s.updated_at desc
     limit 1
    `,
    [orgId, classKey, gradeKeys],
  );

  return rows[0] || null;
}

async function pickActiveStructureForLearner(orgId, classLabel) {
  const classKey = String(classLabel || '').trim().toLowerCase();
const keys = deriveGradeKeys(classLabel); // already lower

const { rows } = await pool.query(
  `
  select *
    from org_fee_structures s
   where s.org_id = $1
     and s.is_active = true
   order by
     case
       when trim(lower(coalesce(s.scope_value,''))) = $2 then 1
       when trim(lower(coalesce(s.scope_value,''))) = any($3::text[]) then 2
       when trim(lower(coalesce(s.scope_value,''))) in ('', 'all', '*') then 3
       else 9
     end,
     s.updated_at desc
   limit 1
  `,
  [orgId, classKey, keys],
);

return rows[0] || null;

}

// ─────────────────────────────────────────────────────────────
// Instructor fee-access helpers (org_instructors OR org_instructor_profiles)
// ─────────────────────────────────────────────────────────────

async function resolveInstructorTable(clientOrPool = pool) {
  const { rows } = await clientOrPool.query(
    `
    select
      to_regclass('public.org_instructors') as t_instructors,
      to_regclass('public.org_instructor_profiles') as t_profiles
  `,
  );

  if (rows?.[0]?.t_instructors) return 'org_instructors';
  if (rows?.[0]?.t_profiles) return 'org_instructor_profiles';
  return null;
}

async function fetchDesignatedInstructor(clientOrPool, tableName, orgId) {
  const { rows } = await clientOrPool.query(
    `select user_id, fee_access_updated_at, fee_access_granted_by_user_id
       from ${tableName}
      where org_id=$1 and can_access_fees is true
      limit 1`,
    [orgId],
  );

  if (!rows.length) return { userId: null, updatedAt: null, grantedBy: null };

  return {
    userId: rows[0]?.user_id ?? null,
    updatedAt: rows[0]?.fee_access_updated_at ?? null,
    grantedBy: rows[0]?.fee_access_granted_by_user_id ?? null,
  };
}

export async function getOrgFeeAccessStatus(req, res) {
  const orgId = normalizeOrgId(req);
  const userId = req.user?.id;

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (!orgId) return res.status(400).json({ message: 'org_id required' });

  try {
    const tableName = await resolveInstructorTable(pool);

    // Membership check (role + presence)
    const membershipRes = await pool.query(
      `select role from org_memberships where org_id=$1 and user_id=$2 limit 1`,
      [orgId, userId],
    );
    const role = String(membershipRes.rows?.[0]?.role || '').toLowerCase();

    if (!tableName) {
      return res.json({
        ok: true,
        hasAccess: false,
        designatedInstructorId: null,
        updatedAt: null,
        grantedByUserId: null,
      });
    }

    const designated = await fetchDesignatedInstructor(pool, tableName, orgId);
    const hasAccess = role === 'instructor' && designated.userId != null && String(designated.userId) === String(userId);

    return res.json({
      ok: true,
      hasAccess,
      designatedInstructorId: designated.userId ?? null,
      updatedAt: designated.updatedAt ?? null,
      grantedByUserId: designated.grantedBy ?? null,
    });
  } catch (err) {
    console.error('[getOrgFeeAccessStatus] failed', err);
    return res.status(500).json({ message: 'Unable to load fee access status' });
  }
}

export async function setInstructorFeeAccess(req, res) {
  const orgId = normalizeOrgId(req);
  const { instructorUserId } = req.params || {};
  const { enabled } = req.body || {};

  if (typeof enabled !== 'boolean') return res.status(400).json({ message: 'enabled must be a boolean' });
  if (!orgId) return res.status(400).json({ message: 'org_id required' });
  if (!instructorUserId) return res.status(400).json({ message: 'instructorUserId is required' });

  const actorUserId = req.user?.id || req.user?.userId || req.auth?.userId;
  if (!actorUserId) return res.status(401).json({ message: 'Unauthorized' });

  const s = String(instructorUserId).trim();
  if (!/^[0-9]+$/.test(s)) {
    return res.status(400).json({ message: 'instructorUserId must be a numeric user_id' });
  }
  const targetUserId = Number(s);

  const client = await pool.connect();
  try {
    const tableName = await resolveInstructorTable(client);
    if (!tableName) {
      return res.status(500).json({ message: 'Instructor table not found (missing migrations).' });
    }

    // verify actor is admin via org_memberships (requireOrgAdmin already applied, but double-check)
    const adminRes = await client.query(
      `select role
         from org_memberships
        where org_id=$1 and user_id=$2
        limit 1`,
      [orgId, actorUserId],
    );
    const actorRole = String(adminRes.rows?.[0]?.role || '').toLowerCase();
    if (!adminRes.rowCount || (actorRole !== 'admin' && actorRole !== 'owner' && actorRole !== 'superadmin')) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // verify target is instructor
    const memRes = await client.query(
      `select role
         from org_memberships
        where org_id=$1 and user_id=$2
        limit 1`,
      [orgId, targetUserId],
    );
    const role = String(memRes.rows?.[0]?.role || '').toLowerCase();
    if (!memRes.rowCount || role !== 'instructor') {
      return res.status(404).json({ message: 'Instructor not found in org' });
    }

    await client.query('BEGIN');

    // revoke everyone first if enabling
    if (enabled) {
      await client.query(
        `update ${tableName}
            set can_access_fees=false,
                fee_access_granted_by_user_id=$2,
                fee_access_updated_at=now()
          where org_id=$1`,
        [orgId, actorUserId],
      );
    }

    // update target instructor row
    const upd = await client.query(
      `update ${tableName}
          set can_access_fees=$3,
              fee_access_granted_by_user_id=$4,
              fee_access_updated_at=now()
        where org_id=$1 and user_id=$2`,
      [orgId, targetUserId, enabled, actorUserId],
    );

    if (upd.rowCount === 0) {
      await client.query(
        `insert into ${tableName} (org_id, user_id, can_access_fees, fee_access_granted_by_user_id, fee_access_updated_at)
         values ($1,$2,$3,$4,now())
         on conflict (org_id, user_id)
         do update set can_access_fees=excluded.can_access_fees,
                       fee_access_granted_by_user_id=excluded.fee_access_granted_by_user_id,
                       fee_access_updated_at=excluded.fee_access_updated_at`,
        [orgId, targetUserId, enabled, actorUserId],
      );
    }

    const designated = await fetchDesignatedInstructor(client, tableName, orgId);
    await client.query('COMMIT');

    return res.json({
      ok: true,
      designatedInstructorId: enabled ? String(targetUserId) : designated.userId ?? null,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[setInstructorFeeAccess] failed', err);
    return res.status(500).json({ message: 'Unable to update fee access' });
  } finally {
    client.release();
  }
}



async function resolveCreatedByProfileId(clientOrPool, req) {
  // If your auth middleware already attaches a profile UUID, use it (ONLY if valid UUID)
  const hinted =
    req.user?.profile_id ||
    req.user?.profileId ||
    req.user?.profile?.id;

  if (hinted && isUuid(hinted)) return String(hinted);

  const userId = req.user?.id;
  if (!userId) return null;

  // Fetch profile UUID from profiles table
  const { rows } = await clientOrPool.query(
    `select id from profiles where user_id = $1 limit 1`,
    [userId],
  );

  const pid = rows[0]?.id;
  return pid && isUuid(pid) ? String(pid) : null;
}


const normalizeOrgId = (req) => req.params?.orgId || req.body?.org_id || req.query?.org_id;

async function loadOrgMeta(clientOrReqOrOrgId, maybeOrgId) {
  const db =
    clientOrReqOrOrgId && typeof clientOrReqOrOrgId.query === 'function'
      ? clientOrReqOrOrgId
      : pool;

  let orgId = maybeOrgId;

  // loadOrgMeta(orgId)
  if (!orgId && (typeof clientOrReqOrOrgId === 'string' || typeof clientOrReqOrOrgId === 'number')) {
    orgId = clientOrReqOrOrgId;
  }

  // loadOrgMeta(req, orgId?)
  if (!orgId && clientOrReqOrOrgId && typeof clientOrReqOrOrgId === 'object') {
    orgId =
      clientOrReqOrOrgId.org_id ||
      clientOrReqOrOrgId.orgId ||
      clientOrReqOrOrgId.params?.orgId ||
      clientOrReqOrOrgId.params?.org_id ||
      clientOrReqOrOrgId.query?.orgId ||
      clientOrReqOrOrgId.query?.org_id ||
      null;
  }

  if (!orgId) throw new Error('loadOrgMeta: missing orgId');

  // ✅ Start with a broad list, then auto-remove any missing columns (42703) and retry.
  let cols = [
    'id',
    'name',
    'slug',
    'logo_url',
    'contact_email',
    'phone_number',
    'address_line1',
    'address_line2',

    // optional / newer columns (may not exist)
    'website_url',
    'signature_url',
    'instructor_signature_url',
    'finance_signature_url',
    'bursar_signature_url',
    'registrar_signature_url',
    'principal_signature_url',
    'headteacher_signature_url',
  ];

  const run = async () => {
    const sql = `
      SELECT ${cols.join(', ')}
      FROM organizations
      WHERE id = $1
      LIMIT 1
    `;
    const r = await db.query(sql, [orgId]);
    return r.rows[0] || null;
  };

  let row = null;

  for (let i = 0; i < 10; i++) {
    try {
      row = await run();
      break;
    } catch (e) {
      // undefined_column
      if (e?.code === '42703') {
        const msg = String(e?.message || '');

        // try extract the missing column name
        // examples:
        //  - column "registrar_signature_url" does not exist
        //  - column organizations.registrar_signature_url does not exist
        const m = msg.match(/column\s+"?([a-zA-Z0-9_\.]+)"?\s+does not exist/i);
        const missingRaw = m?.[1] || '';
        const missing = missingRaw.includes('.') ? missingRaw.split('.').pop() : missingRaw;

        if (missing && cols.includes(missing)) {
          cols = cols.filter((c) => c !== missing);
          continue; // retry with column removed
        }

        // if we can't identify the column, fall back to a very safe minimal query
        cols = [
          'id',
          'name',
          'slug',
          'logo_url',
          'contact_email',
          'phone_number',
          'address_line1',
          'address_line2',
          'signature_url',
          'instructor_signature_url',
        ];
        row = await run();
        break;
      }

      throw e;
    }
  }

  if (!row) return null;

  // Normalize missing fields so downstream code can safely read them
  const ensure = (k) => {
    if (row[k] === undefined) row[k] = null;
  };

  ensure('website_url');
  ensure('signature_url');
  ensure('instructor_signature_url');
  ensure('finance_signature_url');
  ensure('bursar_signature_url');
  ensure('registrar_signature_url');
  ensure('principal_signature_url');
  ensure('headteacher_signature_url');

  // ✅ CRITICAL: never fallback bursar/finance to principal
  row.bursar_signature_resolved =
    row.bursar_signature_url || row.finance_signature_url || null;

  return row;
}


async function resolveOrgIdByAccountRef(client, provider, accountRef) {
  if (!provider || !accountRef) return null;
  const { rows } = await client.query(
    `select org_id
       from org_payment_accounts
      where provider=$1 and account_ref=$2 and is_active=true
      limit 1`,
    [String(provider), String(accountRef)],
  );
  return rows[0]?.org_id || null;
}

// Optional security: if you store webhook_secret per account, you can verify ?k= or header
async function verifyWebhookSecretIfConfigured(client, provider, accountRef, providedSecret) {
  const { rows } = await client.query(
    `select webhook_secret
       from org_payment_accounts
      where provider=$1 and account_ref=$2 and is_active=true
      limit 1`,
    [String(provider), String(accountRef)],
  );
  const expected = rows[0]?.webhook_secret;
  if (!expected) return true; // no secret configured
  return String(providedSecret || '') === String(expected);
}

async function upsertInboundTx(client, payload) {
  // payload: { org_id, provider, provider_ref, amount_cents, currency, registration_ref, raw }
  const { rows } = await client.query(
    `insert into org_fee_inbound_transactions
       (org_id, provider, provider_ref, amount_cents, currency, registration_ref, raw, status)
     values ($1,$2,$3,$4,$5,$6,$7,'received')
     on conflict (org_id, provider, provider_ref)
     do update set
       amount_cents=excluded.amount_cents,
       currency=excluded.currency,
       registration_ref=coalesce(excluded.registration_ref, org_fee_inbound_transactions.registration_ref),
       raw=excluded.raw,
       updated_at=now()
     returning *`,
    [
      payload.org_id,
      payload.provider,
      payload.provider_ref,
      payload.amount_cents,
      payload.currency || 'KES',
      payload.registration_ref || null,
      payload.raw || {},
    ],
  );
  return rows[0];
}

async function tryAutoPostInbound(client, orgId, inboundRow, req) {
  if (!inboundRow?.id) return { ok: false, reason: 'missing inbound id' };

  // 🔒 Lock the inbound row so only ONE request can post a payment for it.
  // This prevents rare double-posting under true concurrency.
  const lockQ = await client.query(
    `select
        id,
        org_id,
        provider,
        provider_ref,
        amount_cents,
        currency,
        registration_ref,
        posted_payment_id
      from org_fee_inbound_transactions
      where id = $1
      for update`,
    [inboundRow.id],
  );

  const locked = lockQ.rows[0];
  if (!locked) return { ok: false, reason: 'inbound not found' };

  // If payload has no reg ref, mark unmatched (idempotent)
  if (!locked.registration_ref) {
    await client.query(
      `update org_fee_inbound_transactions
          set status='unmatched', updated_at=now()
        where id=$1`,
      [locked.id],
    );
    return { ok: false, reason: 'no registration_ref' };
  }

  // If already posted by a previous or concurrent request, stop here (idempotent)
  if (locked.posted_payment_id) {
    return { ok: true, already: true, paymentId: locked.posted_payment_id };
  }

  const reg = String(locked.registration_ref).trim();

  // ✅ Your roster table is org_learner_profiles
  // Match by admission_code OR user_id OR profile row uuid (id)
  const learnerQ = await client.query(
    `select l.user_id, l.admission_code
       from org_learner_profiles l
      where l.org_id = $1
        and (
          l.admission_code = $2
          or l.user_id::text = $2
          or l.id::text = $2
        )
      limit 1`,
    [orgId, reg],
  );

  const userId = learnerQ.rows[0]?.user_id;

  if (!userId) {
    await client.query(
      `update org_fee_inbound_transactions
          set status='unmatched', updated_at=now()
        where id=$1`,
      [locked.id],
    );
    return { ok: false, reason: 'unmatched learner' };
  }

  // ✅ store learner_id as TEXT user_id (matches your org_fee_* tables)
  const learnerRef = String(userId);

  const createdBy = await resolveCreatedByProfileId(client, req); // usually null for webhooks

  // Create payment
  const payIns = await client.query(
    `insert into org_fee_payments
       (org_id, learner_id, amount_cents, currency, method, reference, note, received_at, created_by, metadata)
     values ($1,$2,$3,$4,$5,$6,$7,now(),$8,$9)
     returning id`,
    [
      orgId,
      learnerRef,
      Number(locked.amount_cents || 0),
      locked.currency || 'KES',
      locked.provider, // 'mpesa' | 'bank'
      locked.provider_ref, // receipt/ref
      `Auto-captured via ${locked.provider} - Reg: ${reg}`,
      createdBy,
      { inbound_id: locked.id, raw: inboundRow?.raw || {} },
    ],
  );

  const paymentId = payIns.rows[0].id;

  // Mark inbound as posted
  await client.query(
    `update org_fee_inbound_transactions
        set status='posted',
            matched_learner_id=$2,
            posted_payment_id=$3,
            updated_at=now()
      where id=$1`,
    [locked.id, learnerRef, paymentId],
  );

  void notifyEvent(
    'ORG_FEE_UPDATED',
    String(learnerRef),
    {
      amountCents: Number(locked.amount_cents || 0),
      currency: locked.currency || 'KES',
      orgId,
    },
  ).catch((e) =>
    console.warn('[push] inbound fee notify failed', e?.message || e),
  );

  return { ok: true, paymentId, learnerRef };
}


function safePick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

// Support common C2B confirmation payload shapes
function parseMpesaC2B(body) {
  const shortcode = safePick(body, ['BusinessShortCode', 'ShortCode', 'PayBillNumber', 'TillNumber', 'ReceiverPartyPublicName']);
  const receipt = safePick(body, ['TransID', 'TransactionID', 'MpesaReceiptNumber', 'ReceiptNumber']);
  const amount = safePick(body, ['TransAmount', 'Amount', 'TransactionAmount']);
  const billRef = safePick(body, ['BillRefNumber', 'AccountReference', 'Reference', 'InvoiceNumber']);

  return {
    account_ref: shortcode ? String(shortcode).trim() : null,
    provider_ref: receipt ? String(receipt).trim() : null,
    amount_cents: Math.round(Number(amount || 0) * 100),
    currency: 'KES',
    registration_ref: billRef ? String(billRef).trim() : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Admin tooling for inbound (unmatched queue + manual attach)
// ─────────────────────────────────────────────────────────────

async function resolveLearnerRefInOrg(client, orgId, rawLearnerId) {
  const ref = String(rawLearnerId || '').trim();
  if (!ref) return null;

  const q = await client.query(
    `select l.user_id
       from org_learner_profiles l
      where l.org_id = $1
        and (
          l.admission_code = $2
          or l.user_id::text = $2
          or l.id::text = $2
        )
      limit 1`,
    [orgId, ref],
  );

  return q.rows[0]?.user_id ? String(q.rows[0].user_id) : null;
}

async function postInboundToLearner(
  client,
  orgId,
  inboundRow,
  learnerRef,
  req,
  notePrefix = 'Manually matched',
) {
  if (!inboundRow) throw new Error('Missing inboundRow');
  if (!learnerRef) throw new Error('Missing learnerRef');

  // idempotent: already posted
  if (inboundRow.posted_payment_id) {
    return {
      ok: true,
      already: true,
      paymentId: inboundRow.posted_payment_id,
      learnerRef,
    };
  }

  const createdBy = await resolveCreatedByProfileId(client, req); // likely null for server-side ops

  const reg = inboundRow.registration_ref
    ? String(inboundRow.registration_ref).trim()
    : '';
  const note = `${notePrefix} via admin tool • ${inboundRow.provider} • Ref: ${
    inboundRow.provider_ref
  }${reg ? ` • BillRef: ${reg}` : ''}`;

  const payIns = await client.query(
    `insert into org_fee_payments
       (org_id, learner_id, amount_cents, currency, method, reference, note, received_at, created_by, metadata)
     values ($1,$2,$3,$4,$5,$6,$7,now(),$8,$9)
     returning id`,
    [
      orgId,
      String(learnerRef),
      Number(inboundRow.amount_cents || 0),
      inboundRow.currency || 'KES',
      inboundRow.provider,     // 'mpesa' | 'bank'
      inboundRow.provider_ref, // receipt/ref
      note,
      createdBy,
      { inbound_id: inboundRow.id, raw: inboundRow.raw || {} },
    ],
  );

  const paymentId = payIns.rows[0].id;

  await client.query(
    `update org_fee_inbound_transactions
        set status='posted',
            matched_learner_id=$2,
            posted_payment_id=$3,
            updated_at=now()
      where id=$1`,
    [inboundRow.id, String(learnerRef), paymentId],
  );

  void notifyEvent(
    'ORG_FEE_UPDATED',
    String(learnerRef),
    {
      amountCents: Number(inboundRow.amount_cents || 0),
      currency: inboundRow.currency || 'KES',
      orgId,
    },
  ).catch((e) =>
    console.warn('[push] manual fee notify failed', e?.message || e),
  );

  return { ok: true, paymentId, learnerRef };
}

// Accepts both:
//   fetchStructureWithItems(orgId, structureId)
//   fetchStructureWithItems(clientOrPool, orgId, structureId)
async function fetchStructureWithItems(a, b, c) {
  let clientOrPool = pool;
  let orgId = null;
  let structureId = null;

  // If first arg is a UUID string, assume old call style: (orgId, structureId)
  if (typeof a === 'string' && isUuid(a)) {
    orgId = a;
    structureId = b;
  } else {
    // New call style: (clientOrPool, orgId, structureId)
    clientOrPool = a || pool;
    orgId = b;
    structureId = c;
  }

  const structureRes = await clientOrPool.query(
    `select * from org_fee_structures where org_id = $1 and id = $2 limit 1`,
    [orgId, structureId],
  );
  if (!structureRes.rows.length) return null;

  const structure = structureRes.rows[0];

  const itemsRes = await clientOrPool.query(
    `select *
       from org_fee_structure_items
      where structure_id = $1
      order by sort_order asc, id asc`,
    [structure.id],
  );

  structure.items = itemsRes.rows;
  return structure;
}



// apps/backend/controllers/orgFeesController.js
export async function listFeeStructures(req, res) {
  const orgId = normalizeOrgId(req);

  // ✅ stop browser/proxy/CDN caching (this is the refresh issue)
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Authorization, Cookie');

  try {
    const { rows } = await pool.query(
      `select *
         from org_fee_structures
        where org_id = $1
        order by is_active desc, updated_at desc
        limit 50`,
      [orgId],
    );

    const ids = rows.map((r) => r.id);
    const itemsRes = ids.length
      ? await pool.query(
          `select * from org_fee_structure_items where structure_id = any($1::bigint[]) order by sort_order asc, id asc`,
          [ids],
        )
      : { rows: [] };

    const itemsByStructure = itemsRes.rows.reduce((acc, row) => {
      acc[row.structure_id] = acc[row.structure_id] || [];
      acc[row.structure_id].push(row);
      return acc;
    }, {});

    const enriched = rows.map((r) => ({ ...r, items: itemsByStructure[r.id] || [] }));
    return res.json({ items: enriched });
  } catch (err) {
    console.error('[listFeeStructures] error', err);
    return res.status(500).json({ message: 'Unable to load fee structures' });
  }
}


export async function createFeeStructure(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = createStructureSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const parsed = parseScopeFromDescription(value.description || '');
    const scope_type = value.scope_type ?? parsed.scope_type ?? null;
    const scope_value = value.scope_value ?? parsed.scope_value ?? null;

    const scopeTypeKey = normalizeScopeType(scope_type);
    const scopeValueKey = normalizeScopeValue(scope_value);

    // If publishing this structure, deactivate others in SAME (scope_type + scope_value) bucket
    if (value.is_active === true) {
      await client.query(
        `
        UPDATE org_fee_structures
           SET is_active=false, updated_at=now()
         WHERE org_id=$1
           AND lower(coalesce(scope_type,'all')) = $2
           AND (
             ($3 = ''  AND trim(lower(coalesce(scope_value,''))) IN ('', 'all', '*'))
             OR
             ($3 <> '' AND trim(lower(coalesce(scope_value,''))) = $3)
           )
        `,
        [orgId, scopeTypeKey, scopeValueKey],
      );
    }

    const cleanDescription = parsed.cleanDescription || null;
    const structureCurrency = normalizeCurrency(value.currency, 'USD');
    const createdBy = await resolveCreatedByProfileId(client, req);

    const structureRes = await client.query(
      `
      INSERT INTO org_fee_structures
        (org_id, title, description, currency, is_active, effective_term, created_by, scope_type, scope_value)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
      `,
      [
        orgId,
        value.title,
        cleanDescription,
        structureCurrency,
        value.is_active,
        value.effective_term || null,
        createdBy,
        scope_type,
        scope_value,
      ],
    );

    const structure = structureRes.rows[0];
    let items = [];

    if (Array.isArray(value.items) && value.items.length) {
      const insertValues = [];
      const params = [];

      value.items.forEach((item, idx) => {
        params.push(
          structure.id,
          item.label,
          item.amount_cents,
          normalizeCurrency(item.currency, structureCurrency), // ✅ inherit structure currency
          item.cadence || null,
          item.is_optional ?? false,
          item.sort_order ?? idx,
          item.metadata || {},
        );

        const base = idx * 8;
        insertValues.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`,
        );
      });

      const itemsRes = await client.query(
        `
        INSERT INTO org_fee_structure_items
          (structure_id, label, amount_cents, currency, cadence, is_optional, sort_order, metadata)
        VALUES ${insertValues.join(',')}
        RETURNING *
        `,
        params,
      );

      items = itemsRes.rows;
    }

    await client.query('COMMIT');
    return res.status(201).json({ ...structure, items });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createFeeStructure] error', err);
    return res.status(500).json({ message: 'Unable to create fee structure' });
  } finally {
    client.release();
  }
}


export async function updateFeeStructure(req, res) {
  const orgId = normalizeOrgId(req);

  const { error: paramErr, value: params } = structureParamsSchema.validate(req.params);
  if (paramErr) return res.status(400).json({ message: paramErr.message });

  // Tip: if you want to ignore unknown keys instead of erroring:
  // const { error, value } = updateStructureSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  const { error, value } = updateStructureSchema.validate(req.body, {
  abortEarly: false,
  allowUnknown: true,
  stripUnknown: true,
});

if (error) return res.status(400).json({ message: error.message });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await fetchStructureWithItems(client, orgId, params.structureId);
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Structure not found' });
    }

    const sets = [];
    const vals = [];
    const pushSet = (col, val) => {
      sets.push(`${col} = $${vals.length + 1}`);
      vals.push(val);
    };

    // ─────────────────────────────────────────────
    // Description + legacy scope parsing
    // ─────────────────────────────────────────────
    const descTouched = value.description !== undefined;

    // Existing legacy scope (if old records had " | Scope: ..." in description)
    const parsedExistingDesc = parseScopeFromDescription(existing.description ?? '');

    // If description is being updated (even if null), parse THAT, not existing.
    const parsedIncomingDesc = descTouched
      ? parseScopeFromDescription(value.description)
      : null;

    // Base scope comes from columns, or legacy description if columns missing
    const baseScopeType =
      existing.scope_type ?? parsedExistingDesc.scope_type ?? null;
    const baseScopeValue =
      existing.scope_value ?? parsedExistingDesc.scope_value ?? null;

    // Next scope raw (prefer explicit payload, else scope parsed from NEW description if present,
    // else keep existing/base)
    const nextScopeTypeRaw =
      value.scope_type !== undefined
        ? value.scope_type
        : (parsedIncomingDesc?.scope_type ? parsedIncomingDesc.scope_type : baseScopeType);

    const nextScopeValueRaw =
      value.scope_value !== undefined
        ? value.scope_value
        : (parsedIncomingDesc?.scope_value ? parsedIncomingDesc.scope_value : baseScopeValue);

    // Normalize for bucket matching
    const nextScopeTypeKey = normalizeScopeType(nextScopeTypeRaw);   // e.g. 'all' | 'class'
    const nextScopeValueKey = normalizeScopeValue(nextScopeValueRaw); // e.g. '' for all, or 'grade-3'

    // Normalize values written to DB:
    // - store NULL for "all"/empty to keep SQL coalesce logic consistent
    const nextScopeTypeDb = (nextScopeTypeKey === 'all') ? null : nextScopeTypeKey;
    const nextScopeValueDb = (nextScopeValueKey === '') ? null : nextScopeValueKey;

    const willBeActive =
      (value.is_active !== undefined ? value.is_active : existing.is_active) === true;

    // If active after update: enforce one-active per SAME (scope_type + scope_value) bucket
    if (willBeActive) {
      await client.query(
        `
        UPDATE org_fee_structures
           SET is_active=false, updated_at=now()
         WHERE org_id=$1
           AND id <> $2
           AND lower(coalesce(scope_type,'all')) = $3
           AND (
             ($4 = ''  AND trim(lower(coalesce(scope_value,''))) IN ('', 'all', '*'))
             OR
             ($4 <> '' AND trim(lower(coalesce(scope_value,''))) = $4)
           )
        `,
        [orgId, params.structureId, nextScopeTypeKey, nextScopeValueKey],
      );
    }

    // ─────────────────────────────────────────────
    // Apply fields (PATCH semantics)
    // ─────────────────────────────────────────────
    if (value.title !== undefined) pushSet('title', value.title);

    if (descTouched) {
      // strip legacy scope tag from description, if present
      const clean = (parsedIncomingDesc?.cleanDescription ?? '').trim();
      pushSet('description', clean); // keep consistent with create default ''
    }

    // Update scope columns if:
    // - user provided them, OR
    // - new description includes a scope tag, OR
    // - migrating legacy scope (columns empty but legacy description had scope)
    const needsScopeMigration =
      (existing.scope_type == null && parsedExistingDesc.scope_type) ||
      (existing.scope_value == null && parsedExistingDesc.scope_value);

    const shouldWriteScope =
      value.scope_type !== undefined ||
      value.scope_value !== undefined ||
      (descTouched && (parsedIncomingDesc?.scope_type || parsedIncomingDesc?.scope_value)) ||
      needsScopeMigration;

    if (shouldWriteScope) {
      pushSet('scope_type', nextScopeTypeDb);
      pushSet('scope_value', nextScopeValueDb);
    }

    // Currency: only update if actually provided and non-empty
    if (value.currency !== undefined && value.currency !== null && String(value.currency).trim() !== '') {
      pushSet('currency', normalizeCurrency(value.currency, existing.currency || 'USD'));
    }

    if (value.effective_term !== undefined) pushSet('effective_term', value.effective_term || null);
    if (value.is_active !== undefined) pushSet('is_active', value.is_active);

    if (sets.length) {
      sets.push('updated_at = now()');
      await client.query(
        `
        UPDATE org_fee_structures
           SET ${sets.join(', ')}
         WHERE org_id = $${vals.length + 1}
           AND id = $${vals.length + 2}
        `,
        [...vals, orgId, params.structureId],
      );
    }

    // Determine structure currency for item inheritance
    const finalStructureCurrency =
      (value.currency !== undefined && value.currency !== null && String(value.currency).trim() !== '')
        ? normalizeCurrency(value.currency, existing.currency || 'USD')
        : normalizeCurrency(existing.currency, 'USD');

    // Replace items (if provided)
    if (value.items !== undefined) {
      await client.query(`DELETE FROM org_fee_structure_items WHERE structure_id=$1`, [
        params.structureId,
      ]);

      if (value.items.length) {
        const insertValues = [];
        const paramsArr = [];

        value.items.forEach((item, idx) => {
          paramsArr.push(
            params.structureId,
            item.label,
            item.amount_cents,
            normalizeCurrency(item.currency, finalStructureCurrency), // inherit if null/empty
            item.cadence || null,
            item.is_optional ?? false,
            item.sort_order ?? idx,
            item.metadata || {},
          );

          const base = idx * 8;
          insertValues.push(
            `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`,
          );
        });

        await client.query(
          `
          INSERT INTO org_fee_structure_items
            (structure_id, label, amount_cents, currency, cadence, is_optional, sort_order, metadata)
          VALUES ${insertValues.join(',')}
          `,
          paramsArr,
        );
      }
    }

    await client.query('COMMIT');

    const updated = await fetchStructureWithItems(client, orgId, params.structureId);
    return res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateFeeStructure] error', err);
    return res.status(500).json({ message: 'Unable to update structure' });
  } finally {
    client.release();
  }
}



export async function activateFeeStructure(req, res) {
  const orgId = normalizeOrgId(req);
  const { error: paramErr, value: params } = structureParamsSchema.validate(req.params);
  if (paramErr) return res.status(400).json({ message: paramErr.message });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const structure = await fetchStructureWithItems(client, orgId, params.structureId);
    if (!structure) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Structure not found' });
    }

    const scopeTypeKey = normalizeScopeType(structure.scope_type);
    const scopeValueKey = normalizeScopeValue(structure.scope_value);

    // Deactivate all in same (scope_type + scope_value) bucket
    await client.query(
      `
      UPDATE org_fee_structures
         SET is_active=false, updated_at=now()
       WHERE org_id=$1
         AND lower(coalesce(scope_type,'all')) = $2
         AND (
           ($3 = ''  AND trim(lower(coalesce(scope_value,''))) IN ('', 'all', '*'))
           OR
           ($3 <> '' AND trim(lower(coalesce(scope_value,''))) = $3)
         )
      `,
      [orgId, scopeTypeKey, scopeValueKey],
    );

    // Activate chosen
    await client.query(
      `
      UPDATE org_fee_structures
         SET is_active=true, updated_at=now()
       WHERE org_id=$1 AND id=$2
      `,
      [orgId, params.structureId],
    );

    await client.query('COMMIT');
    return res.json({ ...structure, is_active: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[activateFeeStructure] error', err);
    return res.status(500).json({ message: 'Unable to activate structure' });
  } finally {
    client.release();
  }
}


async function verifyStructureScope(orgId, structureId, structureItemId) {
  if (!structureId && !structureItemId) return null;
  const { rows } = await pool.query(
    `select s.id as structure_id, i.id as item_id
       from org_fee_structures s
       left join org_fee_structure_items i on i.structure_id = s.id
      where s.org_id = $1 and s.id = coalesce($2, s.id) and ($3::bigint is null or i.id = $3)
      limit 1`,
    [orgId, structureId || null, structureItemId || null],
  );
  return rows[0] || null;
}

export async function createFeeCharge(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = feeChargeSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    const createdBy = await resolveCreatedByProfileId(pool, req);

    const scope = await verifyStructureScope(orgId, value.structure_id, value.structure_item_id);
    if ((value.structure_id || value.structure_item_id) && !scope) {
      return res.status(400).json({ message: 'Invalid structure reference' });
    }

    const structureId = value.structure_id || scope?.structure_id || null;
    const itemId = value.structure_item_id || scope?.item_id || null;

    // ✅ inherit currency if linked to a structure/item
    let inheritedCurrency = null;
    if (structureId) {
      inheritedCurrency = await resolveStructureChargeCurrency(pool, orgId, structureId, itemId);
    }

    // Final currency decision:
    // - linked => inherit if omitted, and enforce match if provided
    // - unlinked => default USD
    let chargeCurrency = null;
    if (inheritedCurrency) {
      chargeCurrency = normalizeCurrency(value.currency, inheritedCurrency);
      if (chargeCurrency !== inheritedCurrency) {
        return res.status(400).json({
          message: `Charge currency must match structure currency (${inheritedCurrency})`,
        });
      }
    } else {
      chargeCurrency = normalizeCurrency(value.currency, 'USD');
    }

    const { rows } = await pool.query(
      `
      INSERT INTO org_fee_charges
        (org_id, learner_id, amount_cents, currency, description, class_label, due_date, created_by, structure_id, structure_item_id, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
      `,
      [
        orgId,
        value.learner_id,
        value.amount_cents,
        chargeCurrency, // ✅ inherited / normalized
        value.description || null,
        value.class_label || null,
        value.due_date || null,
        createdBy,
        structureId,
        itemId,
        value.metadata || {},
      ],
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[createFeeCharge] error', err);
    return res.status(500).json({ message: 'Unable to create charge' });
  }
}

export async function bulkFeeCharges(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = bulkFeeChargeSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  const scope = await verifyStructureScope(orgId, value.structure_id, value.structure_item_id);
  if ((value.structure_id || value.structure_item_id) && !scope) {
    return res.status(400).json({ message: 'Invalid structure reference' });
  }

  const structureId = value.structure_id || scope?.structure_id || null;
  const itemId = value.structure_item_id || scope?.item_id || null;

  // ✅ resolve charge currency ONCE for the whole bulk op
  let inheritedCurrency = null;
  if (structureId) {
    inheritedCurrency = await resolveStructureChargeCurrency(pool, orgId, structureId, itemId);
  }

  let chargeCurrency = null;
  if (inheritedCurrency) {
    chargeCurrency = normalizeCurrency(value.currency, inheritedCurrency);
    if (chargeCurrency !== inheritedCurrency) {
      return res.status(400).json({
        message: `Charge currency must match structure currency (${inheritedCurrency})`,
      });
    }
  } else {
    chargeCurrency = normalizeCurrency(value.currency, 'USD');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    const failed = [];

    const createdBy = await resolveCreatedByProfileId(client, req);

    for (const rawId of value.learner_ids) {
      const learnerId = String(rawId || '').trim();
      if (!learnerId) continue;
      try {
        const { rows } = await client.query(
          `
          INSERT INTO org_fee_charges
            (org_id, learner_id, amount_cents, currency, description, class_label, due_date, created_by, structure_id, structure_item_id, metadata)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          RETURNING *
          `,
          [
            orgId,
            learnerId,
            value.amount_cents,
            chargeCurrency, // ✅ inherited / normalized
            value.description || null,
            value.class_label || null,
            value.due_date || null,
            createdBy,
            structureId,
            itemId,
            value.metadata || {},
          ],
        );
        inserted.push(rows[0]);
      } catch (err) {
        failed.push({ learner_id: learnerId, reason: err?.message || 'insert failed' });
      }
    }

    await client.query('COMMIT');
    return res.json({ inserted, failed });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[bulkFeeCharges] error', err);
    return res.status(500).json({ message: 'Unable to create bulk charges' });
  } finally {
    client.release();
  }
}

export async function recordFeePayment(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = feePaymentSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  try {
    let chargeCurrency = null;

    if (value.charge_id) {
      const { rows } = await pool.query(
        `select learner_id, currency
           from org_fee_charges
          where org_id=$1 and id=$2
          limit 1`,
        [orgId, value.charge_id],
      );

      if (!rows.length) {
        return res.status(400).json({ message: 'charge_id not found in org' });
      }

      if (!value.learner_id) value.learner_id = rows[0].learner_id;

      chargeCurrency = normalizeCurrency(rows[0].currency, 'USD');

      // ✅ inherit if omitted
      if (!value.currency) value.currency = chargeCurrency;

      // ✅ must match if provided
      const payCur = normalizeCurrency(value.currency, chargeCurrency);
      if (payCur !== chargeCurrency) {
        return res
          .status(400)
          .json({ message: `Payment currency must match charge currency (${chargeCurrency})` });
      }

      value.currency = payCur;
    } else {
      // not linked → normalize/default USD
      value.currency = normalizeCurrency(value.currency, 'USD');
    }

    const createdBy = await resolveCreatedByProfileId(pool, req);

    const { rows } = await pool.query(
      `insert into org_fee_payments
         (org_id, learner_id, amount_cents, currency, method, reference, note, received_at, created_by, charge_id, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning *`,
      [
        orgId,
        value.learner_id,
        value.amount_cents,
        value.currency, // ✅ normalized / enforced
        value.method || null,
        value.reference || null,
        value.note || null,
        value.received_at || null,
        createdBy,
        value.charge_id || null,
        value.metadata || {},
      ],
    );

    void notifyEvent(
      'ORG_FEE_UPDATED',
      String(rows[0]?.learner_id),
      {
        amountCents: rows[0]?.amount_cents,
        currency: rows[0]?.currency,
        orgId,
      },
    ).catch((e) =>
      console.warn('[push] fee payment notify failed', e?.message || e),
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[recordFeePayment] error', err);
    return res.status(500).json({ message: 'Unable to record payment' });
  }
}

export async function getFeeBalances(req, res) {
  const orgId = normalizeOrgId(req);
  const { error, value } = balancesQuerySchema.validate(req.query || {});
  if (error) return res.status(400).json({ message: error.message });

  try {
    const { rows } = await pool.query(
  `
  WITH ch AS (
    SELECT
      ch.learner_id::text AS learner_id,
      UPPER(COALESCE(ch.currency,'USD')) AS currency,
      COALESCE(SUM(ch.amount_cents), 0)::bigint AS charges
    FROM org_fee_charges ch
    WHERE ch.org_id = $1
      AND ($2::text IS NULL OR ch.class_label = $2)
    GROUP BY ch.learner_id::text, UPPER(COALESCE(ch.currency,'USD'))
  ),
  p AS (
    SELECT
      p.learner_id::text AS learner_id,
      UPPER(COALESCE(p.currency,'USD')) AS currency,
      COALESCE(SUM(p.amount_cents), 0)::bigint AS payments
    FROM org_fee_payments p
    WHERE p.org_id = $1
    GROUP BY p.learner_id::text, UPPER(COALESCE(p.currency,'USD'))
  )
  SELECT
    COALESCE(ch.learner_id, p.learner_id) AS learner_id,
    COALESCE(ch.currency, p.currency) AS currency,
    COALESCE(ch.charges, 0)::bigint AS charges,
    COALESCE(p.payments, 0)::bigint AS payments
  FROM ch
  FULL OUTER JOIN p
    ON p.learner_id = ch.learner_id
   AND p.currency = ch.currency
  ORDER BY learner_id, currency
  `,
  [orgId, value.class_label || null],
);


    // return grouped payload so UI is simple
    const byLearner = new Map();
    for (const r of rows) {
      const learnerId = String(r.learner_id);
      if (!byLearner.has(learnerId)) byLearner.set(learnerId, []);
      byLearner.get(learnerId).push({
        currency: (r.currency || 'USD').toUpperCase(),
        charges: Number(r.charges || 0),
        payments: Number(r.payments || 0),
        balance: Number(r.charges || 0) - Number(r.payments || 0),
      });
    }

    const balances = Array.from(byLearner.entries()).map(([learner_id, currencies]) => ({
      learner_id,
      currencies,
    }));

    return res.json({ balances });
  } catch (err) {
    console.error('[getFeeBalances] error', err);
    return res.status(500).json({ message: 'Unable to load balances' });
  }
}



function uniqText(xs) {
  const out = [];
  const seen = new Set();
  for (const x of xs || []) {
    const s = String(x ?? '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function getFeeStatement(req, res) {
  const orgId = normalizeOrgId(req);

  const { error: paramErr, value: params } = learnerParamsSchema.validate(req.params, {
    allowUnknown: true,
  });
  if (paramErr) return res.status(400).json({ message: paramErr.message });

  try {
    const learnerRef = String(params.learnerId || '').trim();
    const learnerMeta = await loadLearnerMetaForStatement(pool, orgId, learnerRef);

    const learnerRefs = uniqText([
      learnerRef,
      learnerMeta?.user_id,
      learnerMeta?.admission_code,
      learnerMeta?.learner_profile_id,
    ]);

    if (!learnerRefs.length) {
      return res.status(400).json({ message: 'Missing learner reference' });
    }

    const charges = await pool.query(
      `
      SELECT id, amount_cents, currency, description, class_label, due_date, created_at, structure_id, structure_item_id, learner_id
        FROM org_fee_charges
       WHERE org_id = $1
         AND learner_id::text = ANY($2::text[])
       ORDER BY created_at DESC
      `,
      [orgId, learnerRefs],
    );

    const payments = await pool.query(
      `
      SELECT id, amount_cents, currency, method, reference, note, received_at, created_at, charge_id, learner_id
        FROM org_fee_payments
       WHERE org_id = $1
         AND learner_id::text = ANY($2::text[])
       ORDER BY COALESCE(received_at, created_at) DESC
      `,
      [orgId, learnerRefs],
    );

    const sumByCur = (rows) => {
      const m = new Map();
      for (const r of rows || []) {
        const cur = String(r.currency || 'USD').toUpperCase();
        m.set(cur, (m.get(cur) || 0) + Number(r.amount_cents || 0));
      }
      return Array.from(m.entries()).map(([currency, amount_cents]) => ({
        currency,
        amount_cents,
      }));
    };

    const chargesBy = sumByCur(charges.rows);
    const paymentsBy = sumByCur(payments.rows);

    const allCurrencies = new Set([
      ...chargesBy.map((x) => x.currency),
      ...paymentsBy.map((x) => x.currency),
    ]);

    const summary_by_currency = Array.from(allCurrencies).map((cur) => {
      const ch = chargesBy.find((x) => x.currency === cur)?.amount_cents || 0;
      const pay = paymentsBy.find((x) => x.currency === cur)?.amount_cents || 0;
      return { currency: cur, total_charges: ch, total_payments: pay, balance: ch - pay };
    });

    const legacy =
      summary_by_currency.find((x) => x.currency === 'USD') ||
      summary_by_currency[0] ||
      null;

    return res.json({
      learner_refs: learnerRefs,     // ✅ helpful for debugging
      learner_meta: learnerMeta,     // ✅ optional (remove if you don’t want to expose)
      charges: charges.rows,
      payments: payments.rows,
      summary_by_currency,
      summary: legacy
        ? {
            total_charges: legacy.total_charges,
            total_payments: legacy.total_payments,
            balance: legacy.balance,
          }
        : { total_charges: 0, total_payments: 0, balance: 0 },
    });
  } catch (err) {
    console.error('[getFeeStatement] error', err);
    return res.status(500).json({ message: 'Unable to load statement' });
  }
}



function looksLikeUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function loadLearnerMetaForStatement(db, orgId, learnerRef) {
  // learnerRef can be:
  // - learner_profile_id (uuid)
  // - user_id (number / numeric string)
  // - admission_code (string)

  const ref = learnerRef;

  // Detect UUID (learner_profile_id)
  const isUuid =
    typeof ref === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref.trim());

  // Detect numeric user id
  const isNumeric =
    ref !== null &&
    ref !== undefined &&
    String(ref).trim() !== '' &&
    /^[0-9]+$/.test(String(ref).trim());

  // Build WHERE
  let whereSql = '';
  let params = [orgId];

  if (isUuid) {
    whereSql = `olp.id = $2`;
    params.push(ref.trim());
  } else if (isNumeric) {
    whereSql = `olp.user_id = $2`;
    params.push(Number(String(ref).trim()));
  } else {
    // admission_code
    whereSql = `olp.admission_code = $2`;
    params.push(String(ref ?? '').trim());
  }

  // Query variants
  const qWithPhone = `
    SELECT
      olp.id            AS learner_profile_id,
      olp.org_id,
      olp.user_id,
      olp.admission_code,
      olp.class_label,
      olp.house_label,
      olp.dorm_label,
      olp.club_label,
      olp.photo_url,
      olp.guardian_email,

      u.email           AS user_email,
      u.name            AS user_name,
      u.phone_number    AS user_phone,

      p.name            AS profile_name
    FROM org_learner_profiles olp
    LEFT JOIN users u ON u.id = olp.user_id
    LEFT JOIN profiles p ON p.user_id = olp.user_id
    WHERE olp.org_id = $1
      AND ${whereSql}
    LIMIT 1
  `;

  const qNoPhone = `
    SELECT
      olp.id            AS learner_profile_id,
      olp.org_id,
      olp.user_id,
      olp.admission_code,
      olp.class_label,
      olp.house_label,
      olp.dorm_label,
      olp.club_label,
      olp.photo_url,
      olp.guardian_email,

      u.email           AS user_email,
      u.name            AS user_name,

      p.name            AS profile_name
    FROM org_learner_profiles olp
    LEFT JOIN users u ON u.id = olp.user_id
    LEFT JOIN profiles p ON p.user_id = olp.user_id
    WHERE olp.org_id = $1
      AND ${whereSql}
    LIMIT 1
  `;

  const qNoPhoneNoName = `
    SELECT
      olp.id            AS learner_profile_id,
      olp.org_id,
      olp.user_id,
      olp.admission_code,
      olp.class_label,
      olp.house_label,
      olp.dorm_label,
      olp.club_label,
      olp.photo_url,
      olp.guardian_email,

      u.email           AS user_email,

      p.name            AS profile_name
    FROM org_learner_profiles olp
    LEFT JOIN users u ON u.id = olp.user_id
    LEFT JOIN profiles p ON p.user_id = olp.user_id
    WHERE olp.org_id = $1
      AND ${whereSql}
    LIMIT 1
  `;

  // Execute with graceful fallbacks
  let r;
  try {
    r = await db.query(qWithPhone, params);
  } catch (e) {
    if (e?.code === '42703') {
      const msg = String(e?.message || '');

      // Missing phone_number column -> try without phone
      if (msg.includes('phone_number') || msg.includes('u.phone_number')) {
        try {
          r = await db.query(qNoPhone, params);
        } catch (e2) {
          if (e2?.code === '42703' && String(e2?.message || '').includes('u.name')) {
            r = await db.query(qNoPhoneNoName, params);
          } else {
            throw e2;
          }
        }
      }
      // Missing name column -> try without name
      else if (msg.includes('u.name') || msg.includes('name')) {
        r = await db.query(qNoPhoneNoName, params);
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  const row = r?.rows?.[0] || null;
  if (!row) return null;

  // ✅ final display name preference:
  const displayName =
    row.profile_name ||
    row.user_name ||
    row.admission_code ||
    row.user_email ||
    `Learner ${row.user_id ?? ''}`.trim();

  return { ...row, display_name: displayName };
}

export async function getFeeStatementPdf(req, res) {
  const orgId = normalizeOrgId(req);

  const { error: paramErr, value: params } = learnerParamsSchema.validate(req.params, {
    allowUnknown: true,
  });
  if (paramErr) return res.status(400).json({ message: paramErr.message });

  const learnerIdText = String(params.learnerId || '').trim();

  function uniqText(xs) {
    const out = [];
    const seen = new Set();
    for (const x of xs) {
      const s = String(x ?? '').trim();
      if (!s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }

  const client = await pool.connect();
  try {
    // Resolve org table name (organizations vs orgs)
    const orgTableCandidates = ['organizations', 'orgs'];
    const tRes = await client.query(
      `select table_name
         from information_schema.tables
        where table_schema='public'
          and table_name = any($1::text[])`,
      [orgTableCandidates],
    );

    const orgTable = tRes.rows?.[0]?.table_name;
    if (!orgTable) {
      return res.status(500).json({
        message: `Org table not found. Expected one of: ${orgTableCandidates.join(', ')}`,
      });
    }

    // Load org
    const orgRes = await client.query(`select * from ${orgTable} where id=$1`, [orgId]);
    const org = orgRes.rows?.[0];
    if (!org) return res.status(404).json({ message: 'Org not found' });

    // Learner meta
    const learnerMeta = await loadLearnerMetaForStatement(client, orgId, learnerIdText);

    const learnerRefs = uniqText([
      learnerIdText,
      learnerMeta?.user_id,
      learnerMeta?.admission_code,
      learnerMeta?.learner_profile_id,
    ]);

    // Charges + linked payments
    const statementRes = await client.query(
      `
      select
        ch.id as charge_id,
        ch.amount_cents as charge_amount,
        ch.currency as charge_currency,
        ch.description,
        ch.class_label,
        ch.due_date,
        ch.created_at as charge_created_at,

        p.id as payment_id,
        p.amount_cents as payment_amount,
        p.currency as payment_currency,
        p.method,
        p.reference,
        p.note,
        p.received_at,
        p.created_at as payment_created_at

      from org_fee_charges ch
      left join org_fee_payments p
        on p.charge_id = ch.id
       and p.org_id = ch.org_id
      where ch.org_id = $1
        and ch.learner_id::text = any($2::text[])
      order by ch.created_at asc, p.created_at asc
      `,
      [orgId, learnerRefs],
    );

    // All payments (including unlinked)
    const paymentsRes = await client.query(
      `
      select *
        from org_fee_payments
       where org_id = $1
         and learner_id::text = any($2::text[])
       order by created_at asc
      `,
      [orgId, learnerRefs],
    );

    // ✅ Totals by currency (never mix currencies)
    const chargesByCur = new Map();
    const paymentsByCur = new Map();

    const seenCharges = new Set();
    for (const row of statementRes.rows) {
      if (row.charge_id && !seenCharges.has(row.charge_id)) {
        seenCharges.add(row.charge_id);
        addCentsByCurrency(chargesByCur, row.charge_currency, row.charge_amount);
      }
    }

    for (const p of paymentsRes.rows) {
      addCentsByCurrency(paymentsByCur, p.currency, p.amount_cents);
    }

    const currencySet = new Set([...chargesByCur.keys(), ...paymentsByCur.keys()]);
    const totals_by_currency = Array.from(currencySet)
      .sort()
      .map((cur) => {
        const totalCharges = chargesByCur.get(cur) || 0;
        const totalPayments = paymentsByCur.get(cur) || 0;
        return { currency: cur, totalCharges, totalPayments, balance: totalCharges - totalPayments };
      });

    // Extra payments without charge_id
    const extraPayments = paymentsRes.rows.filter((p) => !p.charge_id);

    const combinedEntries = [
      ...statementRes.rows,
      ...extraPayments.map((p) => ({ payment_id: p.id, ...p })),
    ].sort((a, b) => {
      const left = new Date(
        a.payment_created_at || a.received_at || a.charge_created_at || a.created_at || 0,
      ).getTime();
      const right = new Date(
        b.payment_created_at || b.received_at || b.charge_created_at || b.created_at || 0,
      ).getTime();
      return left - right;
    });

    // Signature resolution
    const bursarSig =
      org?.bursar_signature_resolved ||
      org?.bursar_signature_url ||
      org?.finance_signature_url ||
      null;

    // Legacy single-currency totals (only if exactly one currency)
    const legacy = totals_by_currency.length === 1 ? totals_by_currency[0] : null;

    const pdfBuffer = await renderFeeStatementPdf({
      org,
      learnerId: params.learnerId,
      learner: learnerMeta
        ? { name: learnerMeta.display_name || 'Learner', admission_code: learnerMeta.admission_code || null }
        : undefined,

      bursar_signature_url: bursarSig,

      entries: combinedEntries,

      // ✅ NEW: renderer should display these totals per currency
      totals_by_currency,

      // keep backward-compat fields; only meaningful when single-currency
      totals: legacy
        ? {
            currency: legacy.currency,
            totalCharges: legacy.totalCharges,
            totalPayments: legacy.totalPayments,
            balance: legacy.balance,
          }
        : {
            currency: 'MIXED',
            totalCharges: 0,
            totalPayments: 0,
            balance: 0,
          },
    });

    const fileTag = String(learnerMeta?.admission_code || learnerIdText || 'learner')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="fee-statement-${fileTag}.pdf"`);
    return res.send(pdfBuffer);
  } catch (e) {
    console.error('getFeeStatementPdf error:', e);
    return res.status(500).json({ message: e?.message || 'Failed to generate statement' });
  } finally {
    client.release();
  }
}


export async function getFeeStructurePdf(req, res) {
  const orgId = normalizeOrgId(req);

  const { error: paramErr, value: params } = structureParamsSchema.validate(req.params, {
    allowUnknown: true,
  });
  if (paramErr) return res.status(400).json({ message: paramErr.message });

  const org = await loadOrgMeta(orgId);
  if (!org) return res.status(404).json({ message: 'Org not found' });

  const structure = await fetchStructureWithItems(orgId, params.structureId);
  if (!structure) return res.status(404).json({ message: 'Structure not found' });

  const pdfBuffer = await renderFeeStructurePdf({ org, structure });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="fee-structure-${structure.id}.pdf"`);
  return res.send(pdfBuffer);
}

export async function getOrgFeeStructurePdf(req, res) {
  const orgId = normalizeOrgId(req);

  const { error: pErr } = orgParamsSchema.validate(req.params, { allowUnknown: true });
  if (pErr) return res.status(400).json({ message: pErr.message });

  try {
    const { rows } = await pool.query(
      `select id
         from org_fee_structures
        where org_id=$1
          and is_active=true
        order by updated_at desc
        limit 1`,
      [orgId],
    );

    const picked = rows[0];
    if (!picked?.id) return res.status(404).json({ message: 'No active fee structure found' });

    const org = await loadOrgMeta(orgId);
    if (!org) return res.status(404).json({ message: 'Org not found' });

    const structure = await fetchStructureWithItems(orgId, picked.id);
    const pdfBuffer = await renderFeeStructurePdf({ org, structure });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="fee-structure-${orgId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[getOrgFeeStructurePdf] error', err);
    return res.status(500).json({ message: 'Unable to render fee structure PDF' });
  }
}

export async function getInstitutionFeeStatement(req, res) {
  const orgId = normalizeOrgId(req);

  const { error: qErr, value: query } = dateRangeQuerySchema.validate(req.query || {}, {
    allowUnknown: true,
  });
  if (qErr) return res.status(400).json({ message: qErr.message });

  const from = query?.from ? new Date(query.from) : null;
  const to = query?.to ? new Date(query.to) : null;

  const client = await pool.connect();
  try {

    const learnerRel = await resolveLearnerProfilesRel(client);
    // ✅ Pick a safe grade expression depending on what column exists
    const gradeExpr = await pickLearnerGradeExpr(client);

    const learnerRes = await client.query(
      `
      SELECT lp.user_id::text AS learner_id,
             lp.admission_code,
             lp.class_label,
             ${gradeExpr} AS grade,
             ${feeInboundLearnerNameExpr()} AS learner_name
        FROM ${learnerRel} lp
        ${feeInboundNameJoinSql()}
       WHERE lp.org_id = $1
      `,
      [orgId],
    );

    const learnerMap = new Map();
    for (const row of learnerRes.rows || []) {
      learnerMap.set(String(row.learner_id), row);
    }

    const buildFilter = (column) => {
      const filters = [];
      const params = [orgId];
      let idx = 2;

      if (from) {
        filters.push(`${column} >= $${idx++}`);
        params.push(from);
      }
      if (to) {
        filters.push(`${column} <= $${idx++}`);
        params.push(to);
      }

      const clause = filters.length ? ` AND ${filters.join(' AND ')}` : '';
      return { clause, params };
    };

    const chargeFilter = buildFilter('created_at');
    const paymentFilter = buildFilter('COALESCE(received_at, created_at)');

    const charges = await client.query(
      `
      SELECT learner_id::text AS learner_id,
             UPPER(COALESCE(currency, 'USD')) AS currency,
             SUM(amount_cents)::bigint AS total_charged
        FROM org_fee_charges
       WHERE org_id = $1${chargeFilter.clause}
       GROUP BY learner_id, currency
      `,
      chargeFilter.params,
    );

    const payments = await client.query(
      `
      SELECT learner_id::text AS learner_id,
             UPPER(COALESCE(currency, 'USD')) AS currency,
             SUM(amount_cents)::bigint AS total_paid
        FROM org_fee_payments
       WHERE org_id = $1${paymentFilter.clause}
       GROUP BY learner_id, currency
      `,
      paymentFilter.params,
    );

    const rowsMap = new Map();
    const touchRow = (learnerId, currency) => {
      const key = `${learnerId || 'unknown'}__${currency}`;
      if (rowsMap.has(key)) return rowsMap.get(key);

      const meta = learnerMap.get(String(learnerId)) || {};
      const row = {
        learner_id: String(learnerId || ''),
        admission_no: meta.admission_code || null,
        learner_name: meta.learner_name || null,
        grade: meta.grade || meta.class_label || null, // ✅ grade now always exists from query
        currency: currency || 'USD',
        total_charged: 0,
        total_paid: 0,
      };

      rowsMap.set(key, row);
      return row;
    };

    const totalCharges = new Map();
    const totalPaid = new Map();

    for (const ch of charges.rows || []) {
      const row = touchRow(ch.learner_id, ch.currency);
      row.total_charged += Number(ch.total_charged || 0);
      totalCharges.set(
        ch.currency,
        (totalCharges.get(ch.currency) || 0) + Number(ch.total_charged || 0),
      );
    }

    for (const p of payments.rows || []) {
      const row = touchRow(p.learner_id, p.currency);
      row.total_paid += Number(p.total_paid || 0);
      totalPaid.set(
        p.currency,
        (totalPaid.get(p.currency) || 0) + Number(p.total_paid || 0),
      );
    }

    const rows = Array.from(rowsMap.values()).map((r) => ({
      ...r,
      balance: Number(r.total_charged || 0) - Number(r.total_paid || 0),
    }));

    rows.sort((a, b) =>
      String(a.learner_name || '').localeCompare(String(b.learner_name || '')),
    );

    const currencies = new Set([...totalCharges.keys(), ...totalPaid.keys()]);

    const totals_by_currency = Array.from(currencies).map((currency) => {
      const charged = Number(totalCharges.get(currency) || 0);
      const paid = Number(totalPaid.get(currency) || 0);
      return { currency, total_charged: charged, total_paid: paid, balance: charged - paid };
    });

    return res.json({ rows, totals_by_currency });
  } catch (err) {
    console.error('[getInstitutionFeeStatement] error', err);
    return res.status(500).json({ message: 'Unable to load institution statement' });
  } finally {
    client.release();
  }
}


export async function getInstitutionFeeStatementPdf(req, res) {
  const orgId = normalizeOrgId(req);

  const { error: qErr, value: query } = dateRangeQuerySchema.validate(req.query || {}, {
    allowUnknown: true,
  });
  if (qErr) return res.status(400).json({ message: qErr.message });

  const from = query?.from ? new Date(query.from) : null;
  const to = query?.to ? new Date(query.to) : null;

  const statementPayload = await (async () => {
    const fakeReq = { ...req, query };
    const fakeRes = {
      status: () => fakeRes,
      json: (payload) => payload,
    };
    return getInstitutionFeeStatement(fakeReq, fakeRes);
  })();

  const rows = Array.isArray(statementPayload?.rows) ? statementPayload.rows : [];
  const totals_by_currency = Array.isArray(statementPayload?.totals_by_currency)
    ? statementPayload.totals_by_currency
    : [];

  const org = await loadOrgMeta(orgId);
  if (!org) return res.status(404).json({ message: 'Org not found' });

  try {
    const pdfBuffer = await renderInstitutionFeeStatementPdf({
      org,
      rows,
      totalsByCurrency: totals_by_currency,
      dateLabel:
        from || to
          ? `Range: ${from ? from.toISOString().slice(0, 10) : '...'} → ${
              to ? to.toISOString().slice(0, 10) : '...'
            }`
          : null,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="institution-fee-statement-${orgId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[getInstitutionFeeStatementPdf] error', err);
    return res.status(500).json({ message: 'Unable to render institution statement PDF' });
  }
}


export async function mpesaFeeInboundWebhook(req, res) {
  const client = await pool.connect();

  function darajaReply(res, ok, desc) {
    return res.status(200).json({
      ResultCode: ok ? 0 : 1,
      ResultDesc: desc || (ok ? 'Accepted' : 'Rejected'),
    });
  }

  try {
    const parsed = parseMpesaC2B(req.body || {});

    // Always ACK quickly to Daraja; ignore malformed payloads safely
    if (!parsed.account_ref || !parsed.provider_ref || !(parsed.amount_cents > 0)) {
      return darajaReply(res, true, 'Accepted');
    }

    const secret = req.query?.k || req.get('x-webhook-secret');
    const secretOk = await verifyWebhookSecretIfConfigured(
      client,
      'mpesa',
      parsed.account_ref,
      secret
    );
    if (!secretOk) return darajaReply(res, false, 'Invalid webhook secret');

    const orgId = await resolveOrgIdByAccountRef(client, 'mpesa', parsed.account_ref);
    if (!orgId) return darajaReply(res, true, 'Accepted');

    await client.query('BEGIN');

    const inbound = await upsertInboundTx(client, {
      org_id: orgId,
      provider: 'mpesa',
      provider_ref: parsed.provider_ref,
      amount_cents: parsed.amount_cents,
      currency: parsed.currency || 'KES',
      registration_ref: parsed.registration_ref,
      raw: req.body || {},
    });

    // ✅ No redundant lock here — tryAutoPostInbound() already locks the row FOR UPDATE.
    const posted = await tryAutoPostInbound(client, orgId, inbound, req);

    await client.query('COMMIT');

    console.log('[mpesaFeeInboundWebhook] accepted', {
      orgId,
      inboundId: inbound?.id,
      posted,
      account_ref: parsed.account_ref,
      provider_ref: parsed.provider_ref,
    });

    return darajaReply(res, true, 'Accepted');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[mpesaFeeInboundWebhook] error', err);

    // Daraja best practice: ACK even on errors to avoid retries storm
    return darajaReply(res, true, 'Accepted');
  } finally {
    client.release();
  }
}

export async function bankFeeInbound(req, res) {
  const body = req.body || {};
  const accountRef = String(body.account_ref || '').trim(); // bank account identifier you mapped
  const providerRef = String(body.provider_ref || '').trim(); // bank transaction reference
  const regRef = body.registration_ref ? String(body.registration_ref).trim() : null;

  const amountMajor = Number(body.amount || 0);
  const amountCents = Math.round(amountMajor * 100);
  const currency = String(body.currency || 'KES').toUpperCase();

  if (!accountRef || !providerRef || !(amountCents > 0)) {
    return res.status(400).json({ message: 'account_ref, provider_ref, amount required' });
  }

  const client = await pool.connect();
  try {
    const orgId = await resolveOrgIdByAccountRef(client, 'bank', accountRef);
    if (!orgId) return res.status(400).json({ message: 'Unknown bank account_ref' });

    await client.query('BEGIN');

    const inbound = await upsertInboundTx(client, {
      org_id: orgId,
      provider: 'bank',
      provider_ref: providerRef,
      amount_cents: amountCents,
      currency,
      registration_ref: regRef,
      raw: body,
    });

    const posted = await tryAutoPostInbound(client, orgId, inbound, req);

    await client.query('COMMIT');
    return res.json({ ok: true, orgId, inboundId: inbound.id, posted });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[bankFeeInbound] error', err);
    return res.status(500).json({ message: 'Unable to process bank inbound' });
  } finally {
    client.release();
  }
}
 
// Daraja expects these fields for both validation + confirmation.
function darajaReply(res, ok, desc) {
  // ResultCode: 0 = Accepted, any non-zero usually means reject/fail
  return res.status(200).json({
    ResultCode: ok ? 0 : 1,
    ResultDesc: desc || (ok ? 'Accepted' : 'Rejected'),
  });
}

// VALIDATION: called BEFORE payment is finalized (optional depending on paybill settings)
export async function mpesaFeeInboundValidate(req, res) {
  const client = await pool.connect();
  try {
    const body = req.body || {};

    // Validation payload may NOT include receipt/TransID yet, so parse carefully.
    const shortcode = safePick(body, [
      'BusinessShortCode',
      'ShortCode',
      'PayBillNumber',
      'TillNumber',
      'ReceiverPartyPublicName',
    ]);
    const amount = safePick(body, ['TransAmount', 'Amount', 'TransactionAmount']);
    const billRef = safePick(body, ['BillRefNumber', 'AccountReference', 'Reference', 'InvoiceNumber']);

    const account_ref = shortcode ? String(shortcode).trim() : null;
    const registration_ref = billRef ? String(billRef).trim() : null;
    const amount_cents = Math.round(Number(amount || 0) * 100);

    if (!account_ref) return darajaReply(res, false, 'Missing BusinessShortCode');
    if (!(amount_cents > 0)) return darajaReply(res, false, 'Invalid amount');
    if (!registration_ref) return darajaReply(res, false, 'Missing account/reference');

    // Optional secret check (configure per account)
    const secret = req.query?.k || req.get('x-webhook-secret');
    const secretOk = await verifyWebhookSecretIfConfigured(client, 'mpesa', account_ref, secret);
    if (!secretOk) return darajaReply(res, false, 'Invalid webhook secret');

    // Must be a paybill we know
    const orgId = await resolveOrgIdByAccountRef(client, 'mpesa', account_ref);
    if (!orgId) return darajaReply(res, false, 'Unknown paybill');

    // OPTIONAL (recommended): only accept if learner exists
    const reg = String(registration_ref).trim();
    const learnerQ = await client.query(
      `select 1
         from org_learner_profiles l
        where l.org_id = $1
          and (
            l.admission_code::text = $2
            or l.id::text = $2
           
            or l.user_id::text = $2
          )
        limit 1`,
      [orgId, reg]
    );

    if (!learnerQ.rowCount) {
      // If you prefer "accept all then mark unmatched", change this to darajaReply(res, true, 'Accepted')
      return darajaReply(res, false, 'Invalid learner reference');
    }

    return darajaReply(res, true, 'Accepted');
  } catch (err) {
    console.error('[mpesaFeeInboundValidate] error', err);
    // Safer to ACCEPT on errors to avoid blocking payments; you can choose reject if you want strict.
    return darajaReply(res, true, 'Accepted');
  } finally {
    client.release();
  }
}

// CONFIRM: called AFTER payment is completed
export async function mpesaFeeInboundConfirm(req, res) {
  // just call your existing handler (it upserts + autoposts)
  return mpesaFeeInboundWebhook(req, res);
}

export async function listFeeInbound(req, res) {
  const orgId = String(req.params.orgId || '').trim();
  let status = String(req.query?.status || '').trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 50)));
  const offset = Math.max(0, Number(req.query?.offset || 0));

  if (!orgId) return res.status(400).json({ message: 'orgId required' });
  if (status === 'all') status = '';

  try {
    const where = ['t.org_id = $1'];
    const vals = [orgId];

    if (status) {
      vals.push(status);
      where.push(`t.status = $${vals.length}`);
    }

    vals.push(limit);
    const limitIdx = vals.length;

    vals.push(offset);
    const offsetIdx = vals.length;

    const q = await pool.query(
      `
      SELECT
        t.id,
        t.org_id,
        t.provider,
        t.provider_ref,
        t.registration_ref,
        t.amount_cents,
        t.currency,
        t.status,
        t.created_at,
        t.posted_payment_id,
        t.matched_learner_id,

        lp.user_id            AS learner_user_id,
        lp.admission_code     AS learner_admission_code,
        lp.class_label        AS learner_class_label,

       ${feeInboundLearnerNameExpr({ inboundAlias: 't' })} AS learner_name


      FROM org_fee_inbound_transactions t

      LEFT JOIN org_learner_profiles lp
        ON lp.org_id = t.org_id
       AND (
            lp.admission_code = t.matched_learner_id
            OR lp.user_id::text = t.matched_learner_id::text
            OR lp.id::text      = t.matched_learner_id::text
           )

      LEFT JOIN profiles pr
        ON pr.user_id = lp.user_id

      LEFT JOIN users u
        ON u.id = lp.user_id

      WHERE ${where.join(' AND ')}
      ORDER BY t.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      vals,
    );

    return res.json({
      items: q.rows || [],
      meta: { orgId, status: status || null, limit, offset },
    });
  } catch (err) {
    console.error('[listFeeInbound] error', err);
    return res.status(500).json({ message: 'Unable to load inbound transactions' });
  }
}

/**
 * POST /api/orgs/:orgId/fees/inbound/:id/attach  { learner_id }
 * Admin action: attach an unmatched inbound tx to a learner and auto-post payment.
 */
export async function attachFeeInbound(req, res) {
  const orgId = String(req.params.orgId || '').trim();
  const inboundId = String(req.params.id || '').trim();
  const learnerId = req.body?.learner_id;

  if (!orgId) return res.status(400).json({ message: 'orgId required' });
  if (!inboundId) return res.status(400).json({ message: 'inbound id required' });
  if (!learnerId) return res.status(400).json({ message: 'learner_id required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // lock row for safe idempotency
    const inboundQ = await client.query(
      `select *
         from org_fee_inbound_transactions
        where org_id=$1 and id=$2
        limit 1
        for update`,
      [orgId, inboundId],
    );

    if (!inboundQ.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Inbound transaction not found' });
    }

    const inboundRow = inboundQ.rows[0];

    const learnerRef = await resolveLearnerRefInOrg(client, orgId, learnerId);
    if (!learnerRef) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'learner_id not found in this org' });
    }

    const posted = await postInboundToLearner(client, orgId, inboundRow, learnerRef, req, 'Manually matched');

    await client.query('COMMIT');
    return res.json({ ok: true, orgId, inboundId: inboundRow.id, posted });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[attachFeeInbound] error', err);
    return res.status(500).json({ message: 'Unable to attach inbound payment' });
  } finally {
    client.release();
  }
}

export async function getMyFeeStructure(req, res) {
  // ✅ Validate ONLY params
  const { error: pErr } = orgParamsSchema.validate(req.params);
  if (pErr) return res.status(400).json({ message: pErr.message });

  // ✅ Debug
  console.log('[getMyFeeStructure] params:', req.params, 'query:', req.query);

  const { orgId } = req.params;
  const userId = req.user?.id;

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const learner = await requireLearnerInOrg(pool, orgId, userId);
    if (!learner) {
      return res.status(403).json({ message: 'Not a learner in this organization' });
    }

    const structure = await pickActiveStructureForLearner(orgId, learner.class_label);
if (!structure) return res.status(404).json({ message: 'No published fee structure found for your class/grade' });


    const full = await fetchStructureWithItems(orgId, structure.id);

    return res.json({
      learner: {
        user_id: learner.user_id,
        admission_code: learner.admission_code,
        class_label: learner.class_label,
      },
      structure: full,
    });
  } catch (err) {
    console.error('[getMyFeeStructure] error', err);
    return res.status(500).json({ message: 'Unable to load fee structure' });
  }
}


export async function getMyFeeStructurePdf(req, res) {
  // ✅ Validate ONLY params
  const { error: pErr } = orgParamsSchema.validate(req.params);
  if (pErr) return res.status(400).json({ message: pErr.message });

  const { orgId } = req.params;
  const userId = req.user?.id;

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const learner = await requireLearnerInOrg(pool, orgId, userId);
    if (!learner) return res.status(403).json({ message: 'Not a learner in this organization' });

    const picked = await pickBestStructureForLearner(orgId, learner.class_label);
    if (!picked) return res.status(404).json({ message: 'No fee structure found for your class/grade' });

    const org = await loadOrgMeta(orgId);
    if (!org) return res.status(404).json({ message: 'Org not found' });

    const structure = await fetchStructureWithItems(orgId, picked.id);
    const pdfBuffer = await renderFeeStructurePdf({ org, structure });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="fee-structure-${learner.class_label || 'learner'}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[getMyFeeStructurePdf] error', err);
    return res.status(500).json({ message: 'Unable to render fee structure PDF' });
  }
}

export async function getMyFeeStatement(req, res) {
  // ✅ Validate ONLY params
  const { error: pErr } = orgParamsSchema.validate(req.params);
  if (pErr) return res.status(400).json({ message: pErr.message });

  const { orgId } = req.params;
  const userId = req.user?.id;

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const learner = await requireLearnerInOrg(pool, orgId, userId);
    if (!learner) {
      return res.status(403).json({ message: 'Not a learner in this organization' });
    }

    // ✅ override learnerId safely, keep orgId intact
    req.params = { ...(req.params || {}), learnerId: String(learner.user_id) };

    // This calls your existing statement logic (validates learnerId only)
    return getFeeStatement(req, res);
  } catch (err) {
    console.error('[getMyFeeStatement] error', err);
    return res.status(500).json({ message: 'Unable to load statement' });
  }
}

export async function getMyFeeStatementPdf(req, res) {
  // ✅ Validate ONLY params
  const { error: pErr } = orgParamsSchema.validate(req.params);
  if (pErr) return res.status(400).json({ message: pErr.message });

  const { orgId } = req.params;
  const userId = req.user?.id;

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const learner = await requireLearnerInOrg(pool, orgId, userId);
    if (!learner) return res.status(403).json({ message: 'Not a learner in this organization' });

    // ✅ lock learnerId to self
    req.params = { ...(req.params || {}), learnerId: String(learner.user_id) };

    return getFeeStatementPdf(req, res);
  } catch (err) {
    console.error('[getMyFeeStatementPdf] error', err);
    return res.status(500).json({ message: 'Unable to render statement PDF' });
  }
}
