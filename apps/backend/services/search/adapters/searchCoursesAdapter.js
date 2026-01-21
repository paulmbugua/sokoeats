import pool from '../../../config/db.js';
import { buildSubjectSearch, scoreIntentMatch, scoreTextMatch, toStr } from '../searchUtils.js';

export async function searchCoursesAdapter({ q, limit, offset, intent }) {
  const qStr = toStr(q);
  const like = qStr ? `%${qStr.toLowerCase()}%` : '';
  const { likes: subjectLikes } = buildSubjectSearch(intent?.subject);

  const args = [like, subjectLikes, limit, offset];
  const sql = `
    SELECT
      c.id,
      c.title,
      c.description,
      c.subject,
      c.thumbnail_url,
      c.created_at
    FROM courses c
    WHERE NOT COALESCE(c.is_ai_generated, FALSE)
      AND COALESCE(c.source_kind,'') NOT IN ('oer','wrapped_oer')
      AND EXISTS (SELECT 1 FROM users u WHERE u.id = c.tutor_id)
      AND (
        $1 = '' OR
        LOWER(COALESCE(c.title,'')) LIKE $1 OR
        LOWER(COALESCE(c.description,'')) LIKE $1 OR
        LOWER(COALESCE(c.subject,'')) LIKE $1
      )
      AND (
        COALESCE(array_length($2::text[], 1), 0) = 0
        OR LOWER(COALESCE(c.subject,'')) LIKE ANY($2::text[])
      )
    ORDER BY c.created_at DESC NULLS LAST, c.title ASC
    LIMIT $3 OFFSET $4;
  `;

  const { rows } = await pool.query(sql, args);

  return rows.map((row) => {
    const baseScore = scoreTextMatch({ q: qStr, title: row.title });
    const intentScore = scoreIntentMatch({
      intent,
      subject: row.subject,
      provider: 'course',
    });

    return {
      kind: 'course',
      id: String(row.id),
      title: row.title,
      subtitle: row.subject || 'Course',
      subject: row.subject || undefined,
      provider: 'course',
      thumbnail_url: row.thumbnail_url || null,
      href: `/courses/${encodeURIComponent(String(row.id))}`,
      score: baseScore + intentScore + 5,
      _createdAt: row.created_at ? Date.parse(row.created_at) : 0,
    };
  });
}
