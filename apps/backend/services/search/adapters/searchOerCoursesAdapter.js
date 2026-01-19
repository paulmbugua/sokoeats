// apps/backend/services/search/adapters/searchOerCoursesAdapter.js
import pool from '../../../config/db.js';
import { scoreIntentMatch, scoreTextMatch, toArr, toStr, normalizeText } from '../searchUtils.js';

function normalizeContentKinds(contentKinds) {
  const kinds = toArr(contentKinds).map((k) => normalizeText(k));
  return kinds.map((k) => (k === 'text' || k === 'docs' ? 'doc' : k));
}

export async function searchOerCoursesAdapter({ q, limit, offset, intent }) {
  const qStr = toStr(q);
  const like = qStr ? `%${qStr.toLowerCase()}%` : '';
  const subject = toStr(intent?.subject);
  const contentKinds = normalizeContentKinds(intent?.contentKinds);

  const params = [like, subject, contentKinds, limit, offset];

  const sql = `
    WITH base AS (
      SELECT
        c.id,
        c.title,
        c.description,
        c.subject,
        c.created_at,
        c.thumbnail_url,
        NULLIF(LOWER(c.content_kind), '') AS content_kind_col
      FROM catalog_collection c
    ),
    derived AS (
      SELECT
        c.id AS collection_id,
        CASE
          WHEN BOOL_OR(LOWER(tpc.type) = 'video') THEN 'video'
          ELSE 'doc'
        END AS derived_kind
      FROM catalog_collection c
      JOIN catalog_collection_items cci ON cci.collection_id = c.id
      JOIN third_party_catalog tpc      ON tpc.slug = cci.catalog_slug
      GROUP BY c.id
    ),
    rows AS (
      SELECT
        b.id,
        b.title,
        b.description,
        b.subject,
        b.created_at,
        COALESCE(
          CASE
            WHEN b.content_kind_col IN ('text', 'doc', 'docs') THEN 'doc'
            ELSE b.content_kind_col
          END,
          d.derived_kind,
          'doc'
        ) AS content_kind_final,
        b.thumbnail_url
      FROM base b
      LEFT JOIN derived d ON d.collection_id = b.id
    ),
    hero AS (
      SELECT DISTINCT ON (cci.collection_id)
             cci.collection_id,
             tpc.thumbnail_url
        FROM catalog_collection_items cci
        JOIN third_party_catalog tpc
          ON tpc.slug = cci.catalog_slug
       ORDER BY cci.collection_id, tpc.created_at DESC NULLS LAST
    ),
    collections AS (
      SELECT
        r.id,
        NULL::text AS slug,
        r.title,
        r.description,
        r.subject,
        r.created_at,
        r.content_kind_final AS content_kind,
        COALESCE(r.thumbnail_url, h.thumbnail_url) AS thumbnail_url,
        'collection'::text AS source_kind
      FROM rows r
      LEFT JOIN hero h ON h.collection_id = r.id
    ),
    books AS (
      SELECT
        b.id,
        b.slug,
        b.title,
        NULL::text AS description,
        NULL::text AS subject,
        b.created_at,
        'doc'::text AS content_kind,
        b.cover_url AS thumbnail_url,
        'book'::text AS source_kind
      FROM oer_books b
    )
    SELECT id, slug, title, description, subject, content_kind, thumbnail_url, created_at, source_kind
    FROM (
      SELECT * FROM collections
      UNION ALL
      SELECT * FROM books
    ) x
    WHERE (
      $1 = '' OR
      LOWER(COALESCE(title,'')) LIKE $1 OR
      LOWER(COALESCE(description,'')) LIKE $1 OR
      LOWER(COALESCE(subject,'')) LIKE $1
    )
    AND (
      $2 = '' OR LOWER(COALESCE(subject,'')) = LOWER($2)
    )
    AND (
      COALESCE(array_length($3::text[], 1), 0) = 0
      OR LOWER(COALESCE(content_kind,'')) = ANY(
        ARRAY(SELECT LOWER(x) FROM unnest($3::text[]) x)
      )
    )
    ORDER BY created_at DESC NULLS LAST, title ASC
    LIMIT $4 OFFSET $5;
  `;

  const { rows } = await pool.query(sql, params);

  return rows.map((row) => {
    const contentKind = normalizeText(row.content_kind);
    const isVideo = contentKind === 'video';
    const isBook = row.source_kind === 'book';
    const idOrSlug = row.slug || row.id;
    const href = isBook
      ? `/oer/${encodeURIComponent(String(idOrSlug))}`
      : isVideo
      ? `/videos/${encodeURIComponent(String(idOrSlug))}`
      : `/oer/collections/${encodeURIComponent(String(idOrSlug))}`;

    const baseScore = scoreTextMatch({ q: qStr, title: row.title });
    const intentScore = scoreIntentMatch({
      intent,
      subject: row.subject,
      provider: 'oer',
    });

    return {
      kind: 'oer_course',
      id: String(idOrSlug),
      title: row.title,
      subtitle: row.subject || 'OER',
      subject: row.subject || undefined,
      provider: 'oer',
      thumbnail_url: row.thumbnail_url || null,
      href,
      score: baseScore + intentScore + (isVideo ? 4 : 0),
      _createdAt: row.created_at ? Date.parse(row.created_at) : 0,
    };
  });
}
