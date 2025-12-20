// apps/backend/utils/orgTierGuard.js
import pool from '../config/db.js';

const ORDER = ['starter', 'pro', 'enterprise'];

// Internal helper (you can reuse)
function assertOrgTierAtLeast(currentTier, requiredTier) {
  const idx = ORDER.indexOf(currentTier);
  const reqIdx = ORDER.indexOf(requiredTier);

  if (idx === -1 || reqIdx === -1 || idx < reqIdx) {
    const err = new Error(
      `This feature requires ${requiredTier.toUpperCase()} plan or higher.`,
    );
    err.status = 403;
    throw err;
  }
}

/**
 * Get the effective tier AND optionally enforce a minimum tier.
 *
 * Usage:
 *   await requireOrgTier(orgId);          // just returns 'starter' | 'pro' | 'enterprise'
 *   await requireOrgTier(orgId, 'pro');   // throws 403 if org is only 'starter'
 *   await requireOrgTier(orgId, ['pro','enterprise']); // throws 403 if not in the list
 */
export async function requireOrgTier(orgId, required) {
  const { rows } = await pool.query(
    `
    SELECT tier
    FROM org_subscriptions
    WHERE org_id = $1
      AND active = TRUE
    ORDER BY started_at DESC
    LIMIT 1
    `,
    [orgId],
  );

  let tier = 'starter';
  if (rows.length) {
    tier = String(rows[0].tier || 'starter').toLowerCase();
    if (!ORDER.includes(tier)) tier = 'starter';
  }

  // If no requirement passed, just return the tier (backwards compatible)
  if (!required) {
    return tier;
  }

  // If requirement is an array → must be *one of* these tiers
  if (Array.isArray(required)) {
    if (!required.includes(tier)) {
      const err = new Error(
        `This feature requires one of the following plans: ${required
          .map((t) => t.toUpperCase())
          .join(', ')}.`,
      );
      err.status = 403;
      throw err;
    }
    return tier;
  }

  // If requirement is a single tier string → treat as "at least this tier"
  assertOrgTierAtLeast(tier, required);
  return tier;
}

// Export separately if you still want direct use
export { assertOrgTierAtLeast };
