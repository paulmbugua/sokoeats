import pool from '../config/db.js';
import { canViewDelivery, deliveryEstimate, deliverySteps, distanceMeters } from '../services/deliveryTracking.js';
import { assignRider, vendorAccept, markPickedUp, confirmDeliveryOtp } from '../services/financeService.js';
import { sendOrderUpdateSms } from '../services/smsService.js';

const failure = (message, status = 409) => Object.assign(new Error(message), { status });
const point = (lat, lng) => lat == null || lng == null ? null : { latitude: Number(lat), longitude: Number(lng) };

async function getOrder(db, key, lock = false) {
  const { rows } = await db.query(`SELECT o.*, v.owner_user_id, v.name AS vendor_name, v.address AS vendor_address,
    r.name AS rider_name, r.phone AS rider_phone FROM sokoeats_orders o
    JOIN sokoeats_vendors v ON v.id=o.vendor_id LEFT JOIN sokoeats_users r ON r.id=o.rider_user_id
    WHERE o.id::text=$1 OR o.code=$1 ${lock ? 'FOR UPDATE OF o' : ''}`, [key]);
  if (!rows[0]) throw failure('Order not found', 404);
  return rows[0];
}

export async function deliveryOrders(req, res, next) {
  try {
    let clause;
    if (req.auth.role === 'customer') clause = 'o.customer_user_id=$1';
    else if (['vendor', 'merchant'].includes(req.auth.role)) clause = 'v.owner_user_id=$1';
    else if (['rider', 'courier'].includes(req.auth.role)) clause = `(o.rider_user_id=$1 OR
      (o.finance_state='VENDOR_ACCEPTED' AND o.rider_user_id IS NULL AND o.status NOT IN ('cancelled','delivered')
       AND (o.delivery_zone_id IS NULL OR EXISTS (SELECT 1 FROM sokoeats_rider_delivery_zones z WHERE z.rider_user_id=$1 AND z.zone_id=o.delivery_zone_id AND z.active=true))))`;
    else return res.status(403).json({ message: 'Use the dispatch dashboard for platform-wide orders' });
    const { rows } = await pool.query(`SELECT o.id,o.code,o.status,o.finance_state AS "financeState",o.rider_user_id AS "riderUserId",
      v.name AS "vendorName",o.created_at AS "createdAt",o.total FROM sokoeats_orders o
      JOIN sokoeats_vendors v ON v.id=o.vendor_id WHERE ${clause} ORDER BY o.created_at DESC LIMIT 80`, [req.auth.sub]);
    res.json({ orders: rows });
  } catch (error) { next(error); }
}

export async function trackDelivery(req, res, next) {
  try {
    const order = await getOrder(pool, req.params.orderKey);
    if (!canViewDelivery(order, req.auth)) throw failure('This order is not assigned to your account', 403);
    const { rows: events } = await pool.query('SELECT event_type,occurred_at FROM sokoeats_order_tracking_events WHERE order_id=$1 ORDER BY occurred_at,id', [order.id]);
    const { rows: locations } = await pool.query('SELECT latitude,longitude,accuracy_m,captured_at FROM sokoeats_rider_locations WHERE order_id=$1 AND rider_user_id=$2 ORDER BY captured_at DESC LIMIT 1', [order.id, order.rider_user_id]);
    const location = locations[0];
    const { rows: items } = await pool.query('SELECT name,quantity,notes FROM sokoeats_order_items WHERE order_id=$1', [order.id]);
    const terminal = ['delivered', 'cancelled'].includes(order.status);
    res.set('Cache-Control', 'no-store');
    res.json({ tracking: {
      id: order.id, code: order.code, status: order.rider_arrived_at && !terminal ? 'arrived' : order.status,
      financeState: order.finance_state, vendorName: order.vendor_name,
      deliveryAddress: order.delivery_address, recipientName: order.recipient_name, items,
      recipientPhone: terminal ? null : order.recipient_phone, notes: order.notes,
      pickup: point(order.pickup_latitude, order.pickup_longitude), destination: point(order.dropoff_latitude, order.dropoff_longitude),
      rider: order.rider_user_id ? { name: order.rider_name, phone: terminal ? null : order.rider_phone,
        location: !terminal && location ? { ...point(location.latitude, location.longitude), accuracy: Number(location.accuracy_m), capturedAt: location.captured_at, stale: Date.now() - new Date(location.captured_at).getTime() > 90000 } : null } : null,
      timeline: deliverySteps.map(([key, label]) => ({ key, label, at: events.find(event => event.event_type === key)?.occurred_at || null })),
      events: events.map(event => ({ key: event.event_type, at: event.occurred_at })),
      estimate: deliveryEstimate(order, events), serverTime: new Date().toISOString(),
    } });
  } catch (error) { next(error); }
}

export async function deliveryAction(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Finance operations take the settlement lock first; preserve that lock order.
    await client.query(`SELECT s.id FROM sokoeats_order_settlements s JOIN sokoeats_orders o ON o.id=s.order_id WHERE o.id::text=$1 OR o.code=$1 FOR UPDATE OF s`, [req.params.orderKey]);
    const order = await getOrder(client, req.params.orderKey, true);
    if (['delivered', 'cancelled'].includes(order.status)) throw failure('This delivery is already closed');
    const action = req.body.action;
    const rider = ['rider', 'courier'].includes(req.auth.role);
    const owner = ['vendor', 'merchant'].includes(req.auth.role) && String(order.owner_user_id) === req.auth.sub;
    if (action === 'claim') {
      if (!rider) throw failure('Only a rider can accept a delivery', 403);
      await assignRider(client, order.id, req.auth.sub, { ...req.auth, role: 'rider' });
    } else {
      if (!canViewDelivery(order, req.auth)) throw failure('Order access denied', 403);
      if (action === 'accept') {
        if (!owner) throw failure('Only the shop can accept this order', 403);
        await vendorAccept(client, order.id, req.auth);
      } else if (['preparing', 'ready'].includes(action)) {
        if (!owner) throw failure('Only the shop can update preparation', 403);
        if (!(action === 'preparing' ? ['accepted'] : ['accepted', 'preparing']).includes(order.status)) throw failure('Order preparation cannot move to this stage');
        await client.query('UPDATE sokoeats_orders SET status=$2,updated_at=NOW() WHERE id=$1', [order.id, action]);
        await sendOrderUpdateSms(client, { orderId: order.id, orderCode: order.code, phone: order.recipient_phone, status: action });
      } else {
        if (!rider || String(order.rider_user_id) !== req.auth.sub) throw failure('Only the assigned rider can update delivery', 403);
        if (action === 'pickup') {
          if (order.status !== 'ready') throw failure('Wait for the shop to mark the order ready');
          await markPickedUp(client, order.id, { ...req.auth, role: 'rider' });
        } else if (action === 'deliver') {
          if (!order.rider_arrived_at) throw failure('Confirm arrival before entering the delivery OTP');
          await confirmDeliveryOtp(client, order.id, req.body.otp, { ...req.auth, role: 'rider' });
        } else if (action === 'arrive') {
          if (order.status !== 'picked_up') throw failure('Only a dispatched order can arrive');
          const { rows } = await client.query('SELECT * FROM sokoeats_rider_locations WHERE order_id=$1 AND rider_user_id=$2 ORDER BY captured_at DESC LIMIT 1', [order.id, req.auth.sub]);
          const fix = rows[0];
          if (!fix || Date.now() - new Date(fix.captured_at).getTime() > 90000 || fix.accuracy_m == null || Number(fix.accuracy_m) > 100) throw failure('Share a fresh, accurate rider location before confirming arrival');
          const destination = point(order.dropoff_latitude, order.dropoff_longitude);
          if (!destination || distanceMeters(point(fix.latitude, fix.longitude), destination) > 200) throw failure('You must be within 200 metres of the delivery pin');
          if (!order.rider_arrived_at) {
            await client.query('UPDATE sokoeats_orders SET rider_arrived_at=NOW(),updated_at=NOW() WHERE id=$1', [order.id]);
            await sendOrderUpdateSms(client, { orderId: order.id, orderCode: order.code, phone: order.recipient_phone, status: 'arrived', extra: 'Your rider is at the delivery location. Share your OTP only after receiving your order.' });
          }
        }
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
}

export async function shareDeliveryLocation(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await getOrder(client, req.params.orderKey, true);
    if (!['rider', 'courier'].includes(req.auth.role) || String(order.rider_user_id) !== req.auth.sub) throw failure('Only the assigned rider can share a location', 403);
    if (['delivered', 'cancelled'].includes(order.status)) throw failure('Location sharing has ended for this order');
    const { latitude, longitude, accuracy, capturedAt } = req.body;
    const age = Date.now() - new Date(capturedAt).getTime();
    if (age > 60000 || age < -10000) throw failure('A recent GPS reading is required', 422);
    await client.query(`INSERT INTO sokoeats_rider_locations(rider_user_id,order_id,latitude,longitude,accuracy_m,captured_at)
      SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS (SELECT 1 FROM sokoeats_rider_locations WHERE order_id=$2 AND captured_at >= $6::timestamptz - interval '5 seconds')`, [req.auth.sub, order.id, latitude, longitude, accuracy, capturedAt]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
}
