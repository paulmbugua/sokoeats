// apps/backend/services/search/adapters/searchPurchasedVideosAdapter.js
import pool from '../../../config/db.js';
import {
  buildSubjectSearch,
  scoreIntentMatch,
  scoreTextMatch,
  toStr,
  normalizeText,
} from '../searchUtils.js';

export async function searchPurchasedVideosAdapter({ q, limit, offset, intent, user }) {
  if (!user || !user.id) return [];

  const qStr = toStr(q);
  const like = qStr ? `%${qStr.toLowerCase()}%` : '';
  const { likes: subjectLikes } = buildSubjectSearch(intent?.subject);
  const contentKinds = Array.isArray(intent?.contentKinds)
    ? intent.contentKinds
    : [];

  if (contentKinds.length) {
    const normalized = contentKinds.map((k) => normalizeText(k));
    if (!normalized.includes('video')) return [];
  }

  const params = [user.id, like, subjectLikes, limit, offset];

  const sql = `
    SELECT
      rv.id,
      rv.title,
      rv.subject,
      rv.thumbnail_url,
      rv.created_at,
      cp.created_at AS purchased_at
    FROM classvault_purchases cp
    JOIN recorded_videos rv ON rv.id = cp.class_id
    WHERE cp.student_id = $1
      AND (
        $2 = '' OR
        LOWER(COALESCE(rv.title,'')) LIKE $2 OR
        LOWER(COALESCE(rv.subject,'')) LIKE $2 OR
        LOWER(COALESCE(rv.description,'')) LIKE $2
      )
      AND (
        COALESCE(array_length($3::text[], 1), 0) = 0
        OR LOWER(COALESCE(rv.subject,'')) LIKE ANY($3::text[])
        OR LOWER(COALESCE(rv.title,'')) LIKE ANY($3::text[])
      )
    ORDER BY cp.created_at DESC
    LIMIT $4 OFFSET $5;
  `;

  const { rows } = await pool.query(sql, params);

  return rows.map((row) => {
    const baseScore = scoreTextMatch({ q: qStr, title: row.title });
    const intentScore = scoreIntentMatch({
      intent,
      subject: row.subject,
      provider: 'classvault',
    });

    return {
      kind: 'purchased_video',
      id: String(row.id),
      title: row.title,
      subtitle: row.subject || 'Purchased',
      subject: row.subject || undefined,
      provider: 'classvault',
      thumbnail_url: row.thumbnail_url || null,
      href: `/class-vault/${encodeURIComponent(String(row.id))}`,
      score: baseScore + intentScore + 40,
      _createdAt: row.purchased_at ? Date.parse(row.purchased_at) : 0,
    };
  });
}
