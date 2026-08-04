import { getScreenPayload, saveScreenPayload } from '../models/screenPayloadModel.js';

export async function vendorPortal(_req, res, next) {
  try {
    res.json({ portal: await getScreenPayload('vendor_portal_dashboard_overview') });
  } catch (err) { next(err); }
}

export async function vendorMenu(_req, res, next) {
  try {
    res.json({ menu: await getScreenPayload('vendor_menu_management') });
  } catch (err) { next(err); }
}

export async function updateMenuAvailability(req, res, next) {
  try {
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
