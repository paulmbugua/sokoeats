// apps/backend/middleware/orgAccess.js
import pool from '../config/db.js';
import { requireOrgTier as enforceOrgTier } from '../utils/orgTierGuard.js';

function normalizeOrgId(req) {
  return (
    req.params?.orgId ||
    req.params?.org_id ||
    req.body?.orgId ||
    req.body?.org_id ||
    req.query?.orgId ||
    req.query?.org_id
  );
}

export function requireOrgTierMiddleware(requiredTier = ['pro', 'enterprise']) {
  return async (req, res, next) => {
    const orgId = normalizeOrgId(req);
    if (!orgId) {
      return res.status(400).json({ message: 'org_id required' });
    }

    try {
      await enforceOrgTier(orgId, requiredTier);
      res.locals.orgId = orgId;
      return next();
    } catch (err) {
      const status = err?.status || 403;
      return res.status(status).json({ message: err?.message || 'Forbidden' });
    }
  };
}

export const requireOrgProTier = requireOrgTierMiddleware(['pro', 'enterprise']);
export const requireOrgEnterpriseTier = requireOrgTierMiddleware('enterprise');

const ORG_ROLE_ORDER = {
  learner: 0,
  instructor: 1,
  admin: 2,
  owner: 3,
};

export function requireOrgRole(minRole = 'admin') {
  return async (req, res, next) => {
    const orgId = normalizeOrgId(req);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!orgId) {
      return res.status(400).json({ message: 'org_id required' });
    }

    try {
      const { rows } = await pool.query(
        `SELECT role FROM org_memberships WHERE org_id=$1 AND user_id=$2 LIMIT 1`,
        [orgId, userId],
      );

      if (!rows.length) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const role = String(rows[0].role || '').toLowerCase();
      if (!(minRole in ORG_ROLE_ORDER) || !(role in ORG_ROLE_ORDER)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      if (ORG_ROLE_ORDER[role] < ORG_ROLE_ORDER[minRole]) {
        return res.status(403).json({ message: 'Insufficient role' });
      }

      res.locals.orgMembership = { orgId, userId, role };
      return next();
    } catch (err) {
      console.error('[requireOrgRole] failed', err);
      return res.status(500).json({ message: 'Server error' });
    }
  };
}

export const requireOrgInstructor = requireOrgRole('instructor');
export const requireOrgAdmin = requireOrgRole('admin');
