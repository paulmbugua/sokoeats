// apps/backend/utils/feeAccessTable.js
import pool from '../config/db.js';

/**
 * Resolve which instructor table to use for fee access.
 * Prefers org_instructor_profiles when present (to align with roster/bootstrap queries),
 * but will fall back to org_instructors. When both exist, we pick the table that actually
 * has rows for the org when orgId is provided, otherwise we default to profiles-first.
 */
export async function resolveInstructorFeeTable(db = pool, orgId = null) {
  const { rows } = await db.query(`
    select
      to_regclass('public.org_instructor_profiles') as t_profiles,
      to_regclass('public.org_instructors') as t_instructors
  `);

  const hasProfiles = !!rows?.[0]?.t_profiles;
  const hasInstructors = !!rows?.[0]?.t_instructors;

  if (!hasProfiles && !hasInstructors) return null;
  if (hasProfiles && !hasInstructors) return 'org_instructor_profiles';
  if (!hasProfiles && hasInstructors) return 'org_instructors';

  // Both tables exist: prefer the one that actually has rows for this org if we know it.
  if (orgId) {
    try {
      const profRows = await db.query(
        `select 1 from org_instructor_profiles where org_id=$1 limit 1`,
        [orgId],
      );
      if (profRows?.rowCount) return 'org_instructor_profiles';
    } catch (_) {
      // ignore; fall through
    }

    try {
      const instRows = await db.query(`select 1 from org_instructors where org_id=$1 limit 1`, [orgId]);
      if (instRows?.rowCount) return 'org_instructors';
    } catch (_) {
      // ignore; fall through
    }
  }

  // Default preference: profiles first to match org bootstrap/roster queries
  return 'org_instructor_profiles';
}

export default resolveInstructorFeeTable;
