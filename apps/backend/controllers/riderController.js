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
