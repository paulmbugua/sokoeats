import pool from '../config/db.js';

function missing(error) {
  return ['42P01', '42703'].includes(error?.code);
}

async function queryOrEmpty(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (missing(error)) return { rows: [], rowCount: 0 };
    throw error;
  }
}

export async function adminListOrgs(_req, res) {
  const { rows } = await queryOrEmpty(
    'SELECT * FROM orgs ORDER BY created_at DESC LIMIT 250',
  );
  return res.json({ success: true, orgs: rows });
}

export async function adminOrgSubscriptions(req, res) {
  const { rows } = await queryOrEmpty(
    `SELECT *
       FROM org_subscriptions
      WHERE org_id = $1
      ORDER BY created_at DESC`,
    [req.params.orgId],
  );
  return res.json({ success: true, subscriptions: rows });
}

export async function adminUpgradeOrg(req, res) {
  return res.status(501).json({
    success: false,
    message: 'Org upgrades are not configured for this Ekazi API shell',
  });
}

export async function adminGetOrgPricing(_req, res) {
  const { rows } = await queryOrEmpty(
    'SELECT * FROM org_pricing ORDER BY created_at DESC',
  );
  return res.json({ success: true, pricing: rows });
}

export async function adminUpsertOrgPricing(req, res) {
  return res.status(501).json({
    success: false,
    message: 'Org pricing is not configured for this Ekazi API shell',
    input: req.body || {},
  });
}

export async function adminUpdateOrgPricing(req, res) {
  return res.status(501).json({
    success: false,
    message: 'Org pricing is not configured for this Ekazi API shell',
    id: req.params.id,
  });
}
