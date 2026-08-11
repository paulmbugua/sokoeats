import pool from '../config/db.js';

const shopTypes = new Set(['restaurants', 'groceries', 'pharmacy', 'gas', 'electronics']);

function normalizeShopType(value) {
  const key = String(value || '').trim().toLowerCase();
  return shopTypes.has(key) ? key : '';
}

function toNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : value;
}

function vendorJson(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.shop_type || 'restaurants',
    cuisine: row.cuisine,
    tagline: row.tagline,
    status: row.status,
    rating: toNumber(row.rating),
    prepMinutes: Number(row.prep_minutes || 0),
    deliveryFee: Number(row.delivery_fee || 0),
    minimumOrder: Number(row.minimum_order || 0),
    address: row.address,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    imageUrl: row.image_url,
    paymentCollectionMode: row.payment_collection_mode,
    paymentProvider: row.payment_provider,
    paymentAccountType: row.payment_account_type,
    paymentShortcode: row.payment_shortcode,
    sections: Array.isArray(row.sections) ? row.sections : [],
  };
}

function menuItemJson(row) {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    vendorSlug: row.vendor_slug,
    sectionId: row.section_id,
    name: row.name,
    description: row.description,
    price: Number(row.price || 0),
    category: row.category,
    popular: row.popular,
    available: row.available,
    imageUrl: row.image_url,
    unitLabel: row.unit_label,
    sortOrder: Number(row.sort_order || 0),
  };
}

export async function listVendors(req, res, next) {
  try {
    const params = [];
    const shopType = normalizeShopType(req.query.category || req.query.shopType);
    let where = "WHERE v.status = 'active'";
    if (shopType) {
      params.push(shopType);
      where += ` AND v.shop_type = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT v.*,
              COALESCE(
                jsonb_agg(
                  jsonb_build_object('id', c.id, 'title', c.title, 'description', c.description, 'sortOrder', c.sort_order)
                  ORDER BY c.sort_order, c.title
                ) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb
              ) AS sections
         FROM sokoeats_vendors v
         LEFT JOIN sokoeats_menu_categories c ON c.vendor_id = v.id
        ${where}
        GROUP BY v.id
        ORDER BY v.rating DESC, v.prep_minutes ASC, v.name ASC`,
      params,
    );
    res.json({ vendors: rows.map(vendorJson) });
  } catch (err) { next(err); }
}

export async function listMenu(req, res, next) {
  try {
    const params = [];
    let where = 'WHERE mi.available = true';
    if (req.query.vendorId) {
      params.push(req.query.vendorId);
      where += ` AND mi.vendor_id::text = $${params.length}`;
    }
    if (req.query.vendorSlug) {
      params.push(req.query.vendorSlug);
      where += ` AND v.slug = $${params.length}`;
    }
    const shopType = normalizeShopType(req.query.category || req.query.shopType);
    if (shopType) {
      params.push(shopType);
      where += ` AND v.shop_type = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT mi.*, v.slug AS vendor_slug
         FROM sokoeats_menu_items mi
         JOIN sokoeats_vendors v ON v.id = mi.vendor_id
        ${where}
        ORDER BY mi.popular DESC, mi.category, mi.sort_order, mi.name`,
      params,
    );
    res.json({ items: rows.map(menuItemJson) });
  } catch (err) { next(err); }
}

export async function getVendorMenu(req, res, next) {
  try {
    const key = req.params.slug;
    const { rows: vendors } = await pool.query('SELECT * FROM sokoeats_vendors WHERE slug = $1 OR id::text = $1 LIMIT 1', [key]);
    const vendor = vendors[0];
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const [sectionsResult, itemsResult] = await Promise.all([
      pool.query('SELECT * FROM sokoeats_menu_categories WHERE vendor_id = $1 ORDER BY sort_order, title', [vendor.id]),
      pool.query('SELECT mi.*, v.slug AS vendor_slug FROM sokoeats_menu_items mi JOIN sokoeats_vendors v ON v.id = mi.vendor_id WHERE mi.vendor_id = $1 AND mi.available = true ORDER BY mi.popular DESC, mi.category, mi.sort_order, mi.name', [vendor.id]),
    ]);
    const items = itemsResult.rows.map(menuItemJson);
    const sections = sectionsResult.rows.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      sortOrder: Number(section.sort_order || 0),
      items: items.filter((item) => String(item.sectionId) === String(section.id) || item.category === section.title),
    }));
    const uncategorized = items.filter((item) => !sections.some((section) => section.items.some((entry) => entry.id === item.id)));
    if (uncategorized.length) sections.push({ id: 'uncategorized', title: 'More from this shop', description: 'Additional products uploaded by the vendor.', sortOrder: 999, items: uncategorized });
    res.json({ vendor: vendorJson({ ...vendor, sections: [] }), sections });
  } catch (err) { next(err); }
}
