import pool from '../config/db.js';

const DEFAULT_ROLE = 'student';
const PROVIDER_ROLE = 'tutor';
const CUSTOMER_ROLE = 'student';

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (['tutor', 'provider', 'pro', 'handyman', 'artisan'].includes(value)) {
    return PROVIDER_ROLE;
  }
  if (['student', 'customer', 'client', 'user'].includes(value)) {
    return CUSTOMER_ROLE;
  }
  return value || DEFAULT_ROLE;
}

async function safeQuery(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (['42P01', '42703'].includes(error?.code)) {
      return { rows: [] };
    }
    throw error;
  }
}

export async function getRoles(...profileIds) {
  const ids = profileIds.flat().filter(Boolean).map(String);
  if (ids.length === 0) return {};

  const { rows } = await safeQuery(
    `SELECT id, role
       FROM profiles
      WHERE id = ANY($1::text[])`,
    [ids],
  );

  return rows.reduce((acc, row) => {
    acc[String(row.id)] = { role: normalizeRole(row.role) };
    return acc;
  }, {});
}

export function resolveStudentTutor(
  firstProfileId,
  secondProfileId,
  rolesMap = {},
  preferredTutorProfileId = null,
) {
  const first = String(firstProfileId);
  const second = String(secondProfileId);
  const preferred = preferredTutorProfileId ? String(preferredTutorProfileId) : null;
  const firstRole = normalizeRole(rolesMap[first]?.role);
  const secondRole = normalizeRole(rolesMap[second]?.role);

  if (firstRole === CUSTOMER_ROLE && secondRole === PROVIDER_ROLE) {
    return { studentProfileId: first, tutorProfileId: second };
  }
  if (firstRole === PROVIDER_ROLE && secondRole === CUSTOMER_ROLE) {
    return { studentProfileId: second, tutorProfileId: first };
  }
  if (preferred === first) {
    return { studentProfileId: second, tutorProfileId: first };
  }
  return { studentProfileId: first, tutorProfileId: second };
}

export async function canChatUnlocked(studentProfileId, tutorProfileId) {
  if (!studentProfileId || !tutorProfileId) return false;

  const { rows } = await safeQuery(
    `SELECT 1
       FROM conversations
      WHERE ((sender_id = $1 AND recipient_id = $2)
          OR (sender_id = $2 AND recipient_id = $1))
        AND COALESCE(chat_status, 'unlocked') = 'unlocked'
      LIMIT 1`,
    [studentProfileId, tutorProfileId],
  );

  return rows.length > 0;
}

export async function syncConversationLock(
  conversationId,
  studentProfileId,
  tutorProfileId,
) {
  if (!conversationId) return { unlocked: false };

  const unlocked = await canChatUnlocked(studentProfileId, tutorProfileId);
  await safeQuery(
    `UPDATE conversations
        SET chat_status = $2,
            updated_at = NOW()
      WHERE id = $1`,
    [conversationId, unlocked ? 'unlocked' : 'locked'],
  );

  return { unlocked };
}
