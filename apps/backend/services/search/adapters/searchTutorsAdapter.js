// apps/backend/services/search/adapters/searchTutorsAdapter.js
import pool from '../../../config/db.js';
import { scoreIntentMatch, scoreTextMatch, toStr } from '../searchUtils.js';

const ROLES = ['tutor', 'teacher', 'instructor'];

function getGalleryImage(gallery) {
  if (!gallery) return null;
  if (Array.isArray(gallery)) return gallery[0] || null;
  if (typeof gallery === 'string') return gallery || null;
  if (typeof gallery === 'object') {
    const arr = Array.isArray(gallery.items) ? gallery.items : null;
    if (arr && arr.length) return arr[0];
  }
  return null;
}

export async function searchTutorsAdapter({ q, limit, offset, intent }) {
  const conditions = [
    `role = ANY($1::text[])`,
    `COALESCE(status, 'active') <> 'hidden'`,
  ];
  const values = [ROLES];
  let idx = values.length + 1;

  const subject = toStr(intent?.subject);
  const country = toStr(intent?.country).toUpperCase();
  const gradeBand = toStr(intent?.gradeBand);
  const minRating = Number(intent?.minRating ?? 0) || 0;

  if (country) {
    conditions.push(`country = $${idx++}`);
    values.push(country);
  }

  if (subject) {
    conditions.push(`LOWER(COALESCE(category,'')) LIKE $${idx++}`);
    values.push(`%${subject.toLowerCase()}%`);
  }

  if (gradeBand) {
    conditions.push(`(
      EXISTS (
        SELECT 1
        FROM unnest(COALESCE(grade_bands, ARRAY[]::text[])) gb
        WHERE LOWER(gb) = LOWER($${idx})
           OR LOWER(gb) LIKE LOWER($${idx + 1})
      )
      OR LOWER(COALESCE(school_grade,'')) LIKE LOWER($${idx + 1})
    )`);
    values.push(gradeBand);
    values.push(`%${gradeBand}%`);
    idx += 2;
  }

  if (minRating > 0) {
    conditions.push(`(
      CASE WHEN COALESCE(rating_count,0) > 0
        THEN (rating_total::numeric / rating_count::numeric)
        ELSE 0
      END
    ) >= $${idx++}`);
    values.push(minRating);
  }

  const qStr = toStr(q);
  if (qStr) {
    conditions.push(`(
      LOWER(COALESCE(name,'')) LIKE $${idx}
      OR LOWER(COALESCE(category,'')) LIKE $${idx}
      OR LOWER(COALESCE(description->>'bio','')) LIKE $${idx}
      OR LOWER(COALESCE(array_to_string(languages, ' '), '')) LIKE $${idx}
    )`);
    values.push(`%${qStr.toLowerCase()}%`);
    idx += 1;
  }

  values.push(limit, offset);

  const sql = `
    SELECT
      id,
      name,
      category,
      description,
      languages,
      gallery,
      country,
      rating_total,
      rating_count,
      created_at
    FROM profiles
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT $${idx++}
    OFFSET $${idx++};
  `;

  const { rows } = await pool.query(sql, values);

  return rows.map((row) => {
    const subtitle = row.category || row.description?.bio || '';
    const thumbnailUrl = getGalleryImage(row.gallery);
    const baseScore = scoreTextMatch({ q: qStr, title: row.name });
    const intentScore = scoreIntentMatch({
      intent,
      subject: row.category,
      provider: 'tutor',
    });

    return {
      kind: 'tutor',
      id: String(row.id),
      title: row.name || 'Tutor',
      subtitle: subtitle || undefined,
      subject: row.category || undefined,
      provider: 'tutor',
      thumbnail_url: thumbnailUrl,
      href: `/profile/${encodeURIComponent(String(row.id))}`,
      score: baseScore + intentScore,
      _createdAt: row.created_at ? Date.parse(row.created_at) : 0,
    };
  });
}
