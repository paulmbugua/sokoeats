import pool from '../config/db.js';

export async function getUserIdForProfileId(profileId) {
  if (!profileId) return null;
  const r = await pool.query('SELECT user_id FROM profiles WHERE id = $1', [
    profileId,
  ]);
  return r.rows[0]?.user_id ?? null;
}

export async function getProfileIdForUserId(userId) {
  if (!userId) return null;
  const r = await pool.query('SELECT id FROM profiles WHERE user_id = $1', [
    userId,
  ]);
  return r.rows[0]?.id ?? null;
}

export async function getRoles(profileIdA, profileIdB) {
  const ids = [String(profileIdA), String(profileIdB)];
  const r = await pool.query(
    `SELECT id, role, user_id FROM profiles WHERE id = ANY($1::text[])`,
    [ids],
  );
  return r.rows.reduce((acc, row) => {
    acc[String(row.id)] = { role: row.role, user_id: row.user_id };
    return acc;
  }, {});
}

export function resolveStudentTutor(
  profileIdA,
  profileIdB,
  rolesMap,
  fallbackTutorProfileId,
) {
  const aRole = rolesMap?.[String(profileIdA)]?.role ?? null;
  const bRole = rolesMap?.[String(profileIdB)]?.role ?? null;

  if (aRole === 'student' && bRole === 'tutor') {
    return { studentProfileId: profileIdA, tutorProfileId: profileIdB };
  }
  if (aRole === 'tutor' && bRole === 'student') {
    return { studentProfileId: profileIdB, tutorProfileId: profileIdA };
  }

  if (fallbackTutorProfileId) {
    return {
      studentProfileId:
        String(fallbackTutorProfileId) === String(profileIdA)
          ? profileIdB
          : profileIdA,
      tutorProfileId: fallbackTutorProfileId,
    };
  }

  return { studentProfileId: profileIdA, tutorProfileId: profileIdB };
}

export async function canChatUnlocked(studentProfileId, tutorProfileId) {
  const studentUserId = await getUserIdForProfileId(studentProfileId);
  const tutorUserId = await getUserIdForProfileId(tutorProfileId);
  if (!studentUserId || !tutorUserId) return false;

  const okStatuses = [
    'upcoming',
    'accepted',
    'completed',
    'completed_pending',
  ];

  const q = await pool.query(
    `SELECT 1
       FROM tutor_sessions
      WHERE student_id = $1
        AND tutor_id = $2
        AND status = ANY($3::text[])
      LIMIT 1`,
    [studentUserId, tutorUserId, okStatuses],
  );

  return q.rows.length > 0;
}

export async function syncConversationLock(
  conversationId,
  studentProfileId,
  tutorProfileId,
) {
  const unlocked = await canChatUnlocked(studentProfileId, tutorProfileId);
  if (unlocked) {
    await pool.query(
      `UPDATE conversations SET chat_status='unlocked', updated_at=NOW()
        WHERE id=$1 AND chat_status <> 'unlocked'`,
      [conversationId],
    );
  }
  const row = await pool.query(
    `SELECT chat_status, prebooking_used FROM conversations WHERE id=$1`,
    [conversationId],
  );
  return {
    chatStatus: row.rows[0]?.chat_status ?? 'locked',
    prebookingUsed: !!row.rows[0]?.prebooking_used,
    unlocked,
  };
}
