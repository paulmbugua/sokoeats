import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../config/db.js';
import { vendorAccept, assignRider, markPickedUp, confirmDeliveryOtp, otpDigest } from '../services/financeService.js';
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const tag = crypto.randomUUID();
  const users = {};
  for (const role of ['customer', 'vendor', 'rider']) {
    users[role] = (await client.query(`INSERT INTO sokoeats_users(name,email,role,status) VALUES('Delivery test',$1,$2,'active') RETURNING id`, [`${role}-${tag}@example.invalid`, role])).rows[0].id;
  }
  const vendor = (await client.query(`INSERT INTO sokoeats_vendors(name,slug,cuisine,owner_user_id) VALUES('Delivery test',$1,'test',$2) RETURNING id`, [`delivery-${tag}`, users.vendor])).rows[0];
  const order = (await client.query(`INSERT INTO sokoeats_orders(code,customer_user_id,vendor_id,subtotal,delivery_fee,total,delivery_address,dropoff_latitude,dropoff_longitude,payment_status,finance_state)
    VALUES($1,$2,$3,100,50,150,'Test entrance',-1.28,36.82,'paid','PAYMENT_CONFIRMED') RETURNING id`, [tag, users.customer, vendor.id])).rows[0];
  const payment = (await client.query(`INSERT INTO sokoeats_payment_intents(reference,order_id,method,provider,amount,status,phone) VALUES($1,$2,'card','paystack',150,'paid','test-only-no-dispatch') RETURNING id`, [tag, order.id])).rows[0];
  await client.query(`INSERT INTO sokoeats_order_settlements(order_id,payment_intent_id,vendor_id,state,vendor_gross,vendor_commission,vendor_net,service_fee,delivery_fee,rider_entitlement,risk_tier,delivery_otp_hash)
    VALUES($1,$2,$3,'PAYMENT_CONFIRMED',100,10,90,0,50,40,'new',$4)`, [order.id, payment.id, vendor.id, otpDigest(order.id, '123456')]);
  const shopAuth = { sub: users.vendor, role: 'vendor' };
  const riderAuth = { sub: users.rider, role: 'rider' };
  await vendorAccept(client, order.id, shopAuth);
  await assert.rejects(() => vendorAccept(client, order.id, shopAuth), error => error.status === 409);
  await client.query("UPDATE sokoeats_orders SET status='preparing' WHERE id=$1", [order.id]);
  await assignRider(client, order.id, users.rider, riderAuth);
  await client.query("UPDATE sokoeats_orders SET status='ready' WHERE id=$1", [order.id]);
  await assert.rejects(() => markPickedUp(client, order.id, { sub: users.customer, role: 'rider' }), error => error.status === 403);
  await markPickedUp(client, order.id, riderAuth);
  await client.query('UPDATE sokoeats_orders SET rider_arrived_at=NOW() WHERE id=$1', [order.id]);
  await assert.rejects(() => confirmDeliveryOtp(client, order.id, '000000', riderAuth), error => error.status === 422);
  await confirmDeliveryOtp(client, order.id, '123456', riderAuth);
  const saved = (await client.query('SELECT status,finance_state FROM sokoeats_orders WHERE id=$1', [order.id])).rows[0];
  assert.equal(saved.status, 'delivered');
  assert.equal(saved.finance_state, 'DELIVERY_OTP_CONFIRMED');
  const events = (await client.query('SELECT event_type FROM sokoeats_order_tracking_events WHERE order_id=$1 ORDER BY id', [order.id])).rows.map(row => row.event_type);
  assert.deepEqual(events, ['placed','accepted','preparing','rider_assigned','ready','picked_up','arrived','delivered']);
  console.log('PASS: real database acceptance, rider assignment, pickup, OTP verification and complete timeline. No external calls; fixtures rolled back.');
} finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
