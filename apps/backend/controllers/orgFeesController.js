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
  balancesQuerySchema,
} from '../validators/orgFeesValidators.js';
import {
  renderFeeStatementPdf,
  renderFeeStructurePdf,
} from '../services/orgFeePdfService.js';

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

async function fetchStructureWithItems(orgId, structureId) {
  const structureRes = await pool.query(
    `select * from org_fee_structures where org_id = $1 and id = $2 limit 1`,
    [orgId, structureId],
  );
  if (!structureRes.rows.length) return null;
  const structure = structureRes.rows[0];
  const itemsRes = await pool.query(
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

    const structureRes = await client.query(
      `insert into org_fee_structures (org_id, title, description, currency, is_active, effective_term, created_by)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning *`,
      [
        orgId,
        value.title,
        value.description || null,
        value.currency || 'USD',
        value.is_active,
        value.effective_term || null,
        req.user?.id || null,
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

    if (value.title !== undefined) pushSet('title', value.title);
    if (value.description !== undefined) pushSet('description', value.description || null);
    if (value.currency !== undefined) pushSet('currency', value.currency);
    if (value.effective_term !== undefined) pushSet('effective_term', value.effective_term || null);
    if (value.is_active !== undefined) pushSet('is_active', value.is_active);

    if (sets.length) {
      sets.push('updated_at = now()');
      if (value.is_active) {
        await client.query(`update org_fee_structures set is_active=false where org_id=$1`, [orgId]);
      }
      await client.query(
        `update org_fee_structures set ${sets.join(', ')} where org_id=$${vals.length + 1} and id=$${
          vals.length + 2
        }`,
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
        req.user?.id || null,
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
            req.user?.id || null,
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
        req.user?.id || null,
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
          COALESCE(SUM(ch.amount_cents), 0)::bigint AS charges,
          COALESCE(SUM(p.amount_cents), 0)::bigint AS payments
        FROM org_fee_charges ch
        LEFT JOIN org_fee_payments p
          ON p.org_id = ch.org_id
         AND p.learner_id::text = ch.learner_id::text
        WHERE ch.org_id = $1
          AND ($2::text IS NULL OR ch.class_label = $2)
        GROUP BY ch.learner_id::text
        ORDER BY ch.learner_id::text`,
      [orgId, value.class_label || null],
    );

    const balances = rows.map((r) => ({
      learner_id: r.learner_id,
      charges: Number(r.charges || 0),
      payments: Number(r.payments || 0),
      balance: Number(r.charges || 0) - Number(r.payments || 0),
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

    const totalCharges = charges.rows.reduce((acc, c) => acc + Number(c.amount_cents || 0), 0);
    const totalPayments = payments.rows.reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);

    const summary = {
      total_charges: totalCharges,
      total_payments: totalPayments,
      balance: totalCharges - totalPayments,
    };

    return res.json({ charges: charges.rows, payments: payments.rows, summary });
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
