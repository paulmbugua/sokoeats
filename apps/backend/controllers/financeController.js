import pool from '../config/db.js';
import { createDuePayouts, freezeSettlement, assignRider, confirmDeliveryOtp, markPickedUp, postJournal, postPaidPayout, processDueSettlements, resolveSettlementDispute, settlementDetails, vendorAccept, accounts, reference } from '../services/financeService.js';
import { createPaystackRecipient, initiatePaystackTransfer, mpesaReceiptFromIntent, requestMpesaReversal, requestPaystackRefund, verifyPaystackTransfer, verifyPaystackWebhook } from '../services/financeProvider.js';

function financeKey() {
  const key = process.env.FINANCE_DATA_KEY;
  if (!key || key.length < 24) throw Object.assign(new Error('FINANCE_DATA_KEY must contain at least 24 characters'), { status: 500 });
  return key;
}
function last4(value) { return String(value || '').replace(/\s/g, '').slice(-4); }
function publicCompliance(row) {
  if (!row) return null;
  return {
    vendorId: row.vendor_id,
    legalBusinessName: row.legal_business_name,
    registrationNumber: row.registration_number,
    kraPinMasked: `••••${row.kra_pin_last4}`,
    directorName: row.director_name,
    directorNationalIdMasked: `••••${row.director_national_id_last4}`,
    settlementMethod: row.settlement_method,
    settlementBankCode: row.settlement_bank_code,
    settlementAccountMasked: `••••${row.settlement_account_last4}`,
    pspProvider: row.psp_provider,
    pspSubaccountId: row.psp_subaccount_id,
    pspRecipientCode: row.psp_recipient_code,
    commissionRateBps: Number(row.commission_rate_bps),
    commissionAgreementVersion: row.commission_agreement_version,
    commissionAgreedAt: row.commission_agreed_at,
    verificationStatus: row.verification_status,
    verificationNote: row.verification_note,
    payoutStatus: row.payout_status,
    verifiedAt: row.verified_at,
    updatedAt: row.updated_at,
  };
}

async function ownedVendor(client, userId, lock = false) {
  const { rows } = await client.query(`SELECT * FROM sokoeats_vendors WHERE owner_user_id=$1 ORDER BY created_at LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [userId]);
  if (!rows[0]) throw Object.assign(new Error('Complete merchant onboarding before configuring finance'), { status: 409 });
  return rows[0];
}

export async function getVendorCompliance(req, res, next) {
  try {
    const vendor = await ownedVendor(pool, req.auth.sub);
    const { rows } = await pool.query('SELECT * FROM sokoeats_vendor_compliance WHERE vendor_id=$1', [vendor.id]);
    res.json({ vendor: { id: vendor.id, name: vendor.name, riskTier: vendor.risk_tier, verificationStatus: vendor.verification_status, payoutStatus: vendor.payout_status }, compliance: publicCompliance(rows[0]) });
  } catch (error) { next(error); }
}

export async function updateVendorCompliance(req, res, next) {
  const client = await pool.connect();
  try {
    const vendor = await ownedVendor(client, req.auth.sub);
    let recipientCode = req.body.pspRecipientCode || null;
    if (!recipientCode) {
      const recipient = await createPaystackRecipient({ name: req.body.legalBusinessName, method: req.body.settlementMethod, accountNumber: req.body.settlementAccount, bankCode: req.body.settlementBankCode });
      recipientCode = recipient.recipient_code;
    }
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO sokoeats_vendor_compliance
        (vendor_id,legal_business_name,registration_number,kra_pin_encrypted,kra_pin_last4,director_name,director_national_id_encrypted,director_national_id_last4,settlement_method,settlement_bank_code,settlement_account_encrypted,settlement_account_last4,psp_subaccount_id,psp_recipient_code,commission_rate_bps,commission_agreement_version,commission_agreed_at,commission_agreed_by,verification_status,payout_status)
       VALUES ($1,$2,$3,pgp_sym_encrypt($4,$5),$6,$7,pgp_sym_encrypt($8,$5),$9,$10,$11,pgp_sym_encrypt($12,$5),$13,$14,$15,$16,$17,NOW(),$18,'submitted','pending_verification')
       ON CONFLICT (vendor_id) DO UPDATE SET legal_business_name=EXCLUDED.legal_business_name,registration_number=EXCLUDED.registration_number,kra_pin_encrypted=EXCLUDED.kra_pin_encrypted,kra_pin_last4=EXCLUDED.kra_pin_last4,director_name=EXCLUDED.director_name,director_national_id_encrypted=EXCLUDED.director_national_id_encrypted,director_national_id_last4=EXCLUDED.director_national_id_last4,settlement_method=EXCLUDED.settlement_method,settlement_bank_code=EXCLUDED.settlement_bank_code,settlement_account_encrypted=EXCLUDED.settlement_account_encrypted,settlement_account_last4=EXCLUDED.settlement_account_last4,psp_subaccount_id=EXCLUDED.psp_subaccount_id,psp_recipient_code=EXCLUDED.psp_recipient_code,commission_rate_bps=EXCLUDED.commission_rate_bps,commission_agreement_version=EXCLUDED.commission_agreement_version,commission_agreed_at=NOW(),commission_agreed_by=EXCLUDED.commission_agreed_by,verification_status='submitted',verification_note=NULL,payout_status='pending_verification',updated_at=NOW()
       RETURNING *`,
      [vendor.id, req.body.legalBusinessName, req.body.registrationNumber, req.body.kraPin, financeKey(), last4(req.body.kraPin), req.body.directorName, req.body.directorNationalId, last4(req.body.directorNationalId), req.body.settlementMethod, req.body.settlementBankCode || null, req.body.settlementAccount, last4(req.body.settlementAccount), req.body.pspSubaccountId || null, recipientCode, vendor.commission_rate_bps || 1000, req.body.commissionAgreementVersion, req.auth.sub],
    );
    await client.query(`UPDATE sokoeats_vendors SET commission_rate_bps=$2,verification_status='submitted',payout_status='pending_verification',updated_at=NOW() WHERE id=$1`, [vendor.id, rows[0].commission_rate_bps]);
    await client.query(
      `INSERT INTO sokoeats_payout_profiles (owner_type,vendor_id,method,bank_code,account_number_encrypted,account_last4,recipient_code,schedule,status)
       VALUES ('vendor',$1,$2,$3,pgp_sym_encrypt($4,$5),$6,$7,'daily','pending_verification')
       ON CONFLICT (vendor_id) WHERE vendor_id IS NOT NULL DO UPDATE SET method=EXCLUDED.method,bank_code=EXCLUDED.bank_code,account_number_encrypted=EXCLUDED.account_number_encrypted,account_last4=EXCLUDED.account_last4,recipient_code=EXCLUDED.recipient_code,status='pending_verification',updated_at=NOW()`,
      [vendor.id, req.body.settlementMethod, req.body.settlementBankCode || null, req.body.settlementAccount, financeKey(), last4(req.body.settlementAccount), recipientCode],
    );
    await client.query('COMMIT');
    res.json({ compliance: publicCompliance(rows[0]), message: 'Compliance and payout details submitted for SokoEats verification.' });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); }
  finally { client.release(); }
}

export async function reviewVendorCompliance(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const status = req.body.status;
    const payoutStatus = status === 'verified' ? 'active' : status === 'suspended' ? 'frozen' : 'pending_verification';
    const { rows } = await client.query(
      `UPDATE sokoeats_vendor_compliance SET verification_status=$2,verification_note=$3,verified_by=$4,verified_at=CASE WHEN $2='verified' THEN NOW() ELSE verified_at END,payout_status=$5,updated_at=NOW() WHERE vendor_id=$1 RETURNING *`,
      [req.params.vendorId, status, req.body.note || null, req.auth.sub, payoutStatus],
    );
    if (!rows[0]) throw Object.assign(new Error('Vendor compliance submission not found'), { status: 404 });
    if (status === 'verified' && !rows[0].psp_recipient_code) throw Object.assign(new Error('A Paystack recipient code is required before payout activation'), { status: 409 });
    await client.query(`UPDATE sokoeats_vendors SET verification_status=$2,payout_status=$3,risk_tier=COALESCE($4,risk_tier),status=CASE WHEN $2='verified' THEN 'active' ELSE status END,updated_at=NOW() WHERE id=$1`, [req.params.vendorId, status, payoutStatus, req.body.riskTier || null]);
    await client.query(`UPDATE sokoeats_payout_profiles SET status=$2,verified_at=CASE WHEN $2='active' THEN NOW() ELSE verified_at END,updated_at=NOW() WHERE vendor_id=$1`, [req.params.vendorId, payoutStatus]);
    await client.query('COMMIT');
    res.json({ compliance: publicCompliance(rows[0]) });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); }
  finally { client.release(); }
}

export async function updateRiderPayoutProfile(req, res, next) {
  const client = await pool.connect();
  try {
    const rider = (await client.query(`SELECT * FROM sokoeats_users WHERE id=$1 AND role IN ('rider','courier')`, [req.auth.sub])).rows[0];
    if (!rider) throw Object.assign(new Error('Rider account required'), { status: 403 });
    const recipient = await createPaystackRecipient({ name: rider.name, method: req.body.method, accountNumber: req.body.accountNumber, bankCode: req.body.bankCode });
    const { rows } = await client.query(
      `INSERT INTO sokoeats_payout_profiles (owner_type,rider_user_id,method,bank_code,account_number_encrypted,account_last4,recipient_code,schedule,status,verified_at)
       VALUES ('rider',$1,$2,$3,pgp_sym_encrypt($4,$5),$6,$7,$8,'active',NOW())
       ON CONFLICT (rider_user_id) WHERE rider_user_id IS NOT NULL DO UPDATE SET method=EXCLUDED.method,bank_code=EXCLUDED.bank_code,account_number_encrypted=EXCLUDED.account_number_encrypted,account_last4=EXCLUDED.account_last4,recipient_code=EXCLUDED.recipient_code,schedule=EXCLUDED.schedule,status='active',verified_at=NOW(),updated_at=NOW() RETURNING *`,
      [rider.id, req.body.method, req.body.bankCode || null, req.body.accountNumber, financeKey(), last4(req.body.accountNumber), recipient.recipient_code, req.body.schedule],
    );
    res.json({ payoutProfile: { method: rows[0].method, accountMasked: `••••${rows[0].account_last4}`, schedule: rows[0].schedule, status: rows[0].status, recipientCode: rows[0].recipient_code } });
  } catch (error) { next(error); }
  finally { client.release(); }
}

async function withFinanceTransaction(handler) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await handler(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function acceptVendorOrder(req, res, next) { try { res.json({ settlement: await withFinanceTransaction((client) => vendorAccept(client, req.params.orderKey, req.auth)) }); } catch (e) { next(e); } }
export async function assignOrderRider(req, res, next) { try { res.json({ settlement: await withFinanceTransaction((client) => assignRider(client, req.params.orderKey, req.body.riderUserId || req.auth.sub, req.auth)) }); } catch (e) { next(e); } }
export async function pickupOrder(req, res, next) { try { res.json({ settlement: await withFinanceTransaction((client) => markPickedUp(client, req.params.orderKey, req.auth)) }); } catch (e) { next(e); } }
export async function deliverOrder(req, res, next) { try { res.json({ settlement: await withFinanceTransaction((client) => confirmDeliveryOtp(client, req.params.orderKey, req.body.otp, req.auth)) }); } catch (e) { next(e); } }
export async function openDispute(req, res, next) { try { res.status(201).json({ dispute: await withFinanceTransaction((client) => freezeSettlement(client, req.params.orderKey, req.auth, req.body.reason)) }); } catch (e) { next(e); } }
export async function resolveDispute(req, res, next) { try { res.json({ dispute: await withFinanceTransaction((client) => resolveSettlementDispute(client, req.params.disputeId, req.auth, req.body.resolution, req.body.note, req.body.adjustmentTarget, req.body.adjustmentAmount)) }); } catch (e) { next(e); } }
export async function processDue(req, res, next) { try { const payouts = await withFinanceTransaction(processDueSettlements); res.json({ created: payouts.length, payouts }); } catch (e) { next(e); } }

export async function getOrderFinance(req, res, next) {
  const client = await pool.connect();
  try {
    const details = await settlementDetails(client, req.params.orderKey);
    const role = req.auth.role;
    const allowed = ['admin','support'].includes(role) || (['vendor','merchant'].includes(role) && String(details.settlement.owner_user_id) === String(req.auth.sub)) || (role === 'rider' && String(details.settlement.rider_user_id) === String(req.auth.sub)) || (role === 'customer' && String(details.settlement.customer_user_id) === String(req.auth.sub));
    if (!allowed) return res.status(403).json({ message: 'This account cannot view the order finance record' });
    res.json(details);
  } catch (e) { next(e); } finally { client.release(); }
}

export async function getVendorFinanceDashboard(req, res, next) {
  try {
    const vendor = await ownedVendor(pool, req.auth.sub);
    const [summary, payouts, settlements, compliance] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(vendor_gross),0)::int gross,COALESCE(SUM(vendor_commission),0)::int commission,COALESCE(SUM(vendor_net),0)::int net,COALESCE(SUM(reserve_amount),0)::int reserves,COUNT(*)::int orders FROM sokoeats_order_settlements WHERE vendor_id=$1`, [vendor.id]),
      pool.query(`SELECT reference,amount,status,scheduled_for,paid_at,failure_reason FROM sokoeats_payouts WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 50`, [vendor.id]),
      pool.query(`SELECT s.state,s.vendor_net,s.vendor_release_at,s.dispute_status,o.code,o.status AS order_status FROM sokoeats_order_settlements s JOIN sokoeats_orders o ON o.id=s.order_id WHERE s.vendor_id=$1 ORDER BY s.created_at DESC LIMIT 50`, [vendor.id]),
      pool.query('SELECT * FROM sokoeats_vendor_compliance WHERE vendor_id=$1', [vendor.id]),
    ]);
    res.json({ vendor: { id: vendor.id, name: vendor.name, riskTier: vendor.risk_tier, commissionRateBps: vendor.commission_rate_bps }, summary: summary.rows[0], payouts: payouts.rows, settlements: settlements.rows, compliance: publicCompliance(compliance.rows[0]) });
  } catch (e) { next(e); }
}

export async function getRiderFinanceDashboard(req, res, next) {
  try {
    const [summary, payouts, profile] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(rider_entitlement),0)::int earned,COUNT(*) FILTER (WHERE state='SETTLED')::int settled_deliveries,COUNT(*)::int deliveries FROM sokoeats_order_settlements WHERE rider_user_id=$1`, [req.auth.sub]),
      pool.query(`SELECT reference,amount,status,scheduled_for,paid_at,failure_reason FROM sokoeats_payouts WHERE rider_user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.auth.sub]),
      pool.query(`SELECT method,account_last4,schedule,status,recipient_code FROM sokoeats_payout_profiles WHERE rider_user_id=$1`, [req.auth.sub]),
    ]);
    res.json({ summary: summary.rows[0], payouts: payouts.rows, payoutProfile: profile.rows[0] ? { ...profile.rows[0], accountMasked: `••••${profile.rows[0].account_last4}`, account_last4: undefined } : null });
  } catch (e) { next(e); }
}

export async function getAdminFinanceDashboard(_req, res, next) {
  try {
    const [accountsResult, payoutSummary, settlementSummary, complianceSummary, submissions, payouts, riders] = await Promise.all([
      pool.query(`SELECT a.code,a.name,a.account_type,a.owner_type,COALESCE(SUM(CASE WHEN l.direction='debit' THEN l.amount ELSE -l.amount END),0)::bigint AS debit_balance FROM sokoeats_ledger_accounts a LEFT JOIN sokoeats_ledger_lines l ON l.account_id=a.id GROUP BY a.id ORDER BY a.code`),
      pool.query(`SELECT status,beneficiary_type,COUNT(*)::int count,COALESCE(SUM(amount),0)::int amount FROM sokoeats_payouts GROUP BY status,beneficiary_type ORDER BY status,beneficiary_type`),
      pool.query(`SELECT state,COUNT(*)::int count,COALESCE(SUM(vendor_net+rider_entitlement),0)::int exposure FROM sokoeats_order_settlements GROUP BY state ORDER BY state`),
      pool.query(`SELECT verification_status,payout_status,COUNT(*)::int count FROM sokoeats_vendor_compliance GROUP BY verification_status,payout_status`),
      pool.query(`SELECT vc.*,v.name AS vendor_name,v.risk_tier,u.name AS owner_name,u.email AS owner_email FROM sokoeats_vendor_compliance vc JOIN sokoeats_vendors v ON v.id=vc.vendor_id LEFT JOIN sokoeats_users u ON u.id=v.owner_user_id ORDER BY CASE vc.verification_status WHEN 'submitted' THEN 0 WHEN 'under_review' THEN 1 ELSE 2 END,vc.updated_at DESC LIMIT 100`),
      pool.query(`SELECT p.reference,p.beneficiary_type,p.amount,p.status,p.scheduled_for,p.failure_reason,v.name AS vendor_name,u.name AS rider_name FROM sokoeats_payouts p LEFT JOIN sokoeats_vendors v ON v.id=p.vendor_id LEFT JOIN sokoeats_users u ON u.id=p.rider_user_id ORDER BY p.scheduled_for DESC LIMIT 100`),
      pool.query(`SELECT id,name,email,status FROM sokoeats_users WHERE role IN ('rider','courier') AND status='active' ORDER BY name`),
    ]);
    res.json({
      accounts: accountsResult.rows.map((row) => ({ ...row, balance: ['liability','revenue','equity'].includes(row.account_type) ? -Number(row.debit_balance) : Number(row.debit_balance), debit_balance: undefined })),
      payoutSummary: payoutSummary.rows,
      settlementSummary: settlementSummary.rows,
      complianceSummary: complianceSummary.rows,
      vendorSubmissions: submissions.rows.map((row) => ({ ...publicCompliance(row), vendorName: row.vendor_name, ownerName: row.owner_name, ownerEmail: row.owner_email, riskTier: row.risk_tier })),
      payouts: payouts.rows,
      riders: riders.rows,
    });
  } catch (e) { next(e); }
}
export async function executePayout(req, res, next) {
  let payout;
  try {
    payout = await withFinanceTransaction(async (client) => {
      const { rows } = await client.query(`SELECT * FROM sokoeats_payouts WHERE id=$1 OR reference=$1 FOR UPDATE`, [req.params.payoutKey]);
      if (!rows[0]) throw Object.assign(new Error('Payout not found'), { status: 404 });
      if (!['scheduled','failed'].includes(rows[0].status)) throw Object.assign(new Error(`Payout cannot be sent from ${rows[0].status}`), { status: 409 });
      const settlement = (await client.query('SELECT * FROM sokoeats_order_settlements WHERE id=$1', [rows[0].settlement_id])).rows[0];
      if (settlement.dispute_status === 'open' || settlement.frozen_at) throw Object.assign(new Error('Payout is frozen by an open dispute'), { status: 409 });
      const updated = await client.query(`UPDATE sokoeats_payouts SET status='processing',failure_reason=NULL,updated_at=NOW() WHERE id=$1 RETURNING *`, [rows[0].id]);
      return updated.rows[0];
    });
    const provider = await initiatePaystackTransfer({ reference: payout.reference, amount: payout.amount, recipientCode: payout.recipient_code, reason: `SokoEats ${payout.beneficiary_type} settlement` });
    const status = provider.status === 'success' ? 'paid' : provider.status === 'otp' ? 'otp' : provider.status === 'failed' ? 'failed' : 'queued';
    const updated = await withFinanceTransaction(async (client) => {
      const result = await client.query(`UPDATE sokoeats_payouts SET status=$2,provider_reference=$3,provider_payload=provider_payload || $4::jsonb,paid_at=CASE WHEN $2='paid' THEN NOW() ELSE paid_at END,updated_at=NOW() WHERE id=$1 RETURNING *`, [payout.id, status, provider.transfer_code || null, provider]);
      if (status === 'paid') await postPaidPayout(client, result.rows[0], req.auth.sub);
      return result.rows[0];
    });
    res.json({ payout: updated });
  } catch (error) {
    if (payout?.id) await pool.query(`UPDATE sokoeats_payouts SET status='failed',failure_reason=$2,provider_payload=provider_payload || $3::jsonb,updated_at=NOW() WHERE id=$1`, [payout.id, error.message, error.providerPayload || {}]).catch(() => {});
    next(error);
  }
}

export async function refreshPayout(req, res, next) {
  try {
    const payout = (await pool.query(`SELECT * FROM sokoeats_payouts WHERE id=$1 OR reference=$1`, [req.params.payoutKey])).rows[0];
    if (!payout) return res.status(404).json({ message: 'Payout not found' });
    const provider = await verifyPaystackTransfer(payout.reference);
    const status = provider.status === 'success' ? 'paid' : provider.status === 'failed' || provider.status === 'reversed' ? 'failed' : 'processing';
    const updated = await withFinanceTransaction(async (client) => {
      const result = await client.query(`UPDATE sokoeats_payouts SET status=$2,provider_reference=COALESCE($3,provider_reference),provider_payload=provider_payload || $4::jsonb,paid_at=CASE WHEN $2='paid' THEN COALESCE(paid_at,NOW()) ELSE paid_at END,updated_at=NOW() WHERE id=$1 RETURNING *`, [payout.id, status, provider.transfer_code || null, provider]);
      if (status === 'paid') await postPaidPayout(client, result.rows[0], req.auth.sub);
      return result.rows[0];
    });
    res.json({ payout: updated });
  } catch (e) { next(e); }
}

async function completeRefund(client, refund, providerPayload = {}) {
  const existing = await client.query(`SELECT 1 FROM sokoeats_ledger_journals WHERE reference=$1`, [`refund:${refund.reference}:paid`]);
  if (!existing.rows[0]) {
    const finance = (await client.query(`SELECT s.*,o.discount_amount,v.name AS vendor_name FROM sokoeats_order_settlements s JOIN sokoeats_orders o ON o.id=s.order_id JOIN sokoeats_vendors v ON v.id=s.vendor_id WHERE s.order_id=$1 FOR UPDATE OF s`, [refund.order_id])).rows[0];
    if (!finance) throw Object.assign(new Error('Settlement record is required to post a refund'), { status: 409 });
    const payment = (await client.query('SELECT amount FROM sokoeats_payment_intents WHERE id=$1', [refund.payment_intent_id])).rows[0];
    const ratio = Math.min(1, Number(refund.amount) / Number(payment.amount));
    const amounts = {
      vendor: Math.round(Number(finance.vendor_net) * ratio),
      rider: Math.round(Number(finance.rider_entitlement) * ratio),
      service: Math.round(Number(finance.service_fee) * ratio),
      commission: Math.round(Number(finance.vendor_commission) * ratio),
      promotion: Math.round(Number(finance.discount_amount || 0) * ratio),
    };
    const entries = [
      ...(amounts.vendor ? [{ account: { code: `vendor:${finance.vendor_id}:payable`, name: `${finance.vendor_name} payable`, accountType: 'liability', ownerType: 'vendor', ownerId: finance.vendor_id }, direction: 'debit', amount: amounts.vendor }] : []),
      ...(amounts.rider ? [{ account: { code: 'riders:delivery:payable', name: 'Rider delivery entitlements', accountType: 'liability', ownerType: 'rider' }, direction: 'debit', amount: amounts.rider }] : []),
      ...(amounts.service ? [{ account: accounts.service, direction: 'debit', amount: amounts.service }] : []),
      ...(amounts.commission ? [{ account: accounts.commission, direction: 'debit', amount: amounts.commission }] : []),
      { account: accounts.providerReceivable, direction: 'credit', amount: refund.amount },
      ...(amounts.promotion ? [{ account: accounts.promotion, direction: 'credit', amount: amounts.promotion }] : []),
    ];
    const debits = entries.filter((entry) => entry.direction === 'debit').reduce((sum, entry) => sum + entry.amount, 0);
    const credits = entries.filter((entry) => entry.direction === 'credit').reduce((sum, entry) => sum + entry.amount, 0);
    if (credits > debits) entries.push({ account: accounts.refunds, direction: 'debit', amount: credits - debits, description: 'Refund allocation rounding or adjustment' });
    if (debits > credits) entries.push({ account: accounts.refunds, direction: 'credit', amount: debits - credits, description: 'Refund allocation rounding or adjustment' });
    await postJournal(client, { reference: `refund:${refund.reference}:paid`, eventType: 'CUSTOMER_REFUND', orderId: refund.order_id, paymentIntentId: refund.payment_intent_id, description: `Original-provider refund ${refund.reference}`, createdBy: refund.requested_by, metadata: { reason: refund.reason, ratio }, entries });
  }
  await client.query(`UPDATE sokoeats_refunds SET status='paid',provider_payload=provider_payload || $2::jsonb,processed_at=NOW(),updated_at=NOW() WHERE id=$1`, [refund.id, providerPayload]);
  await client.query(`UPDATE sokoeats_orders SET payment_status='refunded',finance_state='REFUNDED',updated_at=NOW() WHERE id=$1`, [refund.order_id]);
  const settlement = (await client.query(`UPDATE sokoeats_order_settlements SET state='REFUNDED',updated_at=NOW() WHERE order_id=$1 RETURNING *`, [refund.order_id])).rows[0];
  await client.query(`INSERT INTO sokoeats_settlement_events (settlement_id,from_state,to_state,event_type,actor_user_id,metadata) VALUES ($1,$2,'REFUNDED','original_provider_refund',$3,$4)`, [settlement.id, finance.state, refund.requested_by, { refundReference: refund.reference, amount: refund.amount }]);
}
export async function requestOrderRefund(req, res, next) {
  let refund;
  try {
    refund = await withFinanceTransaction(async (client) => {
      const details = await settlementDetails(client, req.params.orderKey);
      const s = details.settlement;
      const allowed = ['admin','support'].includes(req.auth.role) || (req.auth.role === 'customer' && String(s.customer_user_id) === String(req.auth.sub));
      if (!allowed) throw Object.assign(new Error('This account cannot request the refund'), { status: 403 });
      if (s.state === 'SETTLED') throw Object.assign(new Error('Settled orders require finance support review before refund'), { status: 409 });
      const paidPayouts = await client.query(`SELECT COUNT(*)::int AS count FROM sokoeats_payouts WHERE settlement_id=$1 AND status='paid'`, [s.id]);
      if (paidPayouts.rows[0].count > 0) throw Object.assign(new Error('A beneficiary has already been paid. Finance support must post a recovery adjustment before refunding.'), { status: 409 });
      const payment = (await client.query('SELECT * FROM sokoeats_payment_intents WHERE id=$1', [s.payment_intent_id])).rows[0];
      const amount = req.body.amount || payment.amount;
      if (amount > payment.amount) throw Object.assign(new Error('Refund cannot exceed the original payment'), { status: 422 });
      await freezeSettlement(client, req.params.orderKey, req.auth, `Refund requested: ${req.body.reason}`);
      const result = await client.query(`INSERT INTO sokoeats_refunds (reference,order_id,payment_intent_id,amount,reason,provider,requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [reference('sko-refund'), s.order_id, s.payment_intent_id, amount, req.body.reason, payment.provider, req.auth.sub]);
      return { ...result.rows[0], payment };
    });
    let provider;
    if (refund.provider === 'paystack') provider = await requestPaystackRefund({ transactionReference: refund.payment.reference, amount: refund.amount });
    else provider = await requestMpesaReversal({ transactionId: mpesaReceiptFromIntent(refund.payment), amount: refund.amount, reference: refund.reference });
    const providerStatus = String(provider.status || provider.ResponseDescription || '').toLowerCase();
    const paid = ['processed','success','successful'].includes(providerStatus);
    await withFinanceTransaction(async (client) => {
      if (paid) await completeRefund(client, refund, provider);
      else await client.query(`UPDATE sokoeats_refunds SET status='submitted',provider_reference=$2,provider_payload=$3,updated_at=NOW() WHERE id=$1`, [refund.id, provider.id || provider.ConversationID || null, provider]);
    });
    res.status(201).json({ refund: { ...refund, payment: undefined, status: paid ? 'paid' : 'submitted', providerPayload: provider } });
  } catch (error) {
    if (refund?.id) await pool.query(`UPDATE sokoeats_refunds SET status='failed',provider_payload=$2,updated_at=NOW() WHERE id=$1`, [refund.id, error.providerPayload || { message: error.message }]).catch(() => {});
    next(error);
  }
}

export async function paystackTransferWebhook(req, res) {
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));
  if (!verifyPaystackWebhook(raw, req.get('x-paystack-signature'))) return res.status(401).json({ message: 'Invalid Paystack signature' });
  const event = req.body;
  if (!['transfer.success','transfer.failed','transfer.reversed','refund.processed','refund.failed'].includes(event.event)) return res.json({ ok: true, ignored: true });
  await withFinanceTransaction(async (client) => {
    if (event.event.startsWith('transfer.')) {
      const status = event.event === 'transfer.success' ? 'paid' : 'failed';
      const result = await client.query(`UPDATE sokoeats_payouts SET status=$2,provider_reference=COALESCE($3,provider_reference),provider_payload=provider_payload || $4::jsonb,paid_at=CASE WHEN $2='paid' THEN COALESCE(paid_at,NOW()) ELSE paid_at END,failure_reason=CASE WHEN $2='failed' THEN $5 ELSE failure_reason END,updated_at=NOW() WHERE reference=$1 RETURNING *`, [event.data.reference, status, event.data.transfer_code || null, event.data, event.data.reason || event.event]);
      if (result.rows[0] && status === 'paid') await postPaidPayout(client, result.rows[0]);
    } else {
      const refund = (await client.query(`SELECT * FROM sokoeats_refunds WHERE provider_reference=$1 OR reference=$1`, [String(event.data.id || event.data.transaction?.reference || '')])).rows[0];
      if (refund && event.event === 'refund.processed') await completeRefund(client, refund, event.data);
      else if (refund) await client.query(`UPDATE sokoeats_refunds SET status='failed',provider_payload=provider_payload || $2::jsonb,updated_at=NOW() WHERE id=$1`, [refund.id, event.data]);
    }
  });
  res.json({ ok: true });
}

export async function mpesaRefundCallback(req, res) {
  const payload = req.body?.Result || req.body;
  const conversationId = payload?.ConversationID || payload?.OriginatorConversationID;
  const resultCode = Number(payload?.ResultCode);
  if (!conversationId) return res.status(422).json({ message: 'ConversationID is required' });
  await withFinanceTransaction(async (client) => {
    const refund = (await client.query(`SELECT * FROM sokoeats_refunds WHERE provider_reference=$1`, [conversationId])).rows[0];
    if (!refund) return;
    if (resultCode === 0) await completeRefund(client, refund, payload);
    else await client.query(`UPDATE sokoeats_refunds SET status='failed',provider_payload=provider_payload || $2::jsonb,updated_at=NOW() WHERE id=$1`, [refund.id, payload]);
  });
  res.json({ ok: true });
}
