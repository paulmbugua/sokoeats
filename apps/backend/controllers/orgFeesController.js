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
} from '../validators/orgFeesValidators.js';
import {
  renderFeeStatementPdf,
  renderFeeStructurePdf,
} from '../services/orgFeePdfService.js';

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

function feeInboundNameJoinSql() {
  return `
    LEFT JOIN profiles pr
      ON pr.user_id = lp.user_id
    LEFT JOIN users u
      ON u.id = lp.user_id
  `;
}

function feeInboundLearnerNameExpr() {
  return `COALESCE(pr.name, u.name, lp.admission_code, t.matched_learner_id)`;
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

async function loadOrgMeta(orgId) {
  const { rows } = await pool.query(
    `select id, name, logo_url, address_line1, address_line2, phone_number, contact_email
       from organizations
      where id = $1
      limit 1`,
    [orgId],
  );
  return rows[0] || null;
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



export async function listFeeStructures(req, res) {
  const orgId = normalizeOrgId(req);
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

    if (value.is_active) {
      await client.query(`update org_fee_structures set is_active = false where org_id = $1`, [orgId]);
    }
    const parsed = parseScopeFromDescription(value.description || '');
    const scope_type = value.scope_type || parsed.scope_type || null;
    const scope_value = value.scope_value || parsed.scope_value || null;
    const cleanDescription = parsed.cleanDescription || null;


   const structureRes = await client.query(
  `insert into org_fee_structures
     (org_id, title, description, currency, is_active, effective_term, created_by, scope_type, scope_value)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
   returning *`,
  [
    orgId,
    value.title,
    cleanDescription,
    value.currency || 'USD',
    value.is_active,
    value.effective_term || null,
    await resolveCreatedByProfileId(client, req),
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
          item.currency || value.currency || 'USD',
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
        `insert into org_fee_structure_items
           (structure_id, label, amount_cents, currency, cadence, is_optional, sort_order, metadata)
         values ${insertValues.join(',')}
         returning *`,
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

  const { error, value } = updateStructureSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: error.message });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await fetchStructureWithItems(orgId, params.structureId);
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

    // ✅ NEW: parse scope out of description (legacy) and support explicit scope fields (new)
    const parsed = parseScopeFromDescription(value.description ?? existing.description ?? '');
    const scope_type = value.scope_type ?? parsed.scope_type ?? existing.scope_type ?? null;
    const scope_value = value.scope_value ?? parsed.scope_value ?? existing.scope_value ?? null;

    if (value.title !== undefined) pushSet('title', value.title);

    // ✅ UPDATED: store clean description + persist scope columns
    if (value.description !== undefined) pushSet('description', parsed.cleanDescription || null);
    if (value.scope_type !== undefined || parsed.scope_type) pushSet('scope_type', scope_type);
    if (value.scope_value !== undefined || parsed.scope_value) pushSet('scope_value', scope_value);

    if (value.currency !== undefined) pushSet('currency', value.currency);
    if (value.effective_term !== undefined) pushSet('effective_term', value.effective_term || null);
    if (value.is_active !== undefined) pushSet('is_active', value.is_active);

    if (sets.length) {
      sets.push('updated_at = now()');

      if (value.is_active) {
        await client.query(`update org_fee_structures set is_active=false where org_id=$1`, [orgId]);
      }

      await client.query(
        `update org_fee_structures
            set ${sets.join(', ')}
          where org_id = $${vals.length + 1}
            and id = $${vals.length + 2}`,
        [...vals, orgId, params.structureId],
      );
    }

    if (value.items) {
      await client.query(`delete from org_fee_structure_items where structure_id=$1`, [params.structureId]);

      if (value.items.length) {
        const insertValues = [];
        const paramsArr = [];

        value.items.forEach((item, idx) => {
          paramsArr.push(
            params.structureId,
            item.label,
            item.amount_cents,
            item.currency || value.currency || existing.currency,
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
          `insert into org_fee_structure_items
             (structure_id, label, amount_cents, currency, cadence, is_optional, sort_order, metadata)
           values ${insertValues.join(',')}`,
          paramsArr,
        );
      }
    }

    await client.query('COMMIT');

    const updated = await fetchStructureWithItems(orgId, params.structureId);
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
    const structure = await fetchStructureWithItems(orgId, params.structureId);
    if (!structure) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Structure not found' });
    }

    await client.query(`update org_fee_structures set is_active=false where org_id=$1`, [orgId]);
    await client.query(
      `update org_fee_structures set is_active=true, updated_at = now() where org_id=$1 and id=$2`,
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

    const { rows } = await pool.query(
      `insert into org_fee_charges
         (org_id, learner_id, amount_cents, currency, description, class_label, due_date, created_by, structure_id, structure_item_id, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning *`,
      [
        orgId,
        value.learner_id,
        value.amount_cents,
        value.currency || 'USD',
        value.description || null,
        value.class_label || null,
        value.due_date || null,
        createdBy,
        value.structure_id || scope?.structure_id || null,
        value.structure_item_id || scope?.item_id || null,
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    const failed = [];

    for (const rawId of value.learner_ids) {
      const learnerId = String(rawId || '').trim();
      if (!learnerId) continue;
      try {
        const { rows } = await client.query(
          `insert into org_fee_charges
             (org_id, learner_id, amount_cents, currency, description, class_label, due_date, created_by, structure_id, structure_item_id, metadata)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           returning *`,
          [
            orgId,
            learnerId,
            value.amount_cents,
            value.currency || 'USD',
            value.description || null,
            value.class_label || null,
            value.due_date || null,
             await resolveCreatedByProfileId(client, req),
            value.structure_id || scope?.structure_id || null,
            value.structure_item_id || scope?.item_id || null,
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

  if (value.charge_id) {
    const { rows } = await pool.query(
      `select learner_id from org_fee_charges where org_id=$1 and id=$2 limit 1`,
      [orgId, value.charge_id],
    );
    if (!rows.length) {
      return res.status(400).json({ message: 'charge_id not found in org' });
    }
    if (!value.learner_id) value.learner_id = rows[0].learner_id;
  }

  try {

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
        value.currency || 'USD',
        value.method || null,
        value.reference || null,
        value.note || null,
        value.received_at || null,
        createdBy,
        value.charge_id || null,
        value.metadata || {},
      ],
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
      `SELECT
          ch.learner_id::text AS learner_id,
          ch.currency AS currency,
          COALESCE(SUM(ch.amount_cents), 0)::bigint AS charges,
          COALESCE(SUM(p.amount_cents), 0)::bigint AS payments
        FROM org_fee_charges ch
        LEFT JOIN org_fee_payments p
          ON p.org_id = ch.org_id
         AND p.learner_id::text = ch.learner_id::text
         AND p.currency = ch.currency
        WHERE ch.org_id = $1
          AND ($2::text IS NULL OR ch.class_label = $2)
        GROUP BY ch.learner_id::text, ch.currency
        ORDER BY ch.learner_id::text, ch.currency`,
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


export async function getFeeStatement(req, res) {
  const orgId = normalizeOrgId(req);
  const { error: paramErr, value: params } = learnerParamsSchema.validate(req.params);
  if (paramErr) return res.status(400).json({ message: paramErr.message });

  try {
    const charges = await pool.query(
      `SELECT id, amount_cents, currency, description, class_label, due_date, created_at, structure_id, structure_item_id
         FROM org_fee_charges
        WHERE org_id = $1 AND learner_id::text = $2
        ORDER BY created_at DESC`,
      [orgId, String(params.learnerId)],
    );

    const payments = await pool.query(
      `SELECT id, amount_cents, currency, method, reference, note, received_at, created_at, charge_id
         FROM org_fee_payments
        WHERE org_id = $1 AND learner_id::text = $2
        ORDER BY COALESCE(received_at, created_at) DESC`,
      [orgId, String(params.learnerId)],
    );

   const sumByCur = (rows) => {
  const m = new Map();
  for (const r of rows || []) {
    const cur = String(r.currency || 'USD').toUpperCase();
    m.set(cur, (m.get(cur) || 0) + Number(r.amount_cents || 0));
  }
  return Array.from(m.entries()).map(([currency, amount_cents]) => ({ currency, amount_cents }));
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

// ✅ optional: keep legacy single summary for old UI (pick first currency or USD)
const legacy = summary_by_currency.find((x) => x.currency === 'USD') || summary_by_currency[0] || null;

return res.json({
  charges: charges.rows,
  payments: payments.rows,
  summary_by_currency,
  summary: legacy
    ? { total_charges: legacy.total_charges, total_payments: legacy.total_payments, balance: legacy.balance }
    : { total_charges: 0, total_payments: 0, balance: 0 },
});

  } catch (err) {
    console.error('[getFeeStatement] error', err);
    return res.status(500).json({ message: 'Unable to load statement' });
  }
}

export async function getFeeStatementPdf(req, res) {
  const orgId = normalizeOrgId(req);
  const { error: paramErr, value: params } = learnerParamsSchema.validate(req.params);
  if (paramErr) return res.status(400).json({ message: paramErr.message });

  const org = await loadOrgMeta(orgId);
  if (!org) return res.status(404).json({ message: 'Org not found' });

  const statementRes = await pool.query(
    `select
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
      where ch.org_id = $1 and ch.learner_id::text = $2
      order by ch.created_at asc, p.created_at asc`,
    [orgId, String(params.learnerId)],
  );

  const paymentsRes = await pool.query(
    `select * from org_fee_payments where org_id=$1 and learner_id::text=$2 order by created_at asc`,
    [orgId, String(params.learnerId)],
  );

  const summary = paymentsRes.rows.reduce(
    (acc, row) => {
      acc.total_payments += Number(row.amount_cents || 0);
      return acc;
    },
    { total_payments: 0 },
  );

  const seenCharges = new Set();
  let totalCharges = 0;
  for (const row of statementRes.rows) {
    if (row.charge_id && !seenCharges.has(row.charge_id)) {
      totalCharges += Number(row.charge_amount || 0);
      seenCharges.add(row.charge_id);
    }
  }
  const extraPayments = paymentsRes.rows.filter((p) => !p.charge_id);
  const combinedEntries = [...statementRes.rows, ...extraPayments.map((p) => ({ payment_id: p.id, ...p }))].sort(
    (a, b) => {
      const left =
        new Date(a.payment_created_at || a.received_at || a.charge_created_at || a.created_at || 0).getTime();
      const right =
        new Date(b.payment_created_at || b.received_at || b.charge_created_at || b.created_at || 0).getTime();
      return left - right;
    },
  );

  const balance = totalCharges - summary.total_payments;

  const pdfBuffer = await renderFeeStatementPdf({
    org,
    learnerId: params.learnerId,
    entries: combinedEntries,
    totals: { totalCharges, totalPayments: summary.total_payments, balance },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="fee-statement-${params.learnerId}.pdf"`);
  return res.send(pdfBuffer);
}

export async function getFeeStructurePdf(req, res) {
  const orgId = normalizeOrgId(req);
  const { error: paramErr, value: params } = structureParamsSchema.validate(req.params);
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

    if (!parsed.account_ref || !parsed.provider_ref || !(parsed.amount_cents > 0)) {
      return darajaReply(res, true, 'Accepted');
    }

    const secret = req.query?.k || req.get('x-webhook-secret');
    const secretOk = await verifyWebhookSecretIfConfigured(
      client,
      'mpesa',
      parsed.account_ref,
      secret,
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
      currency: parsed.currency,
      registration_ref: parsed.registration_ref,
      raw: req.body || {},
    });

    // ✅ ADD THIS: lock the inbound row so only ONE request can post it
    await client.query(
      `select id from org_fee_inbound_transactions where id=$1 for update`,
      [inbound.id],
    );

    // Now safe: only one concurrent request can get here at a time for this inbound row
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
            or l.learner_id::text = $2
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

        COALESCE(pr.name, u.name, lp.admission_code, t.matched_learner_id) AS learner_name

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

    const structure = await pickBestStructureForLearner(orgId, learner.class_label);
    if (!structure) {
      return res.status(404).json({ message: 'No fee structure found for your class/grade' });
    }

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