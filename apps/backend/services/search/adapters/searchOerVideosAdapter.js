// apps/backend/services/search/adapters/searchOerVideosAdapter.js
import pool from '../../../config/db.js';
import {
  buildSubjectSearch,
  scoreIntentMatch,
  scoreTextMatch,
  toArr,
  toStr,
  normalizeText,
} from '../searchUtils.js';

function normalizeContentKinds(contentKinds) {
  const kinds = toArr(contentKinds).map((k) => normalizeText(k));
  return kinds.map((k) => (k === 'text' || k === 'docs' ? 'doc' : k));
}

export async function searchOerVideosAdapter({ q, limit, offset, intent }) {
  const qStr = toStr(q);
  const like = qStr ? `%${qStr.toLowerCase()}%` : '';
  const { likes: subjectLikes } = buildSubjectSearch(intent?.subject);
  const providers = toArr(intent?.providers);
  const contentKinds = normalizeContentKinds(intent?.contentKinds);

  if (contentKinds.length && !contentKinds.includes('video')) {
    return [];
  }

  const args = [like, subjectLikes, providers, limit, offset];
  let idx = 0;
  const pLike = `$${++idx}`;
  const pSubject = `$${++idx}`;
  const pProviders = `$${++idx}`;
  const pLimit = `$${++idx}`;
  const pOffset = `$${++idx}`;

  const sql = `
    SELECT
      tpc.slug,
      tpc.id,
      tpc.title,
      COALESCE(tpc.subject,'') AS subject,
      tpc.provider,
      tpc.thumbnail_url,
      tpc.created_at
    FROM third_party_catalog tpc
    WHERE LOWER(COALESCE(tpc.type,'')) = 'video'
      AND (
        ${pLike} = '' OR
        LOWER(COALESCE(tpc.title,'')) LIKE ${pLike} OR
        LOWER(COALESCE(tpc.subject,'')) LIKE ${pLike}
      )
      AND (
        COALESCE(array_length(${pSubject}::text[], 1), 0) = 0
        OR LOWER(COALESCE(tpc.subject,'')) LIKE ANY(${pSubject}::text[])
        OR LOWER(COALESCE(tpc.title,'')) LIKE ANY(${pSubject}::text[])
      )
      AND (
        COALESCE(array_length(${pProviders}::text[], 1), 0) = 0
        OR LOWER(COALESCE(tpc.provider,'')) = ANY(
          ARRAY(SELECT LOWER(x) FROM unnest(${pProviders}::text[]) x)
        )
      )
    ORDER BY tpc.created_at DESC NULLS LAST, tpc.title ASC
    LIMIT ${pLimit} OFFSET ${pOffset};
  `;

  const { rows } = await pool.query(sql, args);

  return rows.map((row) => {
    const idOrSlug = row.slug || row.id;
    const baseScore = scoreTextMatch({ q: qStr, title: row.title });
    const intentScore = scoreIntentMatch({
      intent,
      subject: row.subject,
      provider: row.provider,
    });

    return {
      kind: 'oer_video',
      id: String(idOrSlug),
      title: row.title,
      subtitle: row.provider || row.subject || 'OER',
      subject: row.subject || undefined,
      provider: row.provider || undefined,
      thumbnail_url: row.thumbnail_url || null,
      href: `/videos/${encodeURIComponent(String(idOrSlug))}`,
      score: baseScore + intentScore + 6,
      _createdAt: row.created_at ? Date.parse(row.created_at) : 0,
    };
  });
}
