import { resolveCoverage } from './coverageService.js';
import { itemPricing, STANDARD_VAT_BPS } from './commercePricing.js';

const VERSION = process.env.SOKOEATS_PRICING_VERSION || 'ke-route-tax-2026-02';
const DEFAULT_MINIMUM_ORDER = 300;
const DEFAULT_SMALL_ORDER_FEE = 50;
const toRad = (value) => Number(value) * Math.PI / 180;

export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function geocode(address, city) {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw Object.assign(new Error('Google Maps pricing is not configured'), { status: 503 });
  const cleanAddress = String(address || '').trim();
  const cleanCity = String(city || '').trim();
  const attempts = Array.from(new Set([
    cleanAddress,
    cleanCity && !cleanAddress.toLowerCase().includes(cleanCity.toLowerCase()) ? `${cleanAddress}, ${cleanCity}` : '',
    `${cleanAddress}, Kenya`,
    cleanCity && !cleanAddress.toLowerCase().includes(cleanCity.toLowerCase()) ? `${cleanAddress}, ${cleanCity}, Kenya` : '',
  ].filter(Boolean)));

  let lastStatus = 'NO_ATTEMPT';
  for (const candidate of attempts) {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(candidate)}&components=country:KE&key=${encodeURIComponent(key)}`);
    const payload = await response.json().catch(() => ({}));
    lastStatus = payload.status || `HTTP_${response.status}`;
    const result = payload.results?.[0];
    const location = result?.geometry?.location;
    console.info('[SokoEats][Pricing] geocode-attempt', {
      ok: response.ok,
      status: lastStatus,
      hasLocation: Boolean(location),
      candidate: candidate.replace(/\d(?=\d{2})/g, '*'),
    });
    if (response.ok && location) return { lat: Number(location.lat), lng: Number(location.lng), placeId: result.place_id };
  }

  console.warn('[SokoEats][Pricing] geocode-failed', {
    address: cleanAddress.replace(/\d(?=\d{2})/g, '*'),
    city: cleanCity || null,
    attempts: attempts.length,
    lastStatus,
  });
  throw Object.assign(new Error('Delivery address could not be located. Use current location, move the map pin, or enter an estate, road and town.'), {
    status: 422,
    code: 'DELIVERY_LOCATION_REQUIRED',
  });
}

export function developmentRouteEstimate(origin, destination) {
  const straightDistanceKm = distanceKm(origin, destination);
  const distanceKmEstimate = Math.max(0.05, Number((straightDistanceKm * 1.25).toFixed(2)));
  return {
    distanceKm: distanceKmEstimate,
    durationMin: Math.max(1, Math.ceil((distanceKmEstimate / 20) * 60)),
    polyline: null,
    source: 'development_estimate',
  };
}

async function route(origin, destination) {
  const serverKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const key = serverKey || process.env.GOOGLE_MAPS_API_KEY;
  const globalTestLocations = process.env.NODE_ENV !== 'production' && process.env.SOKOEATS_ALLOW_GLOBAL_TEST_LOCATIONS === 'true';
  if (!key) {
    if (globalTestLocations) return developmentRouteEstimate(origin, destination);
    throw Object.assign(new Error('Google Maps routing is not configured'), { status: 503 });
  }
  const straightDistanceKm = distanceKm(origin, destination);
  console.info('[SokoEats][Pricing] route-request', {
    keyType: serverKey ? 'server' : 'android-fallback',
    straightDistanceKm: Number(straightDistanceKm.toFixed(3)),
    globalTestLocations,
  });
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' },
    body: JSON.stringify({ origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } }, destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE' }),
  });
  const payload = await response.json().catch(() => ({}));
  const first = payload.routes?.[0];
  if (!response.ok || !first) {
    console.warn('[SokoEats][Pricing] route-failed', {
      httpStatus: response.status,
      providerStatus: payload.error?.status || null,
      providerMessage: payload.error?.message || null,
      keyType: serverKey ? 'server' : 'android-fallback',
      straightDistanceKm: Number(straightDistanceKm.toFixed(3)),
    });
    if (globalTestLocations) {
      const estimate = developmentRouteEstimate(origin, destination);
      console.info('[SokoEats][Pricing] development-route-estimate', { distanceKm: estimate.distanceKm, durationMin: estimate.durationMin });
      return estimate;
    }
    if ([401, 403].includes(response.status)) {
      throw Object.assign(new Error('Google Routes is not authorized for the backend server key. Configure GOOGLE_MAPS_SERVER_API_KEY with Routes API access.'), { status: 503, code: 'GOOGLE_ROUTES_NOT_AUTHORIZED' });
    }
    throw Object.assign(new Error('A delivery route could not be calculated for this address'), { status: 422 });
  }
  return { distanceKm: Number(first.distanceMeters) / 1000, durationMin: Math.max(1, Math.ceil(Number(String(first.duration || '0s').replace('s', '')) / 60)), polyline: first.polyline?.encodedPolyline || null, source: 'google_routes' };
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

async function menuLines(client, vendor, items) {
  const ids = items.map((item) => item.menuItemId).filter(Boolean);
  const result = await client.query(`SELECT id,name,price,tax_category,tax_rate_bps FROM sokoeats_menu_items WHERE vendor_id=$1 AND available=true AND id=ANY($2::uuid[])`, [vendor.id, ids]);
  const byId = new Map(result.rows.map((item) => [String(item.id), item]));
  return items.map((line) => {
    const item = byId.get(String(line.menuItemId));
    if (!item) throw Object.assign(new Error('One or more basket items are no longer available'), { status: 409 });
    const quantity = Number(line.quantity);
    const pricing = itemPricing(item, vendor);
    const lineTotal = pricing.customerPrice * quantity;
    return { menuItemId: item.id, name: item.name, quantity, unitPrice: pricing.customerPrice, partnerUnitPrice: pricing.partnerPrice, commissionAmount: pricing.commissionAmount * quantity, vatAmount: Math.round(lineTotal * pricing.taxRateBps / 10000), taxCategory: pricing.taxCategory, taxRateBps: pricing.taxRateBps, lineTotal, notes: line.notes || null };
  });
}

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};
const roundUpToFive = (value) => Math.ceil(Number(value || 0) / 5) * 5;

export function calculateSmallOrderFee(subtotal) {
  const minimumOrder = envNumber('SOKOEATS_MINIMUM_ORDER', DEFAULT_MINIMUM_ORDER);
  const amountToMinimum = Math.max(0, Math.ceil(minimumOrder - Number(subtotal || 0)));
  const smallOrderFee = amountToMinimum > 0
    ? envNumber('SOKOEATS_SMALL_ORDER_FEE', DEFAULT_SMALL_ORDER_FEE)
    : 0;
  return { minimumOrder, amountToMinimum, smallOrderFee };
}

export function calculateDeliveryFee(routeData, vendor = {}) {
  const baseFee = envNumber('SOKOEATS_DELIVERY_BASE_FEE', 100);
  const minimumFee = Math.max(envNumber('SOKOEATS_DELIVERY_MINIMUM_FEE', 150), Number(vendor.delivery_fee || 0));
  const includedKm = envNumber('SOKOEATS_DELIVERY_INCLUDED_KM', 2);
  const perKm = envNumber('SOKOEATS_DELIVERY_PER_KM', 35);
  const includedMinutes = envNumber('SOKOEATS_DELIVERY_INCLUDED_MINUTES', 15);
  const perMinute = envNumber('SOKOEATS_DELIVERY_PER_MINUTE', 3);
  const billableKm = Math.max(0, Number(routeData.distanceKm || 0) - includedKm);
  const billableMinutes = Math.max(0, Number(routeData.durationMin || 0) - includedMinutes);
  const distanceFee = Math.ceil(billableKm * perKm);
  const timeFee = Math.ceil(billableMinutes * perMinute);
  const deliveryFee = roundUpToFive(Math.max(minimumFee, baseFee + distanceFee + timeFee));
  return { deliveryFee, baseFee, minimumFee, includedKm, perKm, includedMinutes, perMinute, distanceFee, timeFee };
}

export async function createPricingQuote(client, { userId, vendorId, vendorSlug, items, deliveryAddress, city, latitude, longitude, discountCode }) {
  const vendorResult = vendorId ? await client.query(`SELECT * FROM sokoeats_vendors WHERE id=$1 AND status='active'`, [vendorId]) : await client.query(`SELECT * FROM sokoeats_vendors WHERE slug=$1 AND status='active'`, [vendorSlug]);
  const vendor = vendorResult.rows[0];
  if (!vendor) throw Object.assign(new Error('Shop is not accepting orders'), { status: 409 });
  const hasPickupPin = vendor.latitude != null && vendor.longitude != null
    && Number.isFinite(Number(vendor.latitude)) && Number.isFinite(Number(vendor.longitude));
  const hasDeliveryPin = latitude != null && longitude != null
    && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  console.info('[SokoEats][Pricing] route-endpoints', {
    vendorId: vendor.id,
    hasPickupPin,
    hasDeliveryPin,
    deliverySource: hasDeliveryPin ? 'confirmed-pin' : 'address-geocode',
  });
  if (!hasPickupPin) {
    throw Object.assign(new Error('This shop has not set an exact pickup pin. Ask the shop to update its location before placing a delivery order.'), {
      status: 422,
      code: 'VENDOR_PICKUP_LOCATION_REQUIRED',
    });
  }
  const origin = { lat: Number(vendor.latitude), lng: Number(vendor.longitude) };
  const destination = hasDeliveryPin
    ? { lat: Number(latitude), lng: Number(longitude) }
    : await geocode(deliveryAddress, city);
  const globalTestLocations = process.env.NODE_ENV !== 'production' && process.env.SOKOEATS_ALLOW_GLOBAL_TEST_LOCATIONS === 'true';
  const coverage = await resolveCoverage(client, destination.lat, destination.lng);
  if (!coverage.serviceable && !globalTestLocations) throw Object.assign(new Error(coverage.message), { status: 422, code: 'DELIVERY_AREA_COMING_SOON' });
  if (coverage.serviceable) {
    const vendorZone = await client.query(`SELECT 1 FROM sokoeats_vendor_delivery_zones WHERE vendor_id=$1 AND zone_id=$2 AND active=true`, [vendor.id, coverage.zone.id]);
    if (!vendorZone.rows[0]) throw Object.assign(new Error(`${vendor.name} does not currently deliver to this zone`), { status: 422, code: 'VENDOR_OUTSIDE_DELIVERY_ZONE' });
  } else {
    console.info('[SokoEats][Pricing] global-test-route', { vendorId: vendor.id, coverageBypassed: true });
  }
  const routeData = await route(origin, destination);
  if (routeData.distanceKm > Number(vendor.service_radius_km || 20)) {
    if (!globalTestLocations) throw Object.assign(new Error(`This address is outside ${vendor.name}'s ${vendor.service_radius_km} km delivery area`), { status: 422 });
    console.info('[SokoEats][Pricing] global-test-radius-bypass', { vendorId: vendor.id, routeDistanceKm: routeData.distanceKm, configuredRadiusKm: Number(vendor.service_radius_km || 20) });
  }
  const lines = await menuLines(client, vendor, items);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const platformCommission = lines.reduce((sum, line) => sum + line.commissionAmount, 0);
  const taxableSubtotal = lines.filter((line) => line.taxRateBps > 0).reduce((sum, line) => sum + line.lineTotal, 0);
  const vatRateBps = taxableSubtotal > 0 ? STANDARD_VAT_BPS : 0;
  const itemVat = lines.reduce((sum, line) => sum + line.vatAmount, 0);
  const minimum = calculateSmallOrderFee(subtotal);
  const delivery = calculateDeliveryFee(routeData, vendor);
  const deliveryFee = delivery.deliveryFee;
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
  const vatAmount = itemVat;
  const total = subtotal + minimum.smallOrderFee + deliveryFee + serviceFee + surgeFee + vatAmount - discountAmount;
  const result = await client.query(`INSERT INTO sokoeats_pricing_quotes
    (user_id,vendor_id,items,delivery_address,dropoff_latitude,dropoff_longitude,subtotal,taxable_subtotal,vat_rate_bps,vat_amount,small_order_fee,minimum_order,amount_to_minimum,delivery_fee,delivery_breakdown,service_fee,waived_service_fee,first_order_offer,surge_fee,discount_amount,total,distance_km,duration_min,surge_multiplier,rider_surge_bonus,vendor_surge_bonus,platform_surge_revenue,demand_snapshot,route_polyline,pricing_version,delivery_zone_id,platform_commission,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,NOW()+INTERVAL '15 minutes') RETURNING *`,
    [userId,vendor.id,JSON.stringify(lines),deliveryAddress,destination.lat,destination.lng,subtotal,taxableSubtotal,vatRateBps,vatAmount,minimum.smallOrderFee,minimum.minimumOrder,minimum.amountToMinimum,deliveryFee,JSON.stringify(delivery),serviceFee,waivedServiceFee,firstOrderOffer,surgeFee,discountAmount,total,routeData.distanceKm.toFixed(2),routeData.durationMin,demand.multiplier,riderSurgeBonus,vendorSurgeBonus,platformSurgeRevenue,JSON.stringify(demand),routeData.polyline,VERSION,coverage.zone?.id || null,platformCommission]);
  const priced = result;
  return { ...priced.rows[0], vendor, origin, destination };
}

export function publicQuote(row) {
  return { id: row.id, subtotal: Number(row.subtotal), taxableSubtotal: Number(row.taxable_subtotal || 0), vatRateBps: Number(row.vat_rate_bps || 0), vatAmount: Number(row.vat_amount || 0), smallOrderFee: Number(row.small_order_fee || 0), minimumOrder: Number(row.minimum_order || DEFAULT_MINIMUM_ORDER), amountToMinimum: Number(row.amount_to_minimum || 0), deliveryFee: Number(row.delivery_fee), deliveryBreakdown: row.delivery_breakdown || {}, serviceFee: Number(row.service_fee), waivedServiceFee: Number(row.waived_service_fee || 0), firstOrderOffer: Boolean(row.first_order_offer), surgeFee: Number(row.surge_fee), discountAmount: Number(row.discount_amount), total: Number(row.total), distanceKm: Number(row.distance_km), durationMin: Number(row.duration_min), surgeMultiplier: Number(row.surge_multiplier), expiresAt: row.expires_at, route: { encodedPolyline: row.route_polyline, destination: { lat: Number(row.dropoff_latitude), lng: Number(row.dropoff_longitude) }, navigationUrl: `https://www.google.com/maps/dir/?api=1&destination=${row.dropoff_latitude},${row.dropoff_longitude}&travelmode=driving` } };
}

export async function lockedQuote(client, quoteId, userId) {
  const result = await client.query(`SELECT * FROM sokoeats_pricing_quotes WHERE id=$1 AND user_id=$2 FOR UPDATE`, [quoteId, userId]);
  const quote = result.rows[0];
  if (!quote) throw Object.assign(new Error('Pricing quote not found'), { status: 404 });
  if (quote.consumed_at) throw Object.assign(new Error('Pricing quote has already been used'), { status: 409 });
  if (new Date(quote.expires_at) <= new Date()) throw Object.assign(new Error('Pricing changed. Refresh checkout for a new quote.'), { status: 409 });
  return quote;
}
