import { getScreenPayload, saveScreenPayload } from '../models/screenPayloadModel.js';

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
