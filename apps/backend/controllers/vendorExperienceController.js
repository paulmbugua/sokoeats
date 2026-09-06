import pool from '../config/db.js';
import { getScreenPayload, saveScreenPayload } from '../models/screenPayloadModel.js';
import { createImageUpload } from '../services/r2Images.js';
import { itemPricing } from '../services/commercePricing.js';

function menuItemJson(row) {
  const pricing = itemPricing(row, row);
  return {
    id: row.id,
    vendorId: row.vendor_id,
    sectionId: row.section_id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    customerPrice: pricing.customerPrice,
    commissionAmount: pricing.commissionAmount,
    commissionRateBps: pricing.commissionBps,
    taxCategory: pricing.taxCategory,
    category: row.category,
    popular: Boolean(row.popular),
    available: Boolean(row.available),
    imageUrl: row.image_url,
    unitLabel: row.unit_label,
    sortOrder: Number(row.sort_order || 0),
  };
}

async function ownedVendor(userId) {
  const { rows } = await pool.query('SELECT * FROM sokoeats_vendors WHERE owner_user_id = $1 LIMIT 1', [userId]);
  if (!rows[0]) throw Object.assign(new Error('Complete vendor onboarding before managing a catalogue'), { status: 409 });
  return rows[0];
}

async function loadVendorMenu(vendorSlug = 'nairobi-grill-house') {
  const { rows: vendors } = await pool.query('SELECT * FROM sokoeats_vendors WHERE slug = $1 OR id::text = $1 LIMIT 1', [vendorSlug]);
  const vendor = vendors[0];
  if (!vendor) return null;
  const [sectionsResult, itemsResult] = await Promise.all([
    pool.query('SELECT * FROM sokoeats_menu_categories WHERE vendor_id = $1 ORDER BY sort_order, title', [vendor.id]),
    pool.query('SELECT * FROM sokoeats_menu_items WHERE vendor_id = $1 ORDER BY available DESC, popular DESC, category, sort_order, name', [vendor.id]),
  ]);
  const sections = sectionsResult.rows.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    sortOrder: Number(section.sort_order || 0),
    items: itemsResult.rows.filter((item) => String(item.section_id) === String(section.id) || item.category === section.title).map(item => menuItemJson({ ...item, commission_rate_bps: vendor.commission_rate_bps, vat_registered: vendor.vat_registered })),
  }));
  return { vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug, shopType: vendor.shop_type, tagline: vendor.tagline, address: vendor.address, contactPhone: vendor.contact_phone, imageUrl: vendor.image_url, acceptingOrders: vendor.accepting_orders, rating: Number(vendor.rating || 0), ratingCount: Number(vendor.rating_count || 0), prepMinutes: Number(vendor.prep_minutes || 0), minimumOrder: Number(vendor.minimum_order || 0), openingHours: vendor.profile?.openingHours || {} }, sections, items: sections.flatMap((section) => section.items) };
}

const metricJson = (row, prefix) => ({
  sales: Number(row[`${prefix}_sales`] || 0),
  customerRevenue: Number(row[`${prefix}_revenue`] || 0),
  orders: Number(row[`${prefix}_orders`] || 0),
  delivered: Number(row[`${prefix}_delivered`] || 0),
});

export async function vendorOperations(req, res, next) {
  try {
    const vendor = await ownedVendor(req.auth.sub);
    const [metricsResult, trendResult, statusResult, ordersResult, ratingsResult, breakdownResult, catalogueResult] = await Promise.all([
      pool.query(`SELECT
        COALESCE(SUM(subtotal) FILTER (WHERE payment_status='paid' AND status<>'cancelled' AND created_at>=date_trunc('day',NOW())),0)::int today_sales,
        COALESCE(SUM(total) FILTER (WHERE payment_status='paid' AND status<>'cancelled' AND created_at>=date_trunc('day',NOW())),0)::int today_revenue,
        COUNT(*) FILTER (WHERE payment_status='paid' AND status<>'cancelled' AND created_at>=date_trunc('day',NOW()))::int today_orders,
        COUNT(*) FILTER (WHERE status='delivered' AND created_at>=date_trunc('day',NOW()))::int today_delivered,
        COALESCE(SUM(subtotal) FILTER (WHERE payment_status='paid' AND status<>'cancelled' AND created_at>=date_trunc('week',NOW())),0)::int week_sales,
        COALESCE(SUM(total) FILTER (WHERE payment_status='paid' AND status<>'cancelled' AND created_at>=date_trunc('week',NOW())),0)::int week_revenue,
        COUNT(*) FILTER (WHERE payment_status='paid' AND status<>'cancelled' AND created_at>=date_trunc('week',NOW()))::int week_orders,
        COUNT(*) FILTER (WHERE status='delivered' AND created_at>=date_trunc('week',NOW()))::int week_delivered,
        COALESCE(SUM(subtotal) FILTER (WHERE payment_status='paid' AND status<>'cancelled' AND created_at>=date_trunc('month',NOW())),0)::int month_sales,
        COALESCE(SUM(total) FILTER (WHERE payment_status='paid' AND status<>'cancelled' AND created_at>=date_trunc('month',NOW())),0)::int month_revenue,
        COUNT(*) FILTER (WHERE payment_status='paid' AND status<>'cancelled' AND created_at>=date_trunc('month',NOW()))::int month_orders,
        COUNT(*) FILTER (WHERE status='delivered' AND created_at>=date_trunc('month',NOW()))::int month_delivered
        FROM sokoeats_orders WHERE vendor_id=$1`, [vendor.id]),
      pool.query(`WITH days AS (SELECT generate_series(current_date-INTERVAL '6 days',current_date,INTERVAL '1 day')::date AS sales_date)
        SELECT d.sales_date AS day, COALESCE(SUM(o.subtotal) FILTER (WHERE o.payment_status='paid' AND o.status<>'cancelled'),0)::int sales,
        COUNT(o.id) FILTER (WHERE o.payment_status='paid' AND o.status<>'cancelled')::int orders
        FROM days d LEFT JOIN sokoeats_orders o ON o.vendor_id=$1 AND o.created_at>=d.sales_date AND o.created_at<d.sales_date+1
        GROUP BY d.sales_date ORDER BY d.sales_date`, [vendor.id]),
      pool.query(`SELECT status,COUNT(*)::int count FROM sokoeats_orders WHERE vendor_id=$1 AND created_at>=NOW()-INTERVAL '30 days' GROUP BY status`, [vendor.id]),
      pool.query(`SELECT o.*,COALESCE(u.name,'Customer') customer_name,
        COALESCE(json_agg(json_build_object('name',oi.name,'quantity',oi.quantity,'lineTotal',oi.line_total)) FILTER (WHERE oi.id IS NOT NULL),'[]') items
        FROM sokoeats_orders o LEFT JOIN sokoeats_users u ON u.id=o.customer_user_id LEFT JOIN sokoeats_order_items oi ON oi.order_id=o.id
        WHERE o.vendor_id=$1 GROUP BY o.id,u.name ORDER BY o.created_at DESC LIMIT 40`, [vendor.id]),
      pool.query(`SELECT r.id,r.rating,r.comment,r.created_at,COALESCE(u.name,'SokoEats customer') customer_name,o.code order_code
        FROM sokoeats_vendor_reviews r LEFT JOIN sokoeats_users u ON u.id=r.customer_user_id JOIN sokoeats_orders o ON o.id=r.order_id
        WHERE r.vendor_id=$1 ORDER BY r.created_at DESC LIMIT 20`, [vendor.id]),
      pool.query(`SELECT stars,COUNT(r.id)::int count FROM generate_series(1,5) stars LEFT JOIN sokoeats_vendor_reviews r ON r.vendor_id=$1 AND r.rating=stars GROUP BY stars ORDER BY stars DESC`, [vendor.id]),
      pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER (WHERE available)::int available,COUNT(*) FILTER (WHERE NOT available)::int unavailable FROM sokoeats_menu_items WHERE vendor_id=$1`, [vendor.id]),
    ]);
    const metrics = metricsResult.rows[0];
    res.json({ operations: {
      vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug, shopType: vendor.shop_type, tagline: vendor.tagline, address: vendor.address, contactPhone: vendor.contact_phone, imageUrl: vendor.image_url, acceptingOrders: vendor.accepting_orders, rating: Number(vendor.rating || 0), ratingCount: Number(vendor.rating_count || 0), prepMinutes: Number(vendor.prep_minutes), minimumOrder: Number(vendor.minimum_order), openingHours: vendor.profile?.openingHours || {} },
      metrics: { today: metricJson(metrics,'today'), week: metricJson(metrics,'week'), month: metricJson(metrics,'month') },
      trend: trendResult.rows.map(row => ({ date: row.day, sales: Number(row.sales), orders: Number(row.orders) })),
      orderStatuses: Object.fromEntries(statusResult.rows.map(row => [row.status, Number(row.count)])),
      orders: ordersResult.rows.map(row => ({ id: row.id, code: row.code, status: row.status, paymentStatus: row.payment_status, customerName: row.customer_name, recipientName: row.recipient_name, deliveryAddress: row.delivery_address, subtotal: Number(row.subtotal), total: Number(row.total), createdAt: row.created_at, updatedAt: row.updated_at, items: row.items })),
      ratings: { average: Number(vendor.rating || 0), count: Number(vendor.rating_count || 0), breakdown: breakdownResult.rows.map(row => ({ stars: Number(row.stars), count: Number(row.count) })), recent: ratingsResult.rows.map(row => ({ id: row.id, rating: Number(row.rating), comment: row.comment, customerName: row.customer_name, orderCode: row.order_code, createdAt: row.created_at })) },
      catalogue: catalogueResult.rows[0],
    } });
  } catch (err) { next(err); }
}

export async function updateVendorStoreProfile(req, res, next) {
  try {
    const vendor = await ownedVendor(req.auth.sub);
    const profile = { ...(vendor.profile || {}), ...(req.body.openingHours ? { openingHours: req.body.openingHours } : {}) };
    const { rows } = await pool.query(`UPDATE sokoeats_vendors SET
      name=COALESCE($2,name),tagline=COALESCE($3,tagline),address=COALESCE($4,address),contact_phone=COALESCE($5,contact_phone),
      image_url=COALESCE($6,image_url),accepting_orders=COALESCE($7,accepting_orders),prep_minutes=COALESCE($8,prep_minutes),
      minimum_order=COALESCE($9,minimum_order),profile=$10::jsonb,updated_at=NOW() WHERE id=$1 RETURNING *`,
      [vendor.id,req.body.name ?? null,req.body.tagline ?? null,req.body.address ?? null,req.body.contactPhone ?? null,req.body.imageUrl ?? null,req.body.acceptingOrders ?? null,req.body.prepMinutes ?? null,req.body.minimumOrder ?? null,JSON.stringify(profile)]);
    res.json({ vendor: { id: rows[0].id, name: rows[0].name, tagline: rows[0].tagline, address: rows[0].address, contactPhone: rows[0].contact_phone, imageUrl: rows[0].image_url, acceptingOrders: rows[0].accepting_orders, prepMinutes: Number(rows[0].prep_minutes), minimumOrder: Number(rows[0].minimum_order), openingHours: rows[0].profile?.openingHours || {} } });
  } catch (err) { next(err); }
}

export async function updateOwnedVendorOrder(req, res, next) {
  try {
    const vendor = await ownedVendor(req.auth.sub);
    const target = req.body.status;
    const transitions = { accepted: ['preparing','cancelled'], preparing: ['ready','cancelled'] };
    const current = (await pool.query('SELECT * FROM sokoeats_orders WHERE (id::text=$1 OR code=$1) AND vendor_id=$2', [req.params.orderKey,vendor.id])).rows[0];
    if (!current) return res.status(404).json({ message: 'Order not found for this shop' });
    if (!(transitions[current.status] || []).includes(target)) return res.status(409).json({ message: `Order cannot move from ${current.status} to ${target}` });
    const { rows } = await pool.query('UPDATE sokoeats_orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [target,current.id]);
    res.json({ order: rows[0] });
  } catch (err) { next(err); }
}

export async function reviewVendor(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = (await client.query(`SELECT * FROM sokoeats_orders WHERE vendor_id=$1 AND customer_user_id=$2 AND status='delivered'
      AND ($3::uuid IS NULL OR id=$3) ORDER BY updated_at DESC,created_at DESC LIMIT 1 FOR UPDATE`, [req.params.vendorId,req.auth.sub,req.body.orderId || null])).rows[0];
    if (!order) throw Object.assign(new Error('Only a delivered order can be rated'), { status: 409 });
    const { rows } = await client.query(`INSERT INTO sokoeats_vendor_reviews(vendor_id,order_id,customer_user_id,rating,comment) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(order_id) DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment,updated_at=NOW() RETURNING *`, [order.vendor_id,order.id,req.auth.sub,req.body.rating,req.body.comment || null]);
    const summary = (await client.query('SELECT ROUND(AVG(rating)::numeric,1) rating,COUNT(*)::int rating_count FROM sokoeats_vendor_reviews WHERE vendor_id=$1', [order.vendor_id])).rows[0];
    await client.query('UPDATE sokoeats_vendors SET rating=$2,rating_count=$3,updated_at=NOW() WHERE id=$1', [order.vendor_id,summary.rating,summary.rating_count]);
    await client.query('COMMIT');
    res.json({ review: rows[0], summary: { rating: Number(summary.rating), count: Number(summary.rating_count) } });
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); next(err); }
  finally { client.release(); }
}

export async function vendorPortal(_req, res, next) {
  try {
    res.json({ portal: await getScreenPayload('vendor_portal_dashboard_overview') });
  } catch (err) { next(err); }
}

export async function vendorMenu(req, res, next) {
  try {
    const vendor = await ownedVendor(req.auth.sub);
    const menu = await loadVendorMenu(vendor.slug);
    if (!menu) return res.status(404).json({ message: 'Vendor catalogue not found' });
    res.json({ menu });
  } catch (err) { next(err); }
}

export async function updateMenuAvailability(req, res, next) {
  try {
    const vendor = await ownedVendor(req.auth.sub);
    const { rows } = await pool.query(
      'UPDATE sokoeats_menu_items SET available = $1, updated_at = NOW() WHERE id::text = $2 AND vendor_id = $3 RETURNING *',
      [Boolean(req.body.available), req.params.id, vendor.id],
    );
    if (!rows[0]) return res.status(404).json({ message: 'Menu item not found in your catalogue' });
    res.json({ item: menuItemJson(rows[0]) });
  } catch (err) { next(err); }
}

export async function updateVendorOrderStatus(req, res, next) {
  try {
    const portal = await getScreenPayload('vendor_portal_dashboard_overview');
    const code = req.params.code.startsWith('#') ? req.params.code : `#${req.params.code}`;
    for (const list of Object.values(portal.liveOrders)) {
      const order = list.find((entry) => entry.code === code);
      if (order) {
        order.status = req.body.status;
        order.updatedAt = new Date().toISOString();
        return res.json({ portal: await saveScreenPayload('vendor_portal_dashboard_overview', portal) });
      }
    }
    return res.status(404).json({ message: 'Vendor order not found' });
  } catch (err) { next(err); }
}


export async function vendorAnalytics(_req, res, next) {
  try {
    res.json({ analytics: await getScreenPayload('vendor_analytics_dashboard') });
  } catch (err) { next(err); }
}

export async function vendorInventory(_req, res, next) {
  try {
    res.json({ inventory: await getScreenPayload('vendor_inventory_management') });
  } catch (err) { next(err); }
}

export async function updateInventoryStock(req, res, next) {
  try {
    const inventory = await getScreenPayload('vendor_inventory_management');
    const item = inventory.items.find((entry) => entry.id === req.params.id);
    if (!item) return res.status(404).json({ message: 'Inventory item not found' });
    item.numericStock = Number(req.body.numericStock);
    item.stock = req.body.stock || String(req.body.numericStock);
    item.status = item.numericStock <= 0 ? 'Out of Stock' : item.numericStock <= 8.5 ? 'Low Stock' : 'In Stock';
    res.json({ inventory: await saveScreenPayload('vendor_inventory_management', inventory) });
  } catch (err) { next(err); }
}


export async function vendorOrderHistory(_req, res, next) {
  try { res.json({ orderHistory: await getScreenPayload('vendor_order_history') }); } catch (err) { next(err); }
}

export async function vendorOrderDetails(_req, res, next) {
  try {
    const details = await getScreenPayload('order_details_sko_1294');
    if (details.code !== req.params.code) return res.status(404).json({ message: 'Vendor order not found' });
    res.json({ orderDetails: details });
  } catch (err) { next(err); }
}

export async function vendorProfileSettings(_req, res, next) {
  try { res.json({ profileSettings: await getScreenPayload('vendor_profile_settings') }); } catch (err) { next(err); }
}

export async function updateVendorProfileSettings(req, res, next) {
  try {
    const settings = await getScreenPayload('vendor_profile_settings');
    Object.assign(settings, req.body, { updatedAt: new Date().toISOString() });
    res.json({ profileSettings: await saveScreenPayload('vendor_profile_settings', settings) });
  } catch (err) { next(err); }
}


export async function merchantGrowthSuite(_req, res, next) {
  try {
    const screens = {};
    for (const key of ["merchant_growth_portal","create_new_campaign","campaign_performance_analytics","campaign_history_logs"]) screens[key] = await getScreenPayload(key);
    res.json({ growth: screens });
  } catch (err) { next(err); }
}

export async function createCampaign(req, res, next) {
  try {
    const create = await getScreenPayload('create_new_campaign');
    create.lastCampaign = { ...req.body, status: 'draft', createdAt: new Date().toISOString() };
    res.status(201).json({ campaign: await saveScreenPayload('create_new_campaign', create) });
  } catch (err) { next(err); }
}

export async function campaignPerformance(_req, res, next) {
  try { res.json({ performance: await getScreenPayload('campaign_performance_analytics') }); } catch (err) { next(err); }
}

export async function campaignHistory(_req, res, next) {
  try { res.json({ history: await getScreenPayload('campaign_history_logs') }); } catch (err) { next(err); }
}


export async function vendorFinanceSuite(_req, res, next) {
  try {
    const screens = {};
    for (const key of ["payout_dashboard","request_payout","payout_history","tax_billing_statements","monthly_statement_detail","marketing_assets_library"]) screens[key] = await getScreenPayload(key);
    res.json({ finance: screens });
  } catch (err) { next(err); }
}

export async function requestMerchantPayout(req, res, next) {
  try {
    const payout = await getScreenPayload('request_payout');
    payout.lastRequest = { ...req.body, status: 'processing', requestedAt: new Date().toISOString() };
    const history = await getScreenPayload('payout_history');
    history.payouts.unshift({ date: 'Just now', amount: 'KES ' + Number(req.body.amount).toLocaleString('en-KE') + '.00', destination: req.body.destination, status: 'Processing', action: 'Details' });
    await saveScreenPayload('payout_history', history);
    res.status(201).json({ payout: await saveScreenPayload('request_payout', payout), history });
  } catch (err) { next(err); }
}

export async function taxBillingStatements(_req, res, next) {
  try { res.json({ statements: await getScreenPayload('tax_billing_statements') }); } catch (err) { next(err); }
}

export async function monthlyStatementDetail(_req, res, next) {
  try { res.json({ statement: await getScreenPayload('monthly_statement_detail') }); } catch (err) { next(err); }
}

export async function marketingAssetsLibrary(_req, res, next) {
  try { res.json({ assets: await getScreenPayload('marketing_assets_library') }); } catch (err) { next(err); }
}


export async function merchantOperationsSuite(_req, res, next) {
  try {
    const screens = {};
    for (const key of ["welcome_to_sokoeats_merchant","business_information","verify_your_business","store_configuration","merchant_terms_conditions","application_submitted","menu_categories_overview","category_items_breakfast","add_menu_item","bulk_menu_import","fees_commission_structure","create_ad_step_1_choose_goal","create_ad_step_2_creative","create_ad_step_3_audience_budget","create_ad_final_step_review_launch"]) screens[key] = await getScreenPayload(key);
    res.json({ operations: screens });
  } catch (err) { next(err); }
}

export async function submitMerchantOnboarding(req, res, next) {
  try {
    const submitted = await getScreenPayload('application_submitted');
    submitted.lastSubmission = { ...req.body, status: 'submitted', submittedAt: new Date().toISOString() };
    res.status(201).json({ application: await saveScreenPayload('application_submitted', submitted) });
  } catch (err) { next(err); }
}

const menuCategoryRules = [
  ['Drinks', ['drink', 'juice', 'soda', 'water', 'tea', 'coffee', 'milk', 'smoothie']],
  ['Meals', ['meal', 'chicken', 'beef', 'nyama', 'pilau', 'rice', 'burger', 'pizza', 'ugali', 'fish']],
  ['Medicine', ['tablet', 'capsule', 'pain', 'medicine', 'syrup', 'pharmacy', 'vitamin']],
  ['Fresh Produce', ['fruit', 'vegetable', 'tomato', 'onion', 'potato', 'banana', 'avocado']],
  ['Gas Refills', ['gas', 'lpg', 'cylinder', 'refill']],
  ['Electronics', ['phone', 'charger', 'cable', 'earphone', 'television', 'laptop', 'battery']],
  ['Household', ['soap', 'detergent', 'tissue', 'cleaner', 'household']],
];

function inferMenuCategory(vendor, item) {
  const search = `${item.name || ''} ${item.description || ''} ${item.unitLabel || ''}`.toLowerCase();
  const matched = menuCategoryRules.find(([, keywords]) => keywords.some((keyword) => search.includes(keyword)));
  if (matched) return matched[0];
  if (vendor.shop_type === 'pharmacy') return 'Medicine';
  if (vendor.shop_type === 'gas') return 'Gas Refills';
  if (vendor.shop_type === 'electronics') return 'Electronics';
  if (vendor.shop_type === 'groceries') return 'Groceries';
  return 'Meals';
}

export async function createMerchantMenuItem(req, res, next) {
  try {
    const vendor = await ownedVendor(req.auth.sub);
    const suppliedCategory = String(req.body.sectionTitle || req.body.category || '').trim();
    const sectionTitle = suppliedCategory || inferMenuCategory(vendor, req.body);
    const price = Number(String(req.body.price).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(price) || price <= 0) return res.status(422).json({ message: 'A valid product price is required' });
    const { rows: sections } = await pool.query(
      `INSERT INTO sokoeats_menu_categories (vendor_id, title, description, sort_order)
       VALUES ($1,$2,$3,COALESCE($4,50))
       ON CONFLICT (vendor_id, title) DO UPDATE SET description = COALESCE(EXCLUDED.description, sokoeats_menu_categories.description)
       RETURNING *`,
      [vendor.id, sectionTitle, req.body.sectionDescription || null, req.body.sectionSortOrder || null],
    );
    const section = sections[0];
    const { rows } = await pool.query(
      `INSERT INTO sokoeats_menu_items (vendor_id, section_id, name, description, price, category, popular, available, image_url, unit_label, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [vendor.id, section.id, req.body.name, req.body.description || '', Math.round(price), section.title, req.body.popular === true, req.body.available !== false, req.body.imageUrl || null, req.body.unitLabel || null, req.body.sortOrder || 0],
    );
    const menu = await loadVendorMenu(vendor.slug);
    res.status(201).json({ item: menuItemJson({ ...rows[0], commission_rate_bps: vendor.commission_rate_bps, vat_registered: vendor.vat_registered }), menu, categorization: { category: sectionTitle, source: suppliedCategory ? 'partner' : 'sokoeats-auto' } });
  } catch (err) { next(err); }
}

export async function createMerchantMenuCategory(req, res, next) {
  try {
    const vendor = await ownedVendor(req.auth.sub);
    const { rows } = await pool.query(
      `INSERT INTO sokoeats_menu_categories (vendor_id, title, description, sort_order)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (vendor_id, title) DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
       RETURNING *`,
      [vendor.id, req.body.title, req.body.description || null, req.body.sortOrder || 0],
    );
    res.status(201).json({ category: rows[0], menu: await loadVendorMenu(vendor.slug) });
  } catch (err) { next(err); }
}

export async function updateMerchantMenuItem(req, res, next) {
  let client;
  try {
    const vendor = await ownedVendor(req.auth.sub);
    client = await pool.connect();
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM sokoeats_menu_items WHERE id::text = $1 AND vendor_id = $2 FOR UPDATE', [req.params.id, vendor.id]);
    if (!existing.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Menu item not found in your catalogue' });
    }
    const suppliedCategory = String(req.body.sectionTitle || req.body.category || '').trim();
    const title = suppliedCategory || inferMenuCategory(vendor, req.body);
    const { rows: sections } = await client.query(
      `INSERT INTO sokoeats_menu_categories (vendor_id, title, sort_order) VALUES ($1,$2,50)
       ON CONFLICT (vendor_id, title) DO UPDATE SET title = EXCLUDED.title RETURNING id`, [vendor.id, title],
    );
    const { rows } = await client.query(
      `UPDATE sokoeats_menu_items SET section_id=$1, category=$2, name=$3, description=$4, price=$5,
       image_url=$6, unit_label=$7, available=$8, popular=$9, sort_order=$10, updated_at=NOW()
       WHERE id::text=$11 AND vendor_id=$12 RETURNING *`,
      [sections[0].id, title, req.body.name, req.body.description || '', req.body.price,
        req.body.imageUrl || null, req.body.unitLabel || null, req.body.available, req.body.popular,
        req.body.sortOrder, req.params.id, vendor.id],
    );
    await client.query('COMMIT');
    res.json({ item: menuItemJson({ ...rows[0], commission_rate_bps: vendor.commission_rate_bps, vat_registered: vendor.vat_registered }), categorization: { category: title, source: suppliedCategory ? 'partner' : 'sokoeats-auto' } });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    next(err);
  } finally { client?.release(); }
}

export async function deleteMerchantMenuItem(req, res, next) {
  try {
    const vendor = await ownedVendor(req.auth.sub);
    // Order lines retain their name/price snapshots; their FK uses ON DELETE SET NULL.
    const { rows } = await pool.query('DELETE FROM sokoeats_menu_items WHERE id::text=$1 AND vendor_id=$2 RETURNING id', [req.params.id, vendor.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Menu item not found in your catalogue' });
    res.json({ deletedId: rows[0].id });
  } catch (err) { next(err); }
}

export async function createVendorImageUpload(req, res, next) {
  try {
    await ownedVendor(req.auth.sub);
    const upload = await createImageUpload({ ownerUserId: req.auth.sub, filename: req.body.filename, contentType: req.body.contentType });
    await pool.query(
      'INSERT INTO sokoeats_media_assets (owner_user_id, object_key, public_url, content_type) VALUES ($1,$2,$3,$4)',
      [req.auth.sub, upload.key, upload.publicUrl, req.body.contentType],
    );
    res.status(201).json({ upload });
  } catch (err) { next(err); }
}

export async function importMerchantMenu(req, res, next) {
  try {
    const bulk = await getScreenPayload('bulk_menu_import');
    bulk.lastImport = { ...req.body, status: 'imported', importedAt: new Date().toISOString() };
    bulk.processing = { ...(bulk.processing || {}), progress: 100, body: String(req.body.itemCount || 142) + ' items imported successfully.' };
    res.status(201).json({ import: await saveScreenPayload('bulk_menu_import', bulk) });
  } catch (err) { next(err); }
}

export async function launchMerchantAd(req, res, next) {
  try {
    const launch = await getScreenPayload('create_ad_final_step_review_launch');
    launch.lastLaunch = { ...req.body, status: 'live', launchedAt: new Date().toISOString() };
    res.status(201).json({ campaign: await saveScreenPayload('create_ad_final_step_review_launch', launch) });
  } catch (err) { next(err); }
}
