import pool from '../config/db.js';
import { getScreenPayload, saveScreenPayload } from '../models/screenPayloadModel.js';

function menuItemJson(row) {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    sectionId: row.section_id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    category: row.category,
    popular: Boolean(row.popular),
    available: Boolean(row.available),
    imageUrl: row.image_url,
    unitLabel: row.unit_label,
    sortOrder: Number(row.sort_order || 0),
  };
}

async function loadVendorMenu(vendorSlug = 'nairobi-grill-house') {
  const { rows: vendors } = await pool.query('SELECT * FROM sokoeats_vendors WHERE slug = $1 OR id::text = $1 LIMIT 1', [vendorSlug]);
  const vendor = vendors[0] || (await pool.query("SELECT * FROM sokoeats_vendors WHERE status = 'active' ORDER BY rating DESC LIMIT 1")).rows[0];
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
    items: itemsResult.rows.filter((item) => String(item.section_id) === String(section.id) || item.category === section.title).map(menuItemJson),
  }));
  return { vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug, shopType: vendor.shop_type, tagline: vendor.tagline, address: vendor.address }, sections, items: sections.flatMap((section) => section.items) };
}

export async function vendorPortal(_req, res, next) {
  try {
    res.json({ portal: await getScreenPayload('vendor_portal_dashboard_overview') });
  } catch (err) { next(err); }
}

export async function vendorMenu(req, res, next) {
  try {
    const menu = await loadVendorMenu(req.query.vendorSlug || req.query.vendorId || 'nairobi-grill-house');
    if (menu) return res.json({ menu });
    res.json({ menu: await getScreenPayload('vendor_menu_management') });
  } catch (err) { next(err); }
}

export async function updateMenuAvailability(req, res, next) {
  try {
    const { rows } = await pool.query(
      'UPDATE sokoeats_menu_items SET available = $1, updated_at = NOW() WHERE id::text = $2 RETURNING *',
      [Boolean(req.body.available), req.params.id],
    );
    if (rows[0]) return res.json({ item: menuItemJson(rows[0]) });
    const menu = await getScreenPayload('vendor_menu_management');
    const item = menu.items.find((entry) => entry.id === req.params.id);
    if (!item) return res.status(404).json({ message: 'Menu item not found' });
    item.available = Boolean(req.body.available);
    res.json({ menu: await saveScreenPayload('vendor_menu_management', menu) });
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

export async function acceptMerchantTerms(req, res, next) {
  try {
    const terms = await getScreenPayload('merchant_terms_conditions');
    terms.acceptance = { ...req.body, accepted: true, acceptedAt: new Date().toISOString() };
    res.json({ terms: await saveScreenPayload('merchant_terms_conditions', terms) });
  } catch (err) { next(err); }
}

export async function createMerchantMenuItem(req, res, next) {
  try {
    const vendorKey = req.body.vendorId || req.body.vendorSlug || 'nairobi-grill-house';
    const { rows: vendors } = await pool.query('SELECT * FROM sokoeats_vendors WHERE id::text = $1 OR slug = $1 LIMIT 1', [vendorKey]);
    if (!vendors[0]) return res.status(404).json({ message: 'Vendor not found' });
    const vendor = vendors[0];
    const sectionTitle = req.body.sectionTitle || req.body.category || 'Items';
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
    res.status(201).json({ item: menuItemJson(rows[0]), menu });
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
