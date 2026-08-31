import crypto from 'crypto';
import pool from '../config/db.js';
import { sendOrderUpdateSms } from './smsService.js';

const FINANCE_STATES = ['PAYMENT_CONFIRMED','VENDOR_ACCEPTED','RIDER_ASSIGNED','PICKED_UP','DELIVERY_OTP_CONFIRMED','PAYOUT_ELIGIBLE','SETTLED','CANCELLED','REFUNDED'];
const PSP_FEE_BPS = { mpesa: 150, card: 290 };

function money(value) { return Math.max(0, Math.round(Number(value || 0))); }
function reference(prefix) { return `${prefix}-${crypto.randomUUID()}`.toLowerCase(); }
function otpDigest(orderId, otp) {
  const secret = process.env.DELIVERY_OTP_SECRET || process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET;
  if (!secret) throw Object.assign(new Error('DELIVERY_OTP_SECRET or JWT_SECRET must be configured'), { status: 500 });
  return crypto.createHmac('sha256', secret).update(`${orderId}:${otp}`).digest('hex');
}

async function ledgerAccount(client, { code, name, accountType, ownerType = 'platform', ownerId = null }) {
  const { rows } = await client.query(
    `INSERT INTO sokoeats_ledger_accounts (code,name,account_type,owner_type,owner_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [code, name, accountType, ownerType, ownerId],
  );
  return rows[0];
}

export async function postJournal(client, { reference: journalReference, eventType, orderId = null, paymentIntentId = null, description, metadata = {}, createdBy = null, entries }) {
  const debits = entries.filter((entry) => entry.direction === 'debit').reduce((sum, entry) => sum + money(entry.amount), 0);
  const credits = entries.filter((entry) => entry.direction === 'credit').reduce((sum, entry) => sum + money(entry.amount), 0);
  if (!entries.length || debits !== credits || debits <= 0) throw Object.assign(new Error(`Unbalanced journal ${journalReference}: debits ${debits}, credits ${credits}`), { status: 500 });
  const existing = await client.query('SELECT * FROM sokoeats_ledger_journals WHERE reference = $1', [journalReference]);
  if (existing.rows[0]) return existing.rows[0];
  const { rows } = await client.query(
    `INSERT INTO sokoeats_ledger_journals (reference,event_type,order_id,payment_intent_id,description,metadata,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [journalReference, eventType, orderId, paymentIntentId, description, metadata, createdBy],
  );
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!['debit','credit'].includes(entry.direction) || money(entry.amount) <= 0) throw Object.assign(new Error('Ledger entries require a positive debit or credit'), { status: 500 });
    const account = await ledgerAccount(client, entry.account);
    await client.query(
      `INSERT INTO sokoeats_ledger_lines (journal_id,line_no,account_id,direction,amount,description,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [rows[0].id, index + 1, account.id, entry.direction, money(entry.amount), entry.description || null, entry.metadata || {}],
    );
  }
  return rows[0];
}

function vendorPayable(vendor) {
  return { code: `vendor:${vendor.id}:payable`, name: `${vendor.name} payable`, accountType: 'liability', ownerType: 'vendor', ownerId: vendor.id };
}
function riderPayable() {
  return { code: 'riders:delivery:payable', name: 'Rider delivery entitlements', accountType: 'liability', ownerType: 'rider' };
}
const accounts = {
  providerReceivable: { code: 'provider:paystack-mpesa:receivable', name: 'Payment provider receivable', accountType: 'asset', ownerType: 'provider' },
  customerFunds: { code: 'customers:paid-orders:clearing', name: 'Customer funds clearing', accountType: 'liability', ownerType: 'customer' },
  commission: { code: 'platform:commission:revenue', name: 'Marketplace commission revenue', accountType: 'revenue' },
  service: { code: 'platform:service-fee:revenue', name: 'Service fee revenue', accountType: 'revenue' },
  surge: { code: 'platform:surge:revenue', name: 'Platform surge operations revenue', accountType: 'revenue' },
  promotion: { code: 'platform:promotions:expense', name: 'Platform-funded promotions', accountType: 'expense' },
  pspExpense: { code: 'platform:psp-fees:expense', name: 'Payment provider charges', accountType: 'expense', ownerType: 'provider' },
  pspPayable: { code: 'provider:fees:payable', name: 'Payment provider fees payable', accountType: 'liability', ownerType: 'provider' },
  refunds: { code: 'platform:refunds:expense', name: 'Customer refunds and adjustments', accountType: 'expense' },
  reserves: { code: 'platform:risk-reserve:liability', name: 'Marketplace risk reserve', accountType: 'liability', ownerType: 'reserve' },
};

export async function initializeOrderFinance(client, { order, payment, vendor, createdBy }) {
  const existing = await client.query('SELECT * FROM sokoeats_order_settlements WHERE order_id = $1', [order.id]);
  if (existing.rows[0]) return { settlement: existing.rows[0], deliveryOtp: null };
  const subtotal = money(order.subtotal);
  const commissionBps = Number(vendor.commission_rate_bps || 1000);
  const commission = Math.min(subtotal, Math.round(subtotal * commissionBps / 10000));
  const surgeFee = money(order.surge_fee);
  const riderSurgeBonus = money(order.rider_surge_bonus);
  const vendorSurgeBonus = money(order.vendor_surge_bonus);
  const platformSurgeRevenue = money(order.platform_surge_revenue);
  const vendorNet = subtotal - commission + vendorSurgeBonus;
  const deliveryFee = money(order.delivery_fee);
  const riderEntitlement = deliveryFee + riderSurgeBonus;
  const serviceFee = money(order.service_fee);
  const discount = money(order.discount_amount);
  const total = money(order.total);
  const pspCharge = Math.round(total * Number(PSP_FEE_BPS[payment.method] || 0) / 10000);
  const reserveRate = vendor.risk_tier === 'restricted' ? 1000 : 0;
  const reserveAmount = Math.round(vendorNet * reserveRate / 10000);
  const deliveryOtp = String(crypto.randomInt(100000, 1000000));
  const now = new Date();

  const receiptEntries = [
    { account: accounts.providerReceivable, direction: 'debit', amount: total, description: 'Verified customer payment' },
    { account: accounts.customerFunds, direction: 'credit', amount: total, description: 'Customer funds pending allocation' },
  ];
  await postJournal(client, { reference: `order:${order.id}:payment`, eventType: 'CUSTOMER_PAYMENT', orderId: order.id, paymentIntentId: payment.id, description: `Customer payment for ${order.code}`, createdBy, entries: receiptEntries });

  const allocationEntries = [
    { account: accounts.customerFunds, direction: 'debit', amount: total },
    ...(discount ? [{ account: accounts.promotion, direction: 'debit', amount: discount }] : []),
    { account: vendorPayable(vendor), direction: 'credit', amount: subtotal + vendorSurgeBonus },
    ...(riderEntitlement ? [{ account: riderPayable(), direction: 'credit', amount: riderEntitlement }] : []),
    ...(serviceFee ? [{ account: accounts.service, direction: 'credit', amount: serviceFee }] : []),
    ...(platformSurgeRevenue ? [{ account: accounts.surge, direction: 'credit', amount: platformSurgeRevenue }] : []),
  ];
  await postJournal(client, { reference: `order:${order.id}:allocation`, eventType: 'ORDER_ALLOCATION', orderId: order.id, paymentIntentId: payment.id, description: `Allocate ${order.code} proceeds`, createdBy, metadata: { discount }, entries: allocationEntries });
  if (commission) {
    await postJournal(client, { reference: `order:${order.id}:commission`, eventType: 'SOKOEATS_COMMISSION', orderId: order.id, paymentIntentId: payment.id, description: `Commission for ${order.code}`, createdBy, metadata: { commissionBps }, entries: [
      { account: vendorPayable(vendor), direction: 'debit', amount: commission },
      { account: accounts.commission, direction: 'credit', amount: commission },
    ] });
  }
  if (pspCharge) {
    await postJournal(client, { reference: `order:${order.id}:psp-charge`, eventType: 'PSP_CHARGE_ESTIMATE', orderId: order.id, paymentIntentId: payment.id, description: `Estimated PSP charge for ${order.code}`, createdBy, entries: [
      { account: accounts.pspExpense, direction: 'debit', amount: pspCharge },
      { account: accounts.pspPayable, direction: 'credit', amount: pspCharge },
    ] });
  }
  if (reserveAmount) {
    await postJournal(client, { reference: `order:${order.id}:risk-reserve`, eventType: 'RISK_RESERVE_HELD', orderId: order.id, paymentIntentId: payment.id, description: `Restricted vendor reserve for ${order.code}`, createdBy, metadata: { reserveRate }, entries: [
      { account: vendorPayable(vendor), direction: 'debit', amount: reserveAmount },
      { account: accounts.reserves, direction: 'credit', amount: reserveAmount },
    ] });
  }
  const { rows } = await client.query(
    `INSERT INTO sokoeats_order_settlements
      (order_id,payment_intent_id,vendor_id,state,vendor_gross,vendor_commission,vendor_net,service_fee,delivery_fee,rider_entitlement,psp_charge,reserve_amount,risk_tier,delivery_otp_hash,surge_fee,rider_surge_bonus,vendor_surge_bonus,platform_surge_revenue)
     VALUES ($1,$2,$3,'PAYMENT_CONFIRMED',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [order.id,payment.id,vendor.id,subtotal,commission,vendorNet,serviceFee,deliveryFee,riderEntitlement,pspCharge,reserveAmount,vendor.risk_tier||'new',otpDigest(order.id,deliveryOtp),surgeFee,riderSurgeBonus,vendorSurgeBonus,platformSurgeRevenue],
  );
  await client.query(`UPDATE sokoeats_orders SET finance_state = 'PAYMENT_CONFIRMED' WHERE id = $1`, [order.id]);
  await client.query(`INSERT INTO sokoeats_settlement_events (settlement_id,to_state,event_type,actor_user_id,metadata) VALUES ($1,'PAYMENT_CONFIRMED','payment_confirmed',$2,$3)`, [rows[0].id, createdBy, { paymentReference: payment.reference, at: now.toISOString() }]);
  return { settlement: rows[0], deliveryOtp };
}

async function settlementForUpdate(client, orderKey) {
  const { rows } = await client.query(
    `SELECT s.*, o.code, o.status AS order_status, o.customer_user_id, o.rider_user_id AS order_rider_user_id,
            v.owner_user_id, v.name AS vendor_name, v.payout_status AS vendor_payout_status,
            u.phone AS customer_phone
       FROM sokoeats_order_settlements s
       JOIN sokoeats_orders o ON o.id = s.order_id
       JOIN sokoeats_vendors v ON v.id = s.vendor_id
       LEFT JOIN sokoeats_users u ON u.id = o.customer_user_id
      WHERE o.id::text = $1 OR o.code = $1 FOR UPDATE OF s,o`, [String(orderKey)],
  );
  if (!rows[0]) throw Object.assign(new Error('Order settlement not found'), { status: 404 });
  return rows[0];
}

function assertActor(row, actor, role) {
  if (['admin','support'].includes(role)) return;
  if (['vendor','merchant'].includes(role) && String(row.owner_user_id) === String(actor)) return;
  if (role === 'rider' && String(row.rider_user_id || row.order_rider_user_id) === String(actor)) return;
  if (role === 'customer' && String(row.customer_user_id) === String(actor)) return;
  throw Object.assign(new Error('This account does not control the order settlement'), { status: 403 });
}

async function recordTransition(client, row, nextState, eventType, actorUserId, metadata = {}, extra = {}) {
  if (!FINANCE_STATES.includes(nextState)) throw Object.assign(new Error('Unsupported finance state'), { status: 422 });
  const sets = ['state = $2', 'updated_at = NOW()'];
  const values = [row.id, nextState];
  for (const [column, value] of Object.entries(extra)) { values.push(value); sets.push(`${column} = $${values.length}`); }
  const { rows } = await client.query(`UPDATE sokoeats_order_settlements SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, values);
  await client.query('UPDATE sokoeats_orders SET finance_state = $2, updated_at = NOW() WHERE id = $1', [row.order_id, nextState]);
  await client.query(`INSERT INTO sokoeats_settlement_events (settlement_id,from_state,to_state,event_type,actor_user_id,metadata) VALUES ($1,$2,$3,$4,$5,$6)`, [row.id, row.state, nextState, eventType, actorUserId, metadata]);
  return rows[0];
}

export async function vendorAccept(client, orderKey, auth) {
  const row = await settlementForUpdate(client, orderKey); assertActor(row, auth.sub, auth.role);
  if (row.state !== 'PAYMENT_CONFIRMED') throw Object.assign(new Error(`Vendor acceptance is not allowed from ${row.state}`), { status: 409 });
  await client.query(`UPDATE sokoeats_orders SET status = 'accepted' WHERE id = $1`, [row.order_id]);
  await sendOrderUpdateSms(client, { orderId: row.order_id, orderCode: row.code, phone: row.customer_phone, status: 'accepted', extra: row.vendor_name + ' accepted your paid order.' });
  return recordTransition(client, row, 'VENDOR_ACCEPTED', 'vendor_accepted', auth.sub, {}, { vendor_accepted_at: new Date() });
}

export async function assignRider(client, orderKey, riderUserId, auth) {
  const row = await settlementForUpdate(client, orderKey);
  if (!['admin','support'].includes(auth.role) && !(auth.role === 'rider' && String(auth.sub) === String(riderUserId))) throw Object.assign(new Error('Only dispatch or the accepting rider can assign this delivery'), { status: 403 });
  if (row.state !== 'VENDOR_ACCEPTED') throw Object.assign(new Error(`Rider assignment is not allowed from ${row.state}`), { status: 409 });
  const rider = await client.query(`SELECT id,status FROM sokoeats_users WHERE id = $1 AND role IN ('rider','courier')`, [riderUserId]);
  if (!rider.rows[0] || rider.rows[0].status !== 'active') throw Object.assign(new Error('An active rider account is required'), { status: 422 });
  await client.query(`UPDATE sokoeats_orders SET rider_user_id = $2 WHERE id = $1`, [row.order_id, riderUserId]);
  await sendOrderUpdateSms(client, { orderId: row.order_id, orderCode: row.code, phone: row.customer_phone, status: 'rider_assigned', extra: 'A verified SokoEats rider has been assigned.' });
  return recordTransition(client, row, 'RIDER_ASSIGNED', 'rider_assigned', auth.sub, { riderUserId }, { rider_user_id: riderUserId, rider_assigned_at: new Date() });
}

export async function markPickedUp(client, orderKey, auth) {
  const row = await settlementForUpdate(client, orderKey); assertActor(row, auth.sub, auth.role);
  if (row.state !== 'RIDER_ASSIGNED') throw Object.assign(new Error(`Pickup confirmation is not allowed from ${row.state}`), { status: 409 });
  await client.query(`UPDATE sokoeats_orders SET status = 'picked_up' WHERE id = $1`, [row.order_id]);
  await sendOrderUpdateSms(client, { orderId: row.order_id, orderCode: row.code, phone: row.customer_phone, status: 'picked_up', extra: 'Your order is on the way. Keep your delivery OTP private until it arrives.' });
  return recordTransition(client, row, 'PICKED_UP', 'picked_up', auth.sub, {}, { picked_up_at: new Date() });
}

export async function confirmDeliveryOtp(client, orderKey, otp, auth) {
  const row = await settlementForUpdate(client, orderKey); assertActor(row, auth.sub, auth.role);
  if (row.state !== 'PICKED_UP') throw Object.assign(new Error(`Delivery confirmation is not allowed from ${row.state}`), { status: 409 });
  const actual = Buffer.from(otpDigest(row.order_id, String(otp)));
  const expected = Buffer.from(row.delivery_otp_hash);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw Object.assign(new Error('Delivery OTP is incorrect'), { status: 422 });
  const now = new Date();
  const vendorDelayMs = row.risk_tier === 'trusted' ? 0 : row.risk_tier === 'standard' ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const vendorReleaseAt = new Date(now.getTime() + vendorDelayMs);
  const riderProfile = await client.query('SELECT schedule FROM sokoeats_payout_profiles WHERE rider_user_id = $1', [row.rider_user_id]);
  const riderImmediate = riderProfile.rows[0]?.schedule === 'immediate';
  const riderReleaseAt = riderImmediate ? now : new Date(new Date(now).setHours(23, 59, 59, 999));
  await client.query(`UPDATE sokoeats_orders SET status = 'delivered' WHERE id = $1`, [row.order_id]);
  await sendOrderUpdateSms(client, { orderId: row.order_id, orderCode: row.code, phone: row.customer_phone, status: 'delivered', extra: 'Delivery OTP confirmed. Thank you for choosing SokoEats.' });
  const result = await recordTransition(client, row, 'DELIVERY_OTP_CONFIRMED', 'delivery_otp_confirmed', auth.sub, { payoutPolicy: row.risk_tier, riderSchedule: riderImmediate ? 'immediate' : 'daily' }, { otp_verified_at: now, delivered_at: now, vendor_release_at: vendorReleaseAt, rider_release_at: riderReleaseAt });
  await createDuePayouts(client, result.id);
  return result;
}

async function recipientFor(client, settlement, beneficiaryType) {
  if (beneficiaryType === 'vendor') {
    const { rows } = await client.query(`SELECT vc.psp_recipient_code AS recipient_code, vc.payout_status FROM sokoeats_vendor_compliance vc WHERE vc.vendor_id = $1`, [settlement.vendor_id]);
    return rows[0];
  }
  const { rows } = await client.query(`SELECT recipient_code,status AS payout_status FROM sokoeats_payout_profiles WHERE rider_user_id = $1`, [settlement.rider_user_id]);
  return rows[0];
}

export async function createDuePayouts(client, settlementId) {
  const { rows } = await client.query('SELECT * FROM sokoeats_order_settlements WHERE id = $1 FOR UPDATE', [settlementId]);
  const settlement = rows[0];
  if (!settlement || settlement.dispute_status === 'open' || settlement.frozen_at) return [];
  const now = new Date();
  const created = [];
  const candidates = [
    { type: 'vendor', amount: money(settlement.vendor_net) - money(settlement.reserve_amount), due: settlement.vendor_release_at && new Date(settlement.vendor_release_at) <= now, vendorId: settlement.vendor_id, riderId: null, scheduledFor: settlement.vendor_release_at },
    { type: 'rider', amount: money(settlement.rider_entitlement), due: settlement.rider_release_at && new Date(settlement.rider_release_at) <= now, vendorId: null, riderId: settlement.rider_user_id, scheduledFor: settlement.rider_release_at },
  ];
  for (const item of candidates) {
    if (!item.due || !item.amount || (item.type === 'rider' && !item.riderId)) continue;
    const recipient = await recipientFor(client, settlement, item.type);
    const status = recipient?.recipient_code && recipient?.payout_status === 'active' ? 'scheduled' : 'frozen';
    const result = await client.query(
      `INSERT INTO sokoeats_payouts (reference,settlement_id,beneficiary_type,vendor_id,rider_user_id,amount,recipient_code,status,scheduled_for,failure_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (settlement_id,beneficiary_type) DO NOTHING RETURNING *`,
      [reference(`sko-${item.type}`), settlement.id, item.type, item.vendorId, item.riderId, item.amount, recipient?.recipient_code || null, status, item.scheduledFor || now, status === 'frozen' ? 'Payout profile is not active or has no Paystack recipient' : null],
    );
    if (result.rows[0]) created.push(result.rows[0]);
  }
  const vendorExists = await client.query(`SELECT 1 FROM sokoeats_payouts WHERE settlement_id = $1 AND beneficiary_type = 'vendor'`, [settlement.id]);
  const riderRequired = money(settlement.rider_entitlement) > 0;
  const riderExists = riderRequired ? await client.query(`SELECT 1 FROM sokoeats_payouts WHERE settlement_id = $1 AND beneficiary_type = 'rider'`, [settlement.id]) : { rows: [{}] };
  if (vendorExists.rows[0] && riderExists.rows[0] && settlement.state === 'DELIVERY_OTP_CONFIRMED') {
    await recordTransition(client, settlement, 'PAYOUT_ELIGIBLE', 'payouts_eligible', null, {}, { payout_eligible_at: now });
  }
  return created;
}

export async function processDueSettlements(client) {
  const { rows } = await client.query(`SELECT id FROM sokoeats_order_settlements WHERE state IN ('DELIVERY_OTP_CONFIRMED','PAYOUT_ELIGIBLE') AND dispute_status <> 'open' AND frozen_at IS NULL AND (vendor_release_at <= NOW() OR rider_release_at <= NOW()) ORDER BY delivered_at LIMIT 200`);
  const payouts = [];
  for (const row of rows) payouts.push(...await createDuePayouts(client, row.id));
  return payouts;
}

export async function freezeSettlement(client, orderKey, auth, reason) {
  const row = await settlementForUpdate(client, orderKey); assertActor(row, auth.sub, auth.role);
  if (['SETTLED','REFUNDED'].includes(row.state)) throw Object.assign(new Error('A completed settlement cannot be frozen'), { status: 409 });
  const dispute = await client.query(`INSERT INTO sokoeats_finance_disputes (settlement_id,opened_by,reason) VALUES ($1,$2,$3) RETURNING *`, [row.id, auth.sub, reason]);
  await client.query(`UPDATE sokoeats_order_settlements SET dispute_status = 'open', frozen_at = NOW(), updated_at = NOW() WHERE id = $1`, [row.id]);
  await client.query(`UPDATE sokoeats_payouts SET status = 'frozen', failure_reason = $2, updated_at = NOW() WHERE settlement_id = $1 AND status IN ('scheduled','queued')`, [row.id, `Dispute: ${reason}`]);
  return dispute.rows[0];
}

export async function resolveSettlementDispute(client, disputeId, auth, resolution, note, adjustmentTarget = null, adjustmentAmount = null) {
  if (!['admin','support'].includes(auth.role)) throw Object.assign(new Error('Only finance support can resolve disputes'), { status: 403 });
  const statusMap = { release: 'resolved_vendor', refund: 'resolved_customer', adjust: 'resolved_partial' };
  const outcome = statusMap[resolution];
  const dispute = (await client.query(`SELECT d.*,s.order_id,s.vendor_id,s.rider_user_id,s.vendor_net,s.rider_entitlement,v.name AS vendor_name FROM sokoeats_finance_disputes d JOIN sokoeats_order_settlements s ON s.id=d.settlement_id JOIN sokoeats_vendors v ON v.id=s.vendor_id WHERE d.id=$1 AND d.status='open' FOR UPDATE OF d,s`, [disputeId])).rows[0];
  if (!dispute) throw Object.assign(new Error('Open dispute not found'), { status: 404 });
  if (resolution === 'adjust') {
    const amount = Number(adjustmentAmount);
    if (!['vendor','rider'].includes(adjustmentTarget) || !Number.isInteger(amount) || amount === 0) throw Object.assign(new Error('A non-zero vendor or rider adjustment is required'), { status: 422 });
    const current = Number(adjustmentTarget === 'vendor' ? dispute.vendor_net : dispute.rider_entitlement);
    if (current + amount <= 0) throw Object.assign(new Error('Adjustment cannot reduce entitlement to or below zero'), { status: 422 });
    const payable = adjustmentTarget === 'vendor'
      ? { code: `vendor:${dispute.vendor_id}:payable`, name: `${dispute.vendor_name} payable`, accountType: 'liability', ownerType: 'vendor', ownerId: dispute.vendor_id }
      : riderPayable();
    await postJournal(client, { reference: `dispute:${dispute.id}:adjustment`, eventType: 'SETTLEMENT_ADJUSTMENT', orderId: dispute.order_id, description: note, createdBy: auth.sub, metadata: { adjustmentTarget, adjustmentAmount: amount }, entries: amount > 0 ? [
      { account: accounts.refunds, direction: 'debit', amount }, { account: payable, direction: 'credit', amount },
    ] : [
      { account: payable, direction: 'debit', amount: Math.abs(amount) }, { account: accounts.refunds, direction: 'credit', amount: Math.abs(amount) },
    ] });
    const column = adjustmentTarget === 'vendor' ? 'vendor_net' : 'rider_entitlement';
    await client.query(`UPDATE sokoeats_order_settlements SET ${column}=${column}+$2,updated_at=NOW() WHERE id=$1`, [dispute.settlement_id, amount]);
    await client.query(`UPDATE sokoeats_payouts SET amount=amount+$3,updated_at=NOW() WHERE settlement_id=$1 AND beneficiary_type=$2 AND status='frozen'`, [dispute.settlement_id, adjustmentTarget, amount]);
  }
  const { rows } = await client.query(`UPDATE sokoeats_finance_disputes SET status=$2,resolution_note=$3,resolved_by=$4,resolved_at=NOW() WHERE id=$1 RETURNING *`, [disputeId, outcome, note || null, auth.sub]);
  await client.query(`UPDATE sokoeats_order_settlements SET dispute_status=$2,frozen_at=CASE WHEN $3='refund' THEN frozen_at ELSE NULL END,updated_at=NOW() WHERE id=$1`, [dispute.settlement_id, outcome, resolution]);
  if (resolution !== 'refund') await client.query(`UPDATE sokoeats_payouts SET status='scheduled',failure_reason=NULL,updated_at=NOW() WHERE settlement_id=$1 AND status='frozen' AND recipient_code IS NOT NULL`, [dispute.settlement_id]);
  return rows[0];
}
export async function postPaidPayout(client, payout, actorUserId = null) {
  const settlement = (await client.query(`SELECT s.*,v.name AS vendor_name FROM sokoeats_order_settlements s JOIN sokoeats_vendors v ON v.id=s.vendor_id WHERE s.id=$1`, [payout.settlement_id])).rows[0];
  const payable = payout.beneficiary_type === 'vendor' ? vendorPayable({ id: settlement.vendor_id, name: settlement.vendor_name }) : riderPayable();
  await postJournal(client, { reference: `payout:${payout.reference}:paid`, eventType: payout.beneficiary_type === 'vendor' ? 'VENDOR_SETTLEMENT' : 'RIDER_SETTLEMENT', orderId: settlement.order_id, description: `${payout.beneficiary_type} payout ${payout.reference}`, createdBy: actorUserId, entries: [
    { account: payable, direction: 'debit', amount: payout.amount },
    { account: accounts.providerReceivable, direction: 'credit', amount: payout.amount },
  ] });
  const pending = await client.query(`SELECT COUNT(*)::int AS count FROM sokoeats_payouts WHERE settlement_id=$1 AND status <> 'paid'`, [settlement.id]);
  if (pending.rows[0].count === 0 && settlement.state === 'PAYOUT_ELIGIBLE') {
    await recordTransition(client, settlement, 'SETTLED', 'settled', actorUserId, {}, { settled_at: new Date() });
  }
}

export async function settlementDetails(client, orderKey) {
  const row = await settlementForUpdate(client, orderKey);
  const [events, payouts, journals] = await Promise.all([
    client.query('SELECT * FROM sokoeats_settlement_events WHERE settlement_id=$1 ORDER BY created_at', [row.id]),
    client.query('SELECT * FROM sokoeats_payouts WHERE settlement_id=$1 ORDER BY created_at', [row.id]),
    client.query(`SELECT j.*,COALESCE(json_agg(json_build_object('direction',l.direction,'amount',l.amount,'accountCode',a.code,'accountName',a.name) ORDER BY l.line_no) FILTER (WHERE l.id IS NOT NULL),'[]') AS lines FROM sokoeats_ledger_journals j LEFT JOIN sokoeats_ledger_lines l ON l.journal_id=j.id LEFT JOIN sokoeats_ledger_accounts a ON a.id=l.account_id WHERE j.order_id=$1 GROUP BY j.id ORDER BY j.posted_at`, [row.order_id]),
  ]);
  return { settlement: row, events: events.rows, payouts: payouts.rows, journals: journals.rows };
}

export { accounts, otpDigest, reference };
