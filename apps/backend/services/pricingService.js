const VERSION = 'ke-launch-2026-01';
const toRad = (value) => Number(value) * Math.PI / 180;

export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function geocode(address) {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw Object.assign(new Error('Google Maps pricing is not configured'), { status: 503 });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:KE&key=${encodeURIComponent(key)}`);
  const payload = await response.json().catch(() => ({}));
  const location = payload.results?.[0]?.geometry?.location;
  if (!response.ok || !location) throw Object.assign(new Error('Delivery address could not be located. Move the map pin or enter a more specific address.'), { status: 422 });
  return { lat: Number(location.lat), lng: Number(location.lng), placeId: payload.results[0].place_id };
}

async function route(origin, destination) {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw Object.assign(new Error('Google Maps routing is not configured'), { status: 503 });
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' },
    body: JSON.stringify({ origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } }, destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE' }),
  });
  const payload = await response.json().catch(() => ({}));
  const first = payload.routes?.[0];
  if (!response.ok || !first) throw Object.assign(new Error('A delivery route could not be calculated for this address'), { status: 422 });
  return { distanceKm: Number(first.distanceMeters) / 1000, durationMin: Math.max(1, Math.ceil(Number(String(first.duration || '0s').replace('s', '')) / 60)), polyline: first.polyline?.encodedPolyline || null };
}

async function activeSurge(client, vendor, origin) {
  const demand = await client.query(`SELECT
    (SELECT COUNT(*)::int FROM sokoeats_orders WHERE vendor_id=$1 AND status IN ('placed','accepted','preparing','ready') AND created_at > NOW()-INTERVAL '30 minutes') AS open_orders,
    (SELECT COUNT(DISTINCT rider_user_id)::int FROM sokoeats_rider_locations WHERE captured_at > NOW()-INTERVAL '10 minutes') AS active_riders`, [vendor.id]);
  const openOrders = Number(demand.rows[0].open_orders || 0);
  const activeRiders = Number(demand.rows[0].active_riders || 0);
  const pressure = openOrders / Math.max(activeRiders, 1);
  const demandMultiplier = pressure >= 6 ? 1.5 : pressure >= 4 ? 1.3 : pressure >= 2 ? 1.15 : 1;
  const zones = await client.query(`SELECT * FROM sokoeats_surge_zones WHERE active=true AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>=NOW())`);
  const zone = zones.rows.filter((item) => distanceKm(origin, { lat: Number(item.center_latitude), lng: Number(item.center_longitude) }) <= Number(item.radius_km)).sort((a, b) => Number(b.multiplier) - Number(a.multiplier))[0];
  const multiplier = Math.min(1.75, Math.max(demandMultiplier, Number(zone?.multiplier || 1)));
  return { multiplier, openOrders, activeRiders, pressure: Number(pressure.toFixed(2)), zone: zone?.name || null };
}

async function menuLines(client, vendorId, items) {
  const ids = items.map((item) => item.menuItemId).filter(Boolean);
  const result = await client.query(`SELECT id,name,price FROM sokoeats_menu_items WHERE vendor_id=$1 AND available=true AND id=ANY($2::uuid[])`, [vendorId, ids]);
  const byId = new Map(result.rows.map((item) => [String(item.id), item]));
  return items.map((line) => {
    const item = byId.get(String(line.menuItemId));
    if (!item) throw Object.assign(new Error('One or more basket items are no longer available'), { status: 409 });
    const quantity = Number(line.quantity);
    return { menuItemId: item.id, name: item.name, quantity, unitPrice: Number(item.price), lineTotal: Number(item.price) * quantity, notes: line.notes || null };
  });
}

export async function createPricingQuote(client, { userId, vendorId, vendorSlug, items, deliveryAddress, latitude, longitude, discountCode }) {
  const vendorResult = vendorId ? await client.query(`SELECT * FROM sokoeats_vendors WHERE id=$1 AND status='active'`, [vendorId]) : await client.query(`SELECT * FROM sokoeats_vendors WHERE slug=$1 AND status='active'`, [vendorSlug]);
  const vendor = vendorResult.rows[0];
  if (!vendor) throw Object.assign(new Error('Shop is not accepting orders'), { status: 409 });
  const origin = vendor.latitude && vendor.longitude ? { lat: Number(vendor.latitude), lng: Number(vendor.longitude) } : await geocode(vendor.address);
  const destination = latitude != null && longitude != null ? { lat: Number(latitude), lng: Number(longitude) } : await geocode(deliveryAddress);
  const routeData = await route(origin, destination);
  if (routeData.distanceKm > Number(vendor.service_radius_km || 20)) throw Object.assign(new Error(`This address is outside ${vendor.name}'s ${vendor.service_radius_km} km delivery area`), { status: 422 });
  const lines = await menuLines(client, vendor.id, items);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  if (subtotal < Number(vendor.minimum_order || 0)) throw Object.assign(new Error(`Minimum order is KES ${vendor.minimum_order}`), { status: 422 });
  const distanceFee = Math.max(0, Math.ceil(routeData.distanceKm - 3) * Number(process.env.SOKOEATS_DELIVERY_PER_KM || 35));
  const deliveryFee = Number(vendor.delivery_fee || 150) + distanceFee;
  const standardServiceFee = Math.round(subtotal * Number(process.env.SOKOEATS_SERVICE_FEE_BPS || 400) / 10000);
  const previousOrder = await client.query(`SELECT EXISTS(
    SELECT 1 FROM sokoeats_orders
    WHERE customer_user_id=$1 AND payment_status='paid' AND status <> 'cancelled'
  ) AS has_order`, [userId]);
  const firstOrderOffer = !previousOrder.rows[0].has_order;
  const waivedServiceFee = firstOrderOffer ? standardServiceFee : 0;
  const serviceFee = standardServiceFee - waivedServiceFee;
  const demand = await activeSurge(client, vendor, origin);
  const surgeFee = Math.round(deliveryFee * (demand.multiplier - 1));
  const riderSurgeBonus = Math.round(surgeFee * 0.7);
  const vendorSurgeBonus = Math.round(surgeFee * 0.1);
  const platformSurgeRevenue = surgeFee - riderSurgeBonus - vendorSurgeBonus;
  const discountAmount = 0;
  const total = subtotal + deliveryFee + serviceFee + surgeFee - discountAmount;
  const result = await client.query(`INSERT INTO sokoeats_pricing_quotes
    (user_id,vendor_id,items,delivery_address,dropoff_latitude,dropoff_longitude,subtotal,delivery_fee,service_fee,waived_service_fee,first_order_offer,surge_fee,discount_amount,total,distance_km,duration_min,surge_multiplier,rider_surge_bonus,vendor_surge_bonus,platform_surge_revenue,demand_snapshot,route_polyline,pricing_version,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW()+INTERVAL '15 minutes') RETURNING *`,
    [userId,vendor.id,JSON.stringify(lines),deliveryAddress,destination.lat,destination.lng,subtotal,deliveryFee,serviceFee,waivedServiceFee,firstOrderOffer,surgeFee,discountAmount,total,routeData.distanceKm.toFixed(2),routeData.durationMin,demand.multiplier,riderSurgeBonus,vendorSurgeBonus,platformSurgeRevenue,JSON.stringify(demand),routeData.polyline,VERSION]);
  return { ...result.rows[0], vendor, origin, destination };
}

export function publicQuote(row) {
  return { id: row.id, subtotal: Number(row.subtotal), deliveryFee: Number(row.delivery_fee), serviceFee: Number(row.service_fee), waivedServiceFee: Number(row.waived_service_fee || 0), firstOrderOffer: Boolean(row.first_order_offer), surgeFee: Number(row.surge_fee), discountAmount: Number(row.discount_amount), total: Number(row.total), distanceKm: Number(row.distance_km), durationMin: Number(row.duration_min), surgeMultiplier: Number(row.surge_multiplier), expiresAt: row.expires_at, route: { encodedPolyline: row.route_polyline, destination: { lat: Number(row.dropoff_latitude), lng: Number(row.dropoff_longitude) }, navigationUrl: `https://www.google.com/maps/dir/?api=1&destination=${row.dropoff_latitude},${row.dropoff_longitude}&travelmode=driving` } };
}

export async function lockedQuote(client, quoteId, userId) {
  const result = await client.query(`SELECT * FROM sokoeats_pricing_quotes WHERE id=$1 AND user_id=$2 FOR UPDATE`, [quoteId, userId]);
  const quote = result.rows[0];
  if (!quote) throw Object.assign(new Error('Pricing quote not found'), { status: 404 });
  if (quote.consumed_at) throw Object.assign(new Error('Pricing quote has already been used'), { status: 409 });
  if (new Date(quote.expires_at) <= new Date()) throw Object.assign(new Error('Pricing changed. Refresh checkout for a new quote.'), { status: 409 });
  return quote;
}
