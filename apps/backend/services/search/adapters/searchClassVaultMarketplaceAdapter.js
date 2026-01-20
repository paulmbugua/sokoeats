import pool from '../../../config/db.js';
import { scoreIntentMatch, scoreTextMatch, toStr } from '../searchUtils.js';

export async function searchClassVaultMarketplaceAdapter({ q, limit, offset, intent }) {
  const qStr = toStr(q);
  const like = qStr ? `%${qStr.toLowerCase()}%` : '';
  const subject = toStr(intent?.subject);

  const args = [like, subject, limit, offset];
  const sql = `
    SELECT
      id,
      tutor_id,
      title,
      description,
      subject,
      grade_level,
      thumbnail_url,
      created_at
    FROM recorded_videos
    WHERE (
      $1 = '' OR
      LOWER(COALESCE(title,'')) LIKE $1 OR
      LOWER(COALESCE(description,'')) LIKE $1 OR
      LOWER(COALESCE(subject,'')) LIKE $1 OR
      LOWER(COALESCE(grade_level,'')) LIKE $1
    )
    AND (
      $2 = '' OR LOWER(COALESCE(subject,'')) = LOWER($2)
    )
    ORDER BY created_at DESC NULLS LAST, title ASC
    LIMIT $3 OFFSET $4;
  `;

  const { rows } = await pool.query(sql, args);

  return rows.map((row) => {
    const baseScore = scoreTextMatch({ q: qStr, title: row.title });
    const intentScore = scoreIntentMatch({
      intent,
      subject: row.subject,
      provider: 'classvault',
    });

    return {
      kind: 'classvault_market',
      id: String(row.id),
      title: row.title,
      subtitle: row.subject || row.grade_level || 'ClassVault',
      subject: row.subject || undefined,
      provider: 'classvault',
      thumbnail_url: row.thumbnail_url || null,
      href: `/class-vault/${encodeURIComponent(String(row.id))}`,
      score: baseScore + intentScore + 4,
      _createdAt: row.created_at ? Date.parse(row.created_at) : 0,
    };
  });
}
