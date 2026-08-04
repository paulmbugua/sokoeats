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
