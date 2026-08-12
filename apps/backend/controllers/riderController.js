import pool from '../config/db.js';
import { getScreenPayload, saveScreenPayload } from '../models/screenPayloadModel.js';
import { confirmGatewayPayment, createPaymentPrompt, normalizeKenyanPhone, paymentReference } from '../services/paymentGateway.js';

const providerMessage = (payload = {}) => payload.mpesaCallback?.ResultDesc || payload.mpesaQuery?.ResultDesc || payload.CustomerMessage || payload.ResponseDescription || payload.initiationError || null;

function paymentIntentJson(row) {
  return {
    reference: row.reference,
    method: row.method,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    phone: row.phone,
    providerReference: row.provider_reference,
    actionUrl: row.action_url,
    promptMessage: row.prompt_message,
    providerMessage: providerMessage(row.provider_payload),
    simulation: Boolean(row.provider_payload?.simulation),
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

function parseMerchantQrPayload(raw) {
  const text = String(raw || '').trim();
  if (!text) throw Object.assign(new Error('A scanned SokoEats merchant QR payload is required'), { status: 422 });
  try {
    return JSON.parse(text);
  } catch {
    try {
      const url = new URL(text);
      const payload = Object.fromEntries(url.searchParams.entries());
      if (url.protocol === 'sokoeats:' && url.hostname && !payload.vendorSlug) payload.vendorSlug = url.hostname === 'pay' ? url.searchParams.get('vendorSlug') : url.hostname;
      return payload;
    } catch {
      throw Object.assign(new Error('Invalid SokoEats merchant QR payload'), { status: 422 });
    }
  }
}

async function resolveScanVendor(body) {
  const qr = parseMerchantQrPayload(body.merchantQr);
  const vendorId = String(body.vendorId || qr.vendorId || qr.merchantId || '').trim();
  const vendorSlug = String(body.vendorSlug || qr.vendorSlug || qr.slug || qr.merchantSlug || '').trim().toLowerCase();
  const vendorName = String(body.vendorName || qr.vendorName || qr.merchantName || qr.name || '').trim();
  const params = [];
  const clauses = [];
  if (vendorId) {
    params.push(vendorId);
    clauses.push(`id::text = ${params.length}`);
  }
  if (vendorSlug) {
    params.push(vendorSlug);
    clauses.push(`slug = ${params.length}`);
  }
  if (!clauses.length && vendorName) {
    params.push(vendorName.toLowerCase());
    clauses.push(`lower(name) = ${params.length}`);
  }
  if (!clauses.length) throw Object.assign(new Error('Merchant identity is missing from this QR code'), { status: 422 });
  const { rows } = await pool.query(`SELECT * FROM sokoeats_vendors WHERE status = 'active' AND (${clauses.join(' OR ')}) LIMIT 1`, params);
  if (!rows[0]) throw Object.assign(new Error('Scanned merchant is not active on SokoEats'), { status: 404 });
  return { vendor: rows[0], qr };
}

async function buildScanReceipt(intent, scanPayment) {
  const success = await getScreenPayload('payment_successful');
  success.title = 'Payment successful';
  success.body = 'SokoPay scan payment confirmed.';
  success.paidAt = new Date().toISOString();
  success.notes = scanPayment.notes || '';
  success.amount = 'KSh ' + Number(intent.amount).toLocaleString('en-KE') + '.00';
  success.vendor = scanPayment.vendor_name;
  success.transactionId = intent.reference;
  success.message = 'Receipt issued after gateway verification.';
  const history = await getScreenPayload('full_transaction_history');
  history.transactions.unshift({
    label: 'Soko Pay - ' + scanPayment.vendor_name,
    time: 'Just now',
    id: intent.reference,
    status: 'Completed',
    amount: '-' + Number(intent.amount).toLocaleString('en-KE') + '.00',
    tone: 'debit',
  });
  await saveScreenPayload('full_transaction_history', history);
  return { success: await saveScreenPayload('payment_successful', success), history };
}


export async function riderHome(_req, res, next) {
  try {
    res.json({ riderHome: await getScreenPayload('rider_home') });
  } catch (err) { next(err); }
}

export async function activeDelivery(_req, res, next) {
  try {
    res.json({ delivery: await getScreenPayload('active_delivery_to_vendor') });
  } catch (err) { next(err); }
}

export async function acceptDeliveryRequest(req, res, next) {
  try {
    const home = await getScreenPayload('rider_home');
    if (home.request.id !== req.params.id) return res.status(404).json({ message: 'Delivery request not found' });
    home.request.status = 'accepted';
    home.request.countdownSeconds = 0;
    await saveScreenPayload('rider_home', home);
    const delivery = await getScreenPayload('active_delivery_to_vendor');
    delivery.order.status = 'Heading to Vendor';
    res.json({ riderHome: home, delivery });
  } catch (err) { next(err); }
}

export async function markArrived(req, res, next) {
  try {
    const delivery = await getScreenPayload('active_delivery_to_vendor');
    if (delivery.order.code !== req.params.orderCode) return res.status(404).json({ message: 'Delivery not found' });
    delivery.arrived = true;
    delivery.order.status = 'At Vendor';
    delivery.order.progressLabel = '2/3';
    delivery.order.progressPercent = 66;
    res.json({ delivery: await saveScreenPayload('active_delivery_to_vendor', delivery) });
  } catch (err) { next(err); }
}

export async function confirmPickup(req, res, next) {
  try {
    const delivery = await getScreenPayload('active_delivery_to_vendor');
    if (delivery.order.code !== req.params.orderCode) return res.status(404).json({ message: 'Delivery not found' });
    delivery.arrived = true;
    delivery.pickupConfirmed = true;
    delivery.order.status = 'Picked Up';
    delivery.order.progressLabel = '3/3';
    delivery.order.progressPercent = 100;
    res.json({ delivery: await saveScreenPayload('active_delivery_to_vendor', delivery) });
  } catch (err) { next(err); }
}


export async function riderOnboarding(_req, res, next) {
  try {
    const screens = {};
    for (const key of ['welcome_to_sokoeats_rider', 'personal_information', 'vehicle_verification', 'document_uploads', 'application_success']) {
      screens[key] = await getScreenPayload(key);
    }
    res.json({ onboarding: screens });
  } catch (err) { next(err); }
}

export async function updateRiderOnboardingStep(req, res, next) {
  try {
    const payload = await getScreenPayload(req.params.screenKey);
    payload.submission = { ...(payload.submission || {}), ...req.body, updatedAt: new Date().toISOString() };
    res.json({ screen: await saveScreenPayload(req.params.screenKey, payload) });
  } catch (err) { next(err); }
}

export async function riderEarnings(_req, res, next) {
  try {
    res.json({ earnings: await getScreenPayload('rider_earnings_dashboard') });
  } catch (err) { next(err); }
}

export async function riderPayoutConfirmation(_req, res, next) {
  try {
    res.json({ payout: await getScreenPayload('m_pesa_payout_confirmation') });
  } catch (err) { next(err); }
}

export async function requestRiderPayout(_req, res, next) {
  try {
    const payout = await getScreenPayload('m_pesa_payout_confirmation');
    payout.requestedAt = new Date().toISOString();
    res.status(201).json({ payout: await saveScreenPayload('m_pesa_payout_confirmation', payout) });
  } catch (err) { next(err); }
}

export async function riderLeaderboard(_req, res, next) {
  try {
    res.json({ leaderboard: await getScreenPayload('rider_leaderboard') });
  } catch (err) { next(err); }
}

export async function riderProfileRatings(_req, res, next) {
  try {
    res.json({ profile: await getScreenPayload('rider_profile_ratings') });
  } catch (err) { next(err); }
}


export async function riderSupportTrainingSuite(_req, res, next) {
  try {
    const screens = {};
    for (const key of ["safety_incident_report","rider_help_center","live_chat_support","order_details_sko_1294","rider_training_dashboard","customer_service_lesson","rider_training_quiz","quiz_results_feedback"]) screens[key] = await getScreenPayload(key);
    res.json({ suite: screens });
  } catch (err) { next(err); }
}

export async function riderHelpCenter(_req, res, next) {
  try { res.json({ helpCenter: await getScreenPayload('rider_help_center') }); } catch (err) { next(err); }
}

export async function liveChatSupport(_req, res, next) {
  try { res.json({ chat: await getScreenPayload('live_chat_support') }); } catch (err) { next(err); }
}

export async function sendRiderChatMessage(req, res, next) {
  try {
    const chat = await getScreenPayload('live_chat_support');
    chat.messages.push({ sender: 'You', body: req.body.body, time: new Intl.DateTimeFormat('en-KE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Nairobi' }).format(new Date()), mine: true });
    res.status(201).json({ chat: await saveScreenPayload('live_chat_support', chat) });
  } catch (err) { next(err); }
}

export async function safetyIncidentReport(_req, res, next) {
  try { res.json({ incident: await getScreenPayload('safety_incident_report') }); } catch (err) { next(err); }
}

export async function submitSafetyIncident(req, res, next) {
  try {
    const incident = await getScreenPayload('safety_incident_report');
    incident.lastSubmission = { ...req.body, submittedAt: new Date().toISOString(), status: 'submitted' };
    res.status(201).json({ incident: await saveScreenPayload('safety_incident_report', incident) });
  } catch (err) { next(err); }
}

export async function riderOrderDetails(_req, res, next) {
  try { res.json({ orderDetails: await getScreenPayload('order_details_sko_1294') }); } catch (err) { next(err); }
}

export async function riderTrainingDashboard(_req, res, next) {
  try { res.json({ training: await getScreenPayload('rider_training_dashboard') }); } catch (err) { next(err); }
}

export async function riderTrainingLesson(_req, res, next) {
  try { res.json({ lesson: await getScreenPayload('customer_service_lesson') }); } catch (err) { next(err); }
}

export async function riderTrainingQuiz(_req, res, next) {
  try { res.json({ quiz: await getScreenPayload('rider_training_quiz') }); } catch (err) { next(err); }
}

export async function submitTrainingQuiz(req, res, next) {
  try {
    const quiz = await getScreenPayload('rider_training_quiz');
    const results = await getScreenPayload('quiz_results_feedback');
    results.lastAnswer = { selectedIndex: req.body.selectedIndex, correct: req.body.selectedIndex === quiz.correctIndex, submittedAt: new Date().toISOString() };
    res.status(201).json({ results: await saveScreenPayload('quiz_results_feedback', results) });
  } catch (err) { next(err); }
}

export async function quizResultsFeedback(_req, res, next) {
  try { res.json({ results: await getScreenPayload('quiz_results_feedback') }); } catch (err) { next(err); }
}


export async function riderReferralSuite(_req, res, next) {
  try {
    const screens = {};
    for (const key of ["invite_friends_earn_rewards","select_contacts","invitations_sent_success","whatsapp_sharing_template","my_referral_rewards","incident_confirmation_next_steps","support_ticket_history","resolved_ticket_details_inc_82941"]) screens[key] = await getScreenPayload(key);
    res.json({ referrals: screens });
  } catch (err) { next(err); }
}

export async function sendReferralInvitations(req, res, next) {
  try {
    const success = await getScreenPayload('invitations_sent_success');
    success.sentContactIds = req.body.contactIds;
    success.sentCount = req.body.contactIds.length;
    success.sentAt = new Date().toISOString();
    res.status(201).json({ success: await saveScreenPayload('invitations_sent_success', success) });
  } catch (err) { next(err); }
}

export async function referralRewards(_req, res, next) {
  try { res.json({ rewards: await getScreenPayload('my_referral_rewards') }); } catch (err) { next(err); }
}

export async function incidentConfirmation(_req, res, next) {
  try { res.json({ confirmation: await getScreenPayload('incident_confirmation_next_steps') }); } catch (err) { next(err); }
}

export async function supportTicketHistory(_req, res, next) {
  try { res.json({ ticketHistory: await getScreenPayload('support_ticket_history') }); } catch (err) { next(err); }
}

export async function resolvedTicketDetails(_req, res, next) {
  try { res.json({ resolvedTicket: await getScreenPayload('resolved_ticket_details_inc_82941') }); } catch (err) { next(err); }
}


export async function walletPaymentSuite(_req, res, next) {
  try {
    const screens = {};
    for (const key of ["sokoeats_wallet","top_up_wallet","withdraw_to_m_pesa","scan_qr_code","confirm_payment","payment_successful","full_transaction_history"]) screens[key] = await getScreenPayload(key);
    res.json({ wallet: screens });
  } catch (err) { next(err); }
}

export async function topUpWallet(req, res, next) {
  try {
    const topUp = await getScreenPayload('top_up_wallet');
    topUp.lastTopUp = { ...req.body, status: 'stk_push_sent', requestedAt: new Date().toISOString() };
    const history = await getScreenPayload('full_transaction_history');
    history.transactions.unshift({ label: 'M-Pesa Top Up', time: 'Just now', id: 'TXN-TOPUP-' + Date.now(), status: 'Pending', amount: '+' + Number(req.body.amount).toLocaleString('en-KE') + '.00', tone: 'credit' });
    await saveScreenPayload('full_transaction_history', history);
    res.status(201).json({ topUp: await saveScreenPayload('top_up_wallet', topUp), history });
  } catch (err) { next(err); }
}

export async function withdrawWallet(req, res, next) {
  try {
    const withdrawal = await getScreenPayload('withdraw_to_m_pesa');
    withdrawal.lastWithdrawal = { ...req.body, status: 'processing', requestedAt: new Date().toISOString() };
    withdrawal.summary = { amount: 'KES ' + Number(req.body.amount).toLocaleString('en-KE'), fee: 'KES 0.00', total: 'KES ' + Number(req.body.amount).toLocaleString('en-KE') };
    res.status(201).json({ withdrawal: await saveScreenPayload('withdraw_to_m_pesa', withdrawal) });
  } catch (err) { next(err); }
}

export async function confirmScanPayment(req, res, next) {
  const reference = paymentReference(req.body.paymentMethod);
  try {
    const { vendor, qr } = await resolveScanVendor(req.body);
    const amount = Math.round(Number(req.body.amount));
    const method = req.body.paymentMethod;
    const phone = normalizeKenyanPhone(req.body.phone);
    const currency = req.body.currency || 'KES';
    const provider = method === 'mpesa' ? 'mpesa' : 'paystack';

    await pool.query(
      `INSERT INTO sokoeats_payment_intents
        (reference, method, provider, amount, currency, status, phone, customer_email, provider_payload)
       VALUES ($1,$2,$3,$4,$5,'requires_action',$6,$7,$8)`,
      [reference, method, provider, amount, currency, phone, req.body.email || null, { scanPayment: { merchantQr: req.body.merchantQr, qr, vendorId: vendor.id, vendorSlug: vendor.slug, notes: req.body.notes || null } }],
    );

    const prompt = await createPaymentPrompt({
      method,
      amount,
      currency,
      phone,
      email: req.body.email,
      customerName: req.body.customerName,
      reference,
      callbackUrl: req.body.callbackUrl,
    });
    if (prompt.payload?.simulation) throw Object.assign(new Error('Real payment gateway credentials are required for Scan to Pay'), { status: 503 });

    const { rows } = await pool.query(
      `UPDATE sokoeats_payment_intents
       SET provider = $1,
           status = $2,
           provider_reference = $3,
           action_url = $4,
           prompt_message = $5,
           provider_payload = provider_payload || $6::jsonb,
           updated_at = NOW()
       WHERE reference = $7
       RETURNING *`,
      [prompt.provider, prompt.status, prompt.providerReference || null, prompt.actionUrl || null, prompt.promptMessage, prompt.payload || {}, reference],
    );

    await pool.query(
      `INSERT INTO sokoeats_scan_payments
        (payment_reference, vendor_id, vendor_slug, vendor_name, amount, currency, status, notes, qr_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [reference, vendor.id, vendor.slug, vendor.name, amount, currency, rows[0].status, req.body.notes || null, { raw: req.body.merchantQr, parsed: qr }],
    );

    res.status(201).json({ payment: paymentIntentJson(rows[0]) });
  } catch (err) { next(err); }
}

export async function confirmScanPaymentStatus(req, res, next) {
  try {
    const existing = await pool.query(
      `SELECT pi.*, sp.id AS scan_id, sp.vendor_name, sp.notes
         FROM sokoeats_payment_intents pi
         JOIN sokoeats_scan_payments sp ON sp.payment_reference = pi.reference
        WHERE pi.reference = $1
        LIMIT 1`,
      [req.params.reference],
    );
    if (!existing.rows[0]) return res.status(404).json({ message: 'Scan payment reference not found' });
    let intent = existing.rows[0];
    if (intent.status !== 'paid') {
      const confirmation = await confirmGatewayPayment(intent);
      const nextStatus = confirmation.status || intent.status;
      const updated = await pool.query(
        `UPDATE sokoeats_payment_intents
         SET status = $1,
             provider_reference = COALESCE($2, provider_reference),
             provider_payload = provider_payload || $3::jsonb,
             paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
             updated_at = NOW()
         WHERE reference = $4
         RETURNING *`,
        [nextStatus, confirmation.providerReference || null, confirmation.payload || {}, req.params.reference],
      );
      intent = { ...intent, ...updated.rows[0] };
    }
    await pool.query(
      `UPDATE sokoeats_scan_payments
       SET status = $1,
           paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
       WHERE payment_reference = $2`,
      [intent.status, req.params.reference],
    );
    if (intent.status !== 'paid') return res.json({ payment: paymentIntentJson(intent) });
    const receipt = await buildScanReceipt(intent, { vendor_name: existing.rows[0].vendor_name, notes: existing.rows[0].notes });
    res.json({ payment: paymentIntentJson(intent), ...receipt });
  } catch (err) { next(err); }
}

export async function transactionHistory(_req, res, next) {
  try { res.json({ history: await getScreenPayload('full_transaction_history') }); } catch (err) { next(err); }
}
