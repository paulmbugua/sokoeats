// apps/backend/controllers/oerController.js
import pool from '../config/db.js';

function pickType(s = '') {
  const t = String(s).toLowerCase();
  return t === 'video' || t === 'text' ? t : '';
}

function isUuid(s = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

export async function listCatalog(req, res) {
  try {
    const type = pickType(req.query.type);
    const subject = (req.query.subject || '').trim();
    const provider = (req.query.provider || '').trim();
    const q = String(req.query.q || '').trim().toLowerCase();
    const like = q ? `%${q}%` : '';

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const where = [];
    const args = [];

    if (type) {
      args.push(type);
      where.push(`type = $${args.length}`);
    }
    if (subject) {
      args.push(subject);
      where.push(`subject = $${args.length}`);
    }
    if (provider) {
      args.push(provider);
      where.push(`provider = $${args.length}`);
    }
    if (like) {
      args.push(like);
      const pLike = `$${args.length}`;
      where.push(
        `(LOWER(COALESCE(title,'')) LIKE ${pLike} ` +
          `OR LOWER(COALESCE(subject,'')) LIKE ${pLike} ` +
          `OR LOWER(COALESCE(provider,'')) LIKE ${pLike})`,
      );
    }

    const sql = `
      SELECT slug, title, type, provider, subject, grade_level,
             thumbnail_url, source_url, embed_url,
             commercial_allowed, license, license_url, attribution_html
        FROM third_party_catalog
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC NULLS LAST
       LIMIT $${args.push(limit)} OFFSET $${args.push(offset)}
    `;
    const { rows } = await pool.query(sql, args);
    res.json(rows);
  } catch (e) {
    console.error('[oer] listCatalog error:', e);
    res.status(500).json({ error: 'Failed to load catalog' });
  }
}

export async function listOerVideos(req, res) {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const like = q ? `%${q}%` : '';
    const provider = (req.query.provider || '').trim();
    const subject = (req.query.subject || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const args = [limit, offset];
    const where = [`LOWER(COALESCE(type,'')) = 'video'`];
    if (provider) {
      args.push(provider);
      where.push(`provider = $${args.length}`);
    }
    if (subject) {
      args.push(subject);
      where.push(`subject = $${args.length}`);
    }
    if (like) {
      args.push(like);
      const pLike = `$${args.length}`;
      where.push(
        `(LOWER(COALESCE(title,'')) LIKE ${pLike} ` +
          `OR LOWER(COALESCE(subject,'')) LIKE ${pLike} ` +
          `OR LOWER(COALESCE(provider,'')) LIKE ${pLike})`,
      );
    }

    const sql = `
      SELECT
        slug, title, type, provider, subject, grade_level,
        thumbnail_url, source_url, embed_url, created_at,
        COUNT(*) OVER()::int AS total_rows
      FROM third_party_catalog
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC NULLS LAST
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await pool.query(sql, args);
    const total = rows[0]?.total_rows ?? 0;
    const items = rows.map(({ total_rows, ...rest }) => rest);
    return res.json({ items, total, limit, offset });
  } catch (e) {
    console.error('[oer] listOerVideos error:', e);
    return res.status(500).json({ error: 'Failed to load OER videos' });
  }
}

export async function wrapCatalogItem(req, res) {
  try {
    const userId = req.user?.id ?? null; // ok if null
    const { slug } = req.body || {};
    if (!slug) return res.status(400).json({ error: 'slug required' });

    // 1) lookup catalog
    const { rows: cat } = await pool.query(
      `SELECT * FROM third_party_catalog WHERE slug = $1`,
      [slug],
    );
    const item = cat[0];
    if (!item) return res.status(404).json({ error: 'catalog item not found' });

    // 2) reuse if already wrapped (single item wrap)
    const reuse = await pool.query(
      `SELECT course_id FROM oer_wrapped_course WHERE catalog_slug = $1 LIMIT 1`,
      [item.slug],
    );
    if (reuse.rowCount) {
      return res.json({
        courseId: reuse.rows[0].course_id,
        firstLessonWeek: 1,
      });
    }

    // 3) create simple course
    const syllabus = [
      {
        week: 1,
        topic: item.title,
        assignment: '',
        videoUrl: item.embed_url || '',
        notesUrl: item.source_url,
      },
    ];

    const desc =
      `${String(item.provider || '').toUpperCase()} • Wrapped OER\n` +
      `Source: ${item.source_url || ''}`;

    const createSql = `
      INSERT INTO courses (id, tutor_id, title, description, level, duration, price, syllabus, prerequisites)
      VALUES (gen_random_uuid(), $1, $2, $3, 'All Levels', 'Self-paced', 0, $4, '')
      RETURNING id
    `;
    const { rows: cr } = await pool.query(createSql, [
      userId,
      item.title,
      desc,
      JSON.stringify(syllabus),
    ]);
    const courseId = cr[0].id;

    // 4) link wrap (idempotent on catalog_slug)
    await pool.query(
      `INSERT INTO oer_wrapped_course
         (catalog_slug, catalog_provider, course_id, commercial_allowed, license, license_url, attribution_html)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (catalog_slug) DO NOTHING`,
      [
        item.slug,
        item.provider,
        courseId,
        !!item.commercial_allowed,
        item.license || null,
        item.license_url || null,
        item.attribution_html || null,
      ],
    );

    res.json({ courseId, firstLessonWeek: 1 });
  } catch (e) {
    console.error('[oer] wrapCatalogItem error:', e);
    res.status(500).json({ error: 'Failed to wrap catalog item' });
  }
}

/**
 * Wrap a whole collection into a single *course* so that
 * certificate/transcript are issued once per collection.
 *
 * Expects a table:
 *   oer_wrapped_collection (
 *     collection_id uuid primary key,
 *     course_id uuid not null,
 *     collection_title text,
 *     items_count int,
 *     created_at timestamptz default now()
 *   )
 */
export async function wrapCollection(req, res) {
  try {
    const userId = req.user?.id ?? null;
    const { idOrTitle } = req.body || {};
    if (!idOrTitle)
      return res.status(400).json({ error: 'idOrTitle required' });

    // 0) Find the collection row first (to get its UUID + title)
    const collSql = isUuid(idOrTitle)
      ? `SELECT id, title, description, subject FROM catalog_collection WHERE id = $1`
      : `SELECT id, title, description, subject FROM catalog_collection WHERE LOWER(title) = LOWER($1)`;
    const { rows: collRows } = await pool.query(collSql, [idOrTitle]);
    const collection = collRows[0];
    if (!collection)
      return res.status(404).json({ error: 'Collection not found' });

    const collectionId = collection.id;

    // 1) Reuse if we already wrapped this collection (one course per collection)
    const reuse = await pool.query(
      `SELECT course_id FROM oer_wrapped_collection WHERE collection_id = $1 LIMIT 1`,
      [collectionId],
    );
    if (reuse.rowCount) {
      return res.json({
        courseId: reuse.rows[0].course_id,
        firstLessonWeek: 1,
      });
    }

    // 2) Load all items in collection (ordered)
    const { rows: items } = await pool.query(
      `
      SELECT tpc.title, tpc.embed_url, tpc.source_url, tpc.type
        FROM catalog_collection_items cci
        JOIN third_party_catalog tpc ON tpc.slug = cci.catalog_slug
       WHERE cci.collection_id = $1
       ORDER BY tpc.created_at ASC NULLS LAST, tpc.title
      `,
      [collectionId],
    );
    if (!items.length)
      return res.status(404).json({ error: 'Empty collection' });

    // 3) Build syllabus: one week per item, video/text supported
    const syllabus = items.map((it, i) => {
      const isVideo = String(it.type || '').toLowerCase() === 'video';
      return {
        week: i + 1,
        topic: it.title,
        videoUrl: isVideo ? it.embed_url || it.source_url || '' : '',
        notesUrl: it.source_url || '',
      };
    });

    const title = `Collection: ${collection.title}`;
    const desc = [
      'Wrapped OER Collection',
      collection.subject ? `Subject: ${collection.subject}` : '',
      collection.description ? `\n\n${collection.description}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // 4) Create course
    const createSql = `
      INSERT INTO courses (id, tutor_id, title, description, level, duration, price, syllabus, prerequisites)
      VALUES (gen_random_uuid(), $1, $2, $3, 'All Levels', 'Self-paced', 0, $4, '')
      RETURNING id
    `;
    const { rows: cr } = await pool.query(createSql, [
      userId,
      title,
      desc,
      JSON.stringify(syllabus),
    ]);
    const courseId = cr[0].id;

    // 5) Link mapping (idempotent) so future calls reuse the same course
    await pool.query(
      `
      INSERT INTO oer_wrapped_collection (collection_id, course_id, collection_title, items_count)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (collection_id) DO NOTHING
      `,
      [collectionId, courseId, collection.title, items.length],
    );

    res.json({ courseId, firstLessonWeek: 1 });
  } catch (e) {
    console.error('[oer] wrapCollection error:', e);
    res.status(500).json({ error: 'Failed to wrap collection' });
  }
}

/**
 * Returns OER meta for a given course.
 * Works for both single-item wraps (oer_wrapped_course) and collection wraps (oer_wrapped_collection).
 */
export async function getOerMeta(req, res) {
  try {
    // accept /oer/meta/:id or /oer/meta/:courseId
    const courseId = req.params.courseId ?? req.params.id;

    // small helper to see if a table exists
    const tableExists = async (name) => {
      const q = `SELECT to_regclass($1) AS reg`;
      const r = await pool.query(q, [
        name.includes('.') ? name : `public.${name}`,
      ]);
      return !!r.rows[0]?.reg;
    };

    // 1) single item
    const { rows: itemRows } = await pool.query(
      `SELECT catalog_slug, catalog_provider, course_id,
              commercial_allowed, license, license_url, attribution_html
         FROM oer_wrapped_course
        WHERE course_id = $1
        LIMIT 1`,
      [courseId],
    );
    if (itemRows.length) return res.json(itemRows[0]);

    // 2) collection
    let collRows = [];
    if (await tableExists('oer_wrapped_collection')) {
      const r = await pool.query(
        `SELECT oc.collection_id, oc.course_id, oc.collection_title, oc.items_count,
                c.subject
           FROM oer_wrapped_collection oc
           LEFT JOIN catalog_collection c ON c.id = oc.collection_id
          WHERE oc.course_id = $1          LIMIT 1`,
        [courseId],
      );
      collRows = r.rows || [];
    }
    if (collRows.length) {
      const row = collRows[0];
      return res.json({
        collection_id: row.collection_id,
        course_id: row.course_id,
        collection_title: row.collection_title,
        items_count: row.items_count,
        subject: row.subject || null,
        catalog_slug: null,
        catalog_provider: 'collection',
        commercial_allowed: null,
        license: null,
        license_url: null,
        attribution_html: null,
      });
    }

    // 3) book (NEW)
    let bookRows = [];
    if (await tableExists('oer_wrapped_book')) {
      const r = await pool.query(
        `SELECT b.id AS book_id, b.slug, b.provider, b.title, b.license, b.license_url
           FROM oer_wrapped_book wb
           JOIN oer_books b ON b.id = wb.book_id
          WHERE wb.course_id = $1
          LIMIT 1`,
        [courseId],
      );
      bookRows = r.rows || [];
    }
    if (bookRows.length) {
      const b = bookRows[0];
      return res.json({
        catalog_slug: b.slug || null,
        catalog_provider: b.provider || 'book',
        course_id: courseId,
        commercial_allowed: true, // CC BY 4.0 allows commercial use
        license: b.license || 'CC BY 4.0',
        license_url:
          b.license_url || 'https://creativecommons.org/licenses/by/4.0/',
        attribution_html: `<p>${(b.provider || 'OpenStax')
          .toString()
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')} content used under Creative Commons.</p>`,
      });
    }

    return res.status(404).json(null);
  } catch (e) {
    console.error('[oer] getOerMeta error:', e);
    res.status(500).json({ error: 'Failed to load OER meta' });
  }
}

export async function wrapBook(req, res) {
  try {
    const userId = req.user?.id ?? null; // ok if null
    const { idOrSlug } = req.body || {};
    if (!idOrSlug) return res.status(400).json({ error: 'idOrSlug required' });

    // 0) lookup the book
    const bookSql = isUuid(idOrSlug)
      ? `SELECT * FROM oer_books WHERE id = $1`
      : `SELECT * FROM oer_books WHERE slug = $1 OR LOWER(title) = LOWER($1)`;
    const { rows: bRows } = await pool.query(bookSql, [idOrSlug]);
    const b = bRows[0];
    if (!b) return res.status(404).json({ error: 'book not found' });

    // 1) ensure mapping table (idempotent)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oer_wrapped_book (
        book_id   uuid PRIMARY KEY,
        course_id uuid NOT NULL,
        created_at timestamptz DEFAULT now()
      )
    `);

    // 2) reuse if already wrapped
    const reuse = await pool.query(
      `SELECT course_id FROM oer_wrapped_book WHERE book_id = $1 LIMIT 1`,
      [b.id],
    );
    if (reuse.rowCount) {
      return res.json({
        courseId: reuse.rows[0].course_id,
        firstLessonWeek: 1,
      });
    }

    // 3) create a super-simple course (1-week reading)
    const syllabus = [
      {
        week: 1,
        topic: b.title,
        videoUrl: '',
        notesUrl: b.pdf_url,
        notesUrls: [b.pdf_url],
      },
    ];

    const desc =
      `${String(b.provider || 'OER').toUpperCase()} • Book Course\n` +
      `Source: ${b.pdf_url || ''}`;

    const createSql = `
      INSERT INTO courses
        (id, tutor_id, title, description, level, duration, price, price_label, provider, syllabus, prerequisites)
      VALUES
        (gen_random_uuid(), $1, $2, $3, 'All Levels', 'Self-paced', 0, 'Free', 'openstax', $4, '')
      RETURNING id
    `;
    const { rows: cr } = await pool.query(createSql, [
      userId,
      b.title,
      desc,
      JSON.stringify(syllabus),
    ]);
    const courseId = cr[0].id;

    // 4) link mapping
    await pool.query(
      `INSERT INTO oer_wrapped_book (book_id, course_id)
       VALUES ($1,$2)
       ON CONFLICT (book_id) DO NOTHING`,
      [b.id, courseId],
    );

    res.json({ courseId, firstLessonWeek: 1 });
  } catch (e) {
    console.error('[oer] wrapBook error:', e);
    res.status(500).json({ error: 'Failed to wrap book' });
  }
}
