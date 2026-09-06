export const deliverySteps = [
  ['placed', 'Order received'], ['accepted', 'Shop accepted'],
  ['preparing', 'Preparing your order'], ['ready', 'Ready for dispatch'],
  ['rider_assigned', 'Rider assigned'], ['picked_up', 'Rider on the way'],
  ['arrived', 'Rider arrived'], ['delivered', 'Delivered'],
];

export function canViewDelivery(order, auth) {
  if (['admin', 'support'].includes(auth.role)) return true;
  if (auth.role === 'customer') return String(order.customer_user_id) === auth.sub;
  if (['rider', 'courier'].includes(auth.role)) return String(order.rider_user_id) === auth.sub;
  return ['vendor', 'merchant'].includes(auth.role) && String(order.owner_user_id) === auth.sub;
}

export function deliveryEstimate(order, events, now = Date.now()) {
  if (['delivered', 'cancelled'].includes(order.status) || order.rider_arrived_at) return null;
  const pickup = events.find(event => event.event_type === 'picked_up');
  if (!pickup || !Number(order.estimated_duration_min)) return null;
  const expectedAt = new Date(new Date(pickup.occurred_at).getTime() + Number(order.estimated_duration_min) * 60000);
  return { expectedAt: expectedAt.toISOString(), minutes: Math.max(0, Math.ceil((expectedAt.getTime() - now) / 60000)), overdue: expectedAt.getTime() < now, basis: 'Route estimate at dispatch; traffic and stops may change arrival.' };
}

export function distanceMeters(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
