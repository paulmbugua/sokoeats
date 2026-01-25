// apps/backend/controllers/adminOrgController.js
import pool from '../config/db.js';
import {
  ORG_SEATS,
  getOrgPricingTableAsync,
  resolvePriceAsync,
} from '../services/orgPricing.js';

const VALID_CURRENCIES = new Set(['USD', 'KES']);
const VALID_TIERS = new Set(['starter', 'pro', 'enterprise']);
const VALID_PRICE_TIERS = new Set(['pro', 'enterprise']);
const VALID_CYCLES = new Set(['monthly', 'yearly']);
const VALID_STATUSES = new Set([
  'active',
  'canceled',
  'past_due',
  'trial',
  'expired',
]);

const normalizeCurrency = (raw) => {
  const value = String(raw || '').toUpperCase();
  return VALID_CURRENCIES.has(value) ? value : null;
};

const normalizeTier = (raw, allowed = VALID_TIERS) => {
  const value = String(raw || '').toLowerCase();
  return allowed.has(value) ? value : null;
};

const normalizeCycle = (raw) => {
  const value = String(raw || '').toLowerCase();
  return VALID_CYCLES.has(value) ? value : null;
};

const normalizeStatus = (raw) => {
  const value = String(raw || '').toLowerCase();
  return VALID_STATUSES.has(value) ? value : null;
};

const parsePositiveInt = (raw) => {
  const val = Number(raw);
  if (!Number.isFinite(val) || !Number.isInteger(val) || val < 0) return null;
  return val;
};

const parseOptionalBoolean = (raw) => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
};

export async function adminListOrgs(req, res) {
  const q = String(req.query?.q || '').trim();
  const limitRaw = Number(req.query?.limit || 50);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
    : 50;

  const params = [];
  let where = '';
  if (q) {
    params.push(`%${q}%`);
    where =
      'WHERE (o.name ILIKE $1 OR o.email_domain ILIKE $1 OR o.id::text ILIKE $1)';
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  try {
    const { rows } = await pool.query(
      `SELECT
         o.id AS org_id,
         o.name,
         o.email_domain,
         o.created_at,
         COALESCE(m.member_count, 0) AS members_count,
         s.id AS subscription_id,
         s.tier,
         s.cycle,
         s.currency,
         s.status,
         s.seats,
         s.expires_at,
         s.started_at,
         s.active
       FROM organizations o
       LEFT JOIN (
         SELECT org_id, COUNT(*)::int AS member_count
           FROM org_memberships
          GROUP BY org_id
       ) m ON m.org_id = o.id
       LEFT JOIN LATERAL (
         SELECT *
           FROM org_subscriptions s
          WHERE s.org_id = o.id
          ORDER BY COALESCE(s.created_at, s.started_at) DESC NULLS LAST
          LIMIT 1
       ) s ON TRUE
       ${where}
       ORDER BY o.created_at DESC
       LIMIT ${limitParam}`,
      params,
    );

    const orgs = rows.map((row) => {
      const status =
        row.status || (row.active ? 'active' : row.active === false ? 'canceled' : null);
      return {
        orgId: row.org_id,
        name: row.name,
        emailDomain: row.email_domain || null,
        createdAt: row.created_at,
        membersCount: row.members_count,
        currentSub: row.subscription_id
          ? {
              tier: row.tier || 'starter',
              cycle: row.cycle || null,
              currency: row.currency || null,
              status,
              seats: row.seats ?? null,
              endAt: row.expires_at || null,
              startedAt: row.started_at || null,
            }
          : null,
      };
    });

    return res.json({ success: true, orgs });
  } catch (error) {
    console.error('[adminListOrgs] failed', error);
    return res.status(500).json({ success: false, message: 'Failed to load orgs' });
  }
}

export async function adminOrgSubscriptions(req, res) {
  const { orgId } = req.params;
  if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });

  try {
    const { rows } = await pool.query(
      `SELECT id, org_id, tier, cycle, currency, seats, status, active,
              started_at, expires_at, amount_cents, meta, created_at, updated_at,
              updated_by_user_id, cancel_at
         FROM org_subscriptions
        WHERE org_id = $1
        ORDER BY COALESCE(created_at, started_at) DESC NULLS LAST`,
      [orgId],
    );

    return res.json({ success: true, subscriptions: rows });
  } catch (error) {
    console.error('[adminOrgSubscriptions] failed', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to load subscriptions' });
  }
}

export async function adminUpgradeOrg(req, res) {
  const { orgId } = req.params;
  const adminUserId = req.adminUserId || null;
  if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });

  const tier = normalizeTier(req.body?.tier);
  const cycle = normalizeCycle(req.body?.cycle || 'monthly');
  const currency = normalizeCurrency(req.body?.currency || 'USD');
  const status = normalizeStatus(req.body?.status || 'active');
  const seats =
    req.body?.seats !== undefined ? parsePositiveInt(req.body?.seats) : ORG_SEATS[tier];

  if (!tier) return res.status(400).json({ success: false, message: 'Invalid tier' });
  if (!cycle) return res.status(400).json({ success: false, message: 'Invalid cycle' });
  if (!currency) return res.status(400).json({ success: false, message: 'Invalid currency' });
  if (!status) return res.status(400).json({ success: false, message: 'Invalid status' });
  if (seats === null || seats <= 0)
    return res.status(400).json({ success: false, message: 'Invalid seats' });

  const endAtRaw = req.body?.endAt || req.body?.end_at || null;
  const endAt = endAtRaw ? new Date(endAtRaw) : null;
  if (endAtRaw && Number.isNaN(endAt?.getTime?.())) {
    return res.status(400).json({ success: false, message: 'Invalid endAt' });
  }

  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  const promoAmountRaw = req.body?.amount_cents_override;
  const promoAmount =
    promoAmountRaw !== undefined ? parsePositiveInt(promoAmountRaw) : null;
  const promoReason =
    typeof req.body?.promo_reason === 'string'
      ? req.body.promo_reason.trim()
      : typeof req.body?.promoReason === 'string'
        ? req.body.promoReason.trim()
        : '';

  if (promoAmountRaw !== undefined && promoAmount === null) {
    return res
      .status(400)
      .json({ success: false, message: 'Invalid amount_cents_override' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orgCheck = await client.query(
        'SELECT id FROM organizations WHERE id = $1 LIMIT 1',
        [orgId],
      );
      if (!orgCheck.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Org not found' });
      }

      await client.query(
        `UPDATE org_subscriptions
            SET active = FALSE,
                status = CASE WHEN status = 'active' THEN 'canceled' ELSE status END,
                updated_at = NOW()
          WHERE org_id = $1 AND active = TRUE`,
        [orgId],
      );

      const startAt = new Date();
      let computedEndAt = endAt;
      if (!computedEndAt) {
        computedEndAt = new Date(startAt);
        if (cycle === 'monthly') computedEndAt.setMonth(computedEndAt.getMonth() + 1);
        if (cycle === 'yearly') computedEndAt.setFullYear(computedEndAt.getFullYear() + 1);
      }

      let effectivePricing = null;
      if (tier === 'starter') {
        effectivePricing = { amount_cents: 0, seats: ORG_SEATS.starter, currency };
      } else {
        effectivePricing = await resolvePriceAsync(tier, cycle, currency, { client });
      }

      const meta = {};
      if (note) meta.admin_note = note;
      if (promoAmount !== null) meta.promo_amount_cents = promoAmount;
      if (promoReason) meta.promo_reason = promoReason;

      const active = status === 'active' || status === 'trial';
      const insert = await client.query(
        `INSERT INTO org_subscriptions
          (org_id, tier, cycle, currency, seats, status, active, started_at, expires_at,
           amount_cents, meta, updated_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          orgId,
          tier,
          cycle,
          currency,
          seats,
          status,
          active,
          startAt,
          computedEndAt,
          effectivePricing.amount_cents,
          meta,
          adminUserId,
        ],
      );

      await client.query('COMMIT');
      return res.json({
        success: true,
        subscription: insert.rows[0],
        effectivePricing,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[adminUpgradeOrg] failed', error);
    return res.status(500).json({ success: false, message: 'Failed to upgrade org' });
  }
}

export async function adminGetOrgPricing(req, res) {
  const currency = normalizeCurrency(req.query?.currency || 'USD');
  if (!currency)
    return res.status(400).json({ success: false, message: 'Invalid currency' });

  try {
    const [table, overrides] = await Promise.all([
      getOrgPricingTableAsync(currency),
      pool.query(
        `SELECT id, currency, tier, cycle, amount_cents, active, note, updated_at
           FROM org_plan_prices
          WHERE currency = $1
          ORDER BY tier, cycle`,
        [currency],
      ),
    ]);

    return res.json({
      success: true,
      table,
      overrides: overrides.rows,
    });
  } catch (error) {
    console.error('[adminGetOrgPricing] failed', error);
    return res.status(500).json({ success: false, message: 'Failed to load pricing' });
  }
}

export async function adminUpsertOrgPricing(req, res) {
  const currency = normalizeCurrency(req.body?.currency);
  const tier = normalizeTier(req.body?.tier, VALID_PRICE_TIERS);
  const cycle = normalizeCycle(req.body?.cycle);
  const amountCents = parsePositiveInt(req.body?.amount_cents);
  const activeRaw = req.body?.active;
  const activeParsed = parseOptionalBoolean(activeRaw);
  const active = activeRaw === undefined ? true : activeParsed;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
  const adminUserId = req.adminUserId || null;

  if (!currency) return res.status(400).json({ success: false, message: 'Invalid currency' });
  if (!tier) return res.status(400).json({ success: false, message: 'Invalid tier' });
  if (!cycle) return res.status(400).json({ success: false, message: 'Invalid cycle' });
  if (amountCents === null)
    return res.status(400).json({ success: false, message: 'Invalid amount_cents' });
  if (active === null)
    return res.status(400).json({ success: false, message: 'Invalid active flag' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO org_plan_prices
        (currency, tier, cycle, amount_cents, active, note, updated_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (currency, tier, cycle)
       DO UPDATE SET
         amount_cents = EXCLUDED.amount_cents,
         active = EXCLUDED.active,
         note = EXCLUDED.note,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = NOW()
       RETURNING *`,
      [currency, tier, cycle, amountCents, active, note, adminUserId],
    );

    return res.json({ success: true, override: rows[0] });
  } catch (error) {
    console.error('[adminUpsertOrgPricing] failed', error);
    return res.status(500).json({ success: false, message: 'Failed to save pricing' });
  }
}

export async function adminUpdateOrgPricing(req, res) {
  const id = Number(req.params?.id);
  if (!Number.isFinite(id))
    return res.status(400).json({ success: false, message: 'Invalid pricing id' });

  const updates = [];
  const params = [];
  const amountCentsRaw = req.body?.amount_cents;
  const amountCents =
    amountCentsRaw !== undefined ? parsePositiveInt(amountCentsRaw) : null;
  if (amountCentsRaw !== undefined && amountCents === null) {
    return res.status(400).json({ success: false, message: 'Invalid amount_cents' });
  }
  if (amountCents !== null) {
    updates.push(`amount_cents = $${params.length + 1}`);
    params.push(amountCents);
  }

  if (req.body?.note !== undefined) {
    updates.push(`note = $${params.length + 1}`);
    params.push(typeof req.body.note === 'string' ? req.body.note.trim() : null);
  }

  if (req.body?.active !== undefined) {
    const activeParsed = parseOptionalBoolean(req.body?.active);
    if (activeParsed === null) {
      return res.status(400).json({ success: false, message: 'Invalid active flag' });
    }
    updates.push(`active = $${params.length + 1}`);
    params.push(activeParsed);
  }

  if (!updates.length) {
    return res.status(400).json({ success: false, message: 'No fields to update' });
  }

  const adminUserId = req.adminUserId || null;
  updates.push(`updated_by_user_id = $${params.length + 1}`);
  params.push(adminUserId);
  updates.push('updated_at = NOW()');

  params.push(id);
  const idParam = `$${params.length}`;

  try {
    const { rows } = await pool.query(
      `UPDATE org_plan_prices
          SET ${updates.join(', ')}
        WHERE id = ${idParam}
        RETURNING *`,
      params,
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Pricing override not found' });
    }

    return res.json({ success: true, override: rows[0] });
  } catch (error) {
    console.error('[adminUpdateOrgPricing] failed', error);
    return res.status(500).json({ success: false, message: 'Failed to update pricing' });
  }
}
