import pool from '../../../config/db.js';
import {
  buildSubjectSearch,
  normalizeText,
  scoreIntentMatch,
  scoreTextMatch,
  toArr,
  toStr,
} from '../searchUtils.js';

export async function searchClassVaultMarketplaceAdapter({ q, limit, offset, intent }) {
  const qStr = toStr(q);
  const { likes: subjectLikes } = buildSubjectSearch(intent?.subject);
  const minRating = Number(intent?.minRating ?? 0) || 0;
  const maxPrice = Number(intent?.maxPrice ?? 0) || 0;
  const scope = normalizeText(intent?.scope);
  const contentKinds = toArr(intent?.contentKinds)
    .map((k) => normalizeText(k))
    .map((k) => (k === 'text' || k === 'docs' ? 'doc' : k));

  if (contentKinds.length) {
    const wantsVideo = contentKinds.includes('video');
    const wantsDoc = contentKinds.includes('doc');
    if (!wantsVideo && !wantsDoc) return [];
  }

  const conditions = [];
  const values = [];
  let idx = 1;

  if (qStr) {
    conditions.push(`(
      LOWER(COALESCE(title,'')) LIKE $${idx}
      OR LOWER(COALESCE(description,'')) LIKE $${idx}
      OR LOWER(COALESCE(subject,'')) LIKE $${idx}
      OR LOWER(COALESCE(grade_level,'')) LIKE $${idx}
    )`);
    values.push(`%${qStr.toLowerCase()}%`);
    idx += 1;
  }

  if (subjectLikes.length) {
    conditions.push(`LOWER(COALESCE(subject,'')) LIKE ANY($${idx}::text[])`);
    values.push(subjectLikes);
    idx += 1;
  }

  if (scope === 'free') {
    conditions.push(`COALESCE(price, 0) <= 0`);
  }

  if (maxPrice > 0) {
    conditions.push(`COALESCE(price, 0) <= $${idx}`);
    values.push(maxPrice);
    idx += 1;
  }

  if (minRating > 0) {
    conditions.push(`COALESCE(avg_rating, 0) >= $${idx}`);
    values.push(minRating);
    idx += 1;
  }

  if (contentKinds.length) {
    const wantsVideo = contentKinds.includes('video');
    const wantsDoc = contentKinds.includes('doc');
    if (wantsVideo && !wantsDoc) {
      conditions.push(`COALESCE(video_url,'') <> ''`);
    } else if (wantsDoc && !wantsVideo) {
      conditions.push(`COALESCE(pdf_url,'') <> ''`);
    }
  }

  values.push(limit, offset);

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
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY created_at DESC NULLS LAST, title ASC
    LIMIT $${idx++} OFFSET $${idx++};
  `;

  const { rows } = await pool.query(sql, values);

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
