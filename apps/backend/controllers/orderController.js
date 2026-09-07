import pool from '../config/db.js';
import { sendOrderUpdateSms } from '../services/smsService.js';
import { initializeOrderFinance } from '../services/financeService.js';
import { lockedQuote } from '../services/pricingService.js';

const code = () => `SE-${Date.now().toString(36).toUpperCase().slice(-6)}`;
const orderJson = (row) => ({
  id: row.id,
  code: row.code,
  customerName: row.customer_name,
  vendorName: row.vendor_name,
  status: row.status,
  subtotal: Number(row.subtotal),
  taxableSubtotal: Number(row.taxable_subtotal || 0),
  vatRateBps: Number(row.vat_rate_bps || 0),
  smallOrderFee: Number(row.small_order_fee || 0),
  minimumOrder: Number(row.minimum_order || 300),
  deliveryFee: Number(row.delivery_fee),
  deliveryBreakdown: row.delivery_breakdown || {},
  serviceFee: Number(row.service_fee),
  vatAmount: Number(row.vat_amount || 0),
  waivedServiceFee: Number(row.waived_service_fee || 0),
  discountAmount: Number(row.discount_amount || 0),
  total: Number(row.total),
  paymentMethod: row.payment_method,
  paymentStatus: row.payment_status,
  paymentReference: row.payment_reference,
  deliveryAddress: row.delivery_address,
  deliveryLocation: row.dropoff_latitude == null ? null : { latitude: Number(row.dropoff_latitude), longitude: Number(row.dropoff_longitude) },
  recipientName: row.recipient_name,
  recipientPhone: row.recipient_phone,
  deliveryForSelf: row.delivery_for_self,
  financeState: row.finance_state,
  riderUserId: row.rider_user_id,
  createdAt: row.created_at,
});

async function resolveVendor(client, { vendorId, vendorSlug }) {
  const query = vendorId ? ['SELECT * FROM sokoeats_vendors WHERE id = $1', [vendorId]] : ['SELECT * FROM sokoeats_vendors WHERE slug = $1', [vendorSlug]];
  const { rows } = await client.query(query[0], query[1]);
  if (!rows.length) throw Object.assign(new Error('Vendor not found'), { status: 404 });
  if (rows[0].status !== 'active') throw Object.assign(new Error('This shop is not currently accepting orders'), { status: 409 });
  if (rows[0].accepting_orders === false) throw Object.assign(new Error('This shop is temporarily paused. Please choose another shop or try again later.'), { status: 409 });
  return rows[0];
}

async function resolveMenu(client, vendorId, items) {
  const ids = items.map((item) => item.menuItemId).filter(Boolean);
  const names = items.map((item) => String(item.menuItemName || '').toLowerCase()).filter(Boolean);
  const { rows } = await client.query(
    `SELECT id, name, price FROM sokoeats_menu_items
     WHERE vendor_id = $1 AND available = true AND (($2::uuid[] IS NOT NULL AND id = ANY($2::uuid[])) OR lower(name) = ANY($3::text[]))`,
    [vendorId, ids.length ? ids : null, names],
  );
  const byId = new Map(rows.map((item) => [String(item.id), item]));
  const byName = new Map(rows.map((item) => [String(item.name).toLowerCase(), item]));
  return { byId, byName };
}

export async function listOrders(_req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT o.*, COALESCE(u.name, 'Guest') AS customer_name, v.name AS vendor_name FROM sokoeats_orders o LEFT JOIN sokoeats_users u ON u.id = o.customer_user_id JOIN sokoeats_vendors v ON v.id = o.vendor_id ORDER BY o.created_at DESC LIMIT 80`);
    res.json({ orders: rows.map(orderJson) });
  } catch (err) { next(err); }
}

export async function createOrder(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { deliveryAddress, notes, items, paymentMethod, paymentReference, recipientName, recipientPhone, deliveryForSelf } = req.body;
    const userResult = await client.query('SELECT * FROM sokoeats_users WHERE id = $1 AND role = $2 FOR UPDATE', [req.auth.sub, 'customer']);
    const customer = userResult.rows[0];
    if (!customer) throw Object.assign(new Error('A buyer account is required to place an order'), { status: 403 });
    if (customer.status !== 'active') throw Object.assign(new Error('This buyer account is not active'), { status: 403 });
    const phone = req.body.phone || customer.phone;
    if (!phone) throw Object.assign(new Error('Add a mobile number to your buyer profile before checkout'), { status: 422 });

    const vendor = await resolveVendor(client, req.body);
    const menu = await resolveMenu(client, vendor.id, items);
    let subtotal = 0;
    const lines = items.map((line) => {
      const item = line.menuItemId ? menu.byId.get(String(line.menuItemId)) : menu.byName.get(String(line.menuItemName || '').toLowerCase());
      if (!item) throw Object.assign(new Error(`Menu item unavailable: ${line.menuItemName || line.menuItemId}`), { status: 409 });
      const quantity = Number(line.quantity);
      const lineTotal = Number(item.price) * quantity;
      subtotal += lineTotal;
      return { ...line, item, quantity, lineTotal };
    });

    const quote = await lockedQuote(client, req.body.pricingQuoteId, customer.id);
    if (quote.dropoff_latitude == null || quote.dropoff_longitude == null) throw Object.assign(new Error('A delivery pin is required before placing this order'), { status: 422 });
    if (deliveryAddress.trim() !== quote.delivery_address.trim()) throw Object.assign(new Error('Delivery address changed after pricing. Confirm the new location before paying.'), { status: 409 });
    if (String(quote.vendor_id) !== String(vendor.id)) throw Object.assign(new Error('Pricing quote belongs to another shop'), { status: 409 });
    const signature = (value) => JSON.stringify(value.map((item) => [String(item.menuItemId), Number(item.quantity)]).sort());
    if (signature(items) !== signature(quote.items)) throw Object.assign(new Error('Basket changed after pricing. Refresh checkout before paying.'), { status: 409 });
    subtotal = Number(quote.subtotal);
    const taxableSubtotal = Number(quote.taxable_subtotal || 0);
    const vatRateBps = Number(quote.vat_rate_bps || 0);
    const vatAmount = Number(quote.vat_amount || 0);
    const smallOrderFee = Number(quote.small_order_fee || 0);
    const minimumOrder = Number(quote.minimum_order || 300);
    const deliveryFee = Number(quote.delivery_fee);
    const serviceFee = Number(quote.service_fee);
    const waivedServiceFee = Number(quote.waived_service_fee || 0);
    const discountAmount = Number(quote.discount_amount);
    const total = Number(quote.total);

    const payment = await client.query('SELECT * FROM sokoeats_payment_intents WHERE reference = $1 FOR UPDATE', [paymentReference]);
    if (!payment.rows.length) throw Object.assign(new Error('Payment is required before placing an order'), { status: 402 });
    const paid = payment.rows[0];
    if (paid.status !== 'paid') throw Object.assign(new Error('Payment has not been completed yet'), { status: 402 });
    if (paid.user_id && String(paid.user_id) !== String(customer.id)) throw Object.assign(new Error('Payment belongs to a different SokoEats account'), { status: 403 });
    if (paid.order_id) throw Object.assign(new Error('Payment reference has already been used for an order'), { status: 409 });
    if (paid.method !== paymentMethod) throw Object.assign(new Error('Payment method does not match the paid reference'), { status: 409 });
    if (String(paid.pricing_quote_id) !== String(quote.id)) throw Object.assign(new Error('Payment belongs to a different pricing quote'), { status: 409 });
    if (Number(paid.amount) < total) throw Object.assign(new Error('Paid amount does not cover the order total'), { status: 402 });

    const order = await client.query(
      `INSERT INTO sokoeats_orders
        (code,customer_user_id,vendor_id,pricing_quote_id,subtotal,taxable_subtotal,vat_rate_bps,vat_amount,small_order_fee,minimum_order,delivery_fee,delivery_breakdown,service_fee,waived_service_fee,surge_fee,discount_amount,total,delivery_address,recipient_name,recipient_phone,delivery_for_self,notes,payment_method,payment_status,payment_reference,payment_provider_reference,pickup_latitude,pickup_longitude,dropoff_latitude,dropoff_longitude,route_polyline,estimated_distance_km,estimated_duration_min,surge_multiplier,rider_surge_bonus,vendor_surge_bonus,platform_surge_revenue,delivery_zone_id,platform_commission)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'paid',$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38)
       RETURNING *`,
      [code(),customer.id,vendor.id,quote.id,subtotal,taxableSubtotal,vatRateBps,vatAmount,smallOrderFee,minimumOrder,deliveryFee,quote.delivery_breakdown || {},serviceFee,waivedServiceFee,quote.surge_fee,discountAmount,total,deliveryAddress,recipientName || customer.name,recipientPhone || phone,deliveryForSelf !== false,notes||null,paymentMethod,paymentReference,paid.provider_reference||null,vendor.latitude,vendor.longitude,quote.dropoff_latitude,quote.dropoff_longitude,quote.route_polyline,quote.distance_km,quote.duration_min,quote.surge_multiplier,quote.rider_surge_bonus,quote.vendor_surge_bonus,quote.platform_surge_revenue,quote.delivery_zone_id,quote.platform_commission],
    );

    for (const line of quote.items) {
      await client.query(
        `INSERT INTO sokoeats_order_items (order_id,menu_item_id,name,quantity,unit_price,line_total,notes,partner_unit_price,commission_amount,tax_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [order.rows[0].id,line.menuItemId,line.name,line.quantity,line.unitPrice,line.lineTotal,line.notes||null,line.partnerUnitPrice,line.commissionAmount,line.vatAmount],
      );
    }

    await client.query('UPDATE sokoeats_payment_intents SET order_id = $1, updated_at = NOW() WHERE reference = $2', [order.rows[0].id, paymentReference]);
    await client.query('UPDATE sokoeats_pricing_quotes SET consumed_at=NOW() WHERE id=$1', [quote.id]);
    const finance = await initializeOrderFinance(client, { order: order.rows[0], payment: paid, vendor, createdBy: customer.id });
    await sendOrderUpdateSms(client, { orderId: order.rows[0].id, orderCode: order.rows[0].code, phone: recipientPhone || phone, status: 'placed', extra: `Total KES ${total.toLocaleString('en-KE')}. Delivery OTP: ${finance.deliveryOtp}. Share it with the rider only after receiving your order.` });
    await client.query('COMMIT');

    const full = await pool.query(`SELECT o.*, COALESCE(u.name, 'Guest') AS customer_name, v.name AS vendor_name FROM sokoeats_orders o LEFT JOIN sokoeats_users u ON u.id = o.customer_user_id JOIN sokoeats_vendors v ON v.id = o.vendor_id WHERE o.id = $1`, [order.rows[0].id]);
    res.status(201).json({ order: orderJson(full.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

export async function updateOrderStatus(req, res, next) {
  if (['accepted', 'picked_up', 'delivered'].includes(req.body.status)) return res.status(409).json({ message: 'Use the protected settlement lifecycle endpoint for this status.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE sokoeats_orders SET status = $1, updated_at = NOW() WHERE id = $2
       RETURNING *, (SELECT phone FROM sokoeats_users WHERE id = sokoeats_orders.customer_user_id) AS customer_phone`,
      [req.body.status, req.params.id],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found' });
    }
    await sendOrderUpdateSms(client, { orderId: rows[0].id, orderCode: rows[0].code, phone: rows[0].customer_phone, status: req.body.status, extra: 'Thank you for ordering with SokoEats.' });
    await client.query('COMMIT');
    res.json({ order: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}
