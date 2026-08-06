const appName = 'SokoEats Maps';

const points = {
  customerHome: { id: 'customer-home', label: 'Paul - Nairobi CBD', address: 'Apartment 4B, Nairobi CBD', lat: -1.286389, lng: 36.817223, kind: 'customer' },
  vendor: { id: 'vendor-nairobi-grill', label: 'Nairobi Grill House', address: 'Moi Avenue, City Centre, Nairobi', lat: -1.28333, lng: 36.82194, kind: 'vendor' },
  rider: { id: 'rider-juma', label: 'Rider Juma', address: 'Kimathi Street, Nairobi', lat: -1.28472, lng: 36.82336, kind: 'rider' },
  supportHub: { id: 'support-hub', label: 'SokoEats Dispatch', address: 'Westlands, Nairobi', lat: -1.2641, lng: 36.8028, kind: 'support' },
  incident: { id: 'incident-inc-82941', label: 'Incident INC-82941', address: 'Uhuru Highway, Nairobi', lat: -1.2921, lng: 36.8219, kind: 'incident' },
  westlands: { id: 'zone-westlands', label: 'Westlands', address: 'Westlands, Nairobi', lat: -1.2641, lng: 36.8028, kind: 'zone' },
  kilimani: { id: 'zone-kilimani', label: 'Kilimani', address: 'Kilimani, Nairobi', lat: -1.2924, lng: 36.7859, kind: 'zone' },
  karen: { id: 'zone-karen', label: 'Karen', address: 'Karen, Nairobi', lat: -1.3197, lng: 36.7073, kind: 'zone' },
  gigiri: { id: 'zone-gigiri', label: 'Gigiri', address: 'Gigiri, Nairobi', lat: -1.2346, lng: 36.8070, kind: 'zone' }
};

const route = {
  id: 'route-sko-1294',
  orderCode: 'SKO-1294',
  status: 'Heading to Vendor',
  etaMinutes: 18,
  distanceKm: 4.2,
  polyline: [points.rider, points.vendor, points.customerHome],
  pickup: points.vendor,
  dropoff: points.customerHome,
  rider: points.rider
};

function directionsUrl(destination, origin) {
  const destinationText = `${destination.lat},${destination.lng}`;
  const originText = origin ? `${origin.lat},${origin.lng}` : '';
  const query = new URLSearchParams({ api: '1', destination: destinationText, travelmode: 'driving' });
  if (originText) query.set('origin', originText);
  return `https://www.google.com/maps/dir/?${query.toString()}`;
}

function placeUrl(point) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.lat},${point.lng}`)}`;
}

function staticMapPath(markers, pathPoints = []) {
  return {
    center: markers[0],
    markers,
    path: pathPoints,
    staticUrlTemplate: 'https://maps.googleapis.com/maps/api/staticmap?size=900x520&scale=2&maptype=roadmap&markers={markers}&path={path}&key={GOOGLE_MAPS_API_KEY}'
  };
}

function manifest() {
  const routeMap = staticMapPath([points.rider, points.vendor, points.customerHome], route.polyline);
  const cityMap = staticMapPath([points.customerHome, points.vendor, points.westlands, points.kilimani], []);
  const zoneMap = staticMapPath([points.vendor, points.westlands, points.kilimani, points.karen, points.gigiri], []);
  return {
    appName,
    provider: 'google_maps',
    androidPackage: 'com.paulmbugua2.sokoeats',
    requiredApis: ['Maps SDK for Android', 'Maps JavaScript API', 'Maps Static API', 'Directions API', 'Geocoding API', 'Places API'],
    customer: {
      nearbyVendors: { title: 'Nearby vendors', map: cityMap, points: [points.vendor, points.westlands, points.kilimani], actionUrl: placeUrl(points.vendor) },
      checkout: { title: 'Checkout delivery route', route, map: routeMap, navigationUrl: directionsUrl(points.customerHome, points.vendor) },
      liveOrder: { title: 'Live order tracking', route, map: routeMap, navigationUrl: directionsUrl(points.customerHome, points.rider) },
      savedAddresses: [{ ...points.customerHome, default: true, map: staticMapPath([points.customerHome], []) }]
    },
    rider: {
      deliveryRequest: { title: 'Delivery request map', route, map: routeMap, acceptUrl: directionsUrl(points.vendor, points.rider) },
      activeDelivery: { title: 'Active delivery navigation', route, map: routeMap, toVendorUrl: directionsUrl(points.vendor, points.rider), toCustomerUrl: directionsUrl(points.customerHome, points.vendor) },
      safety: { title: 'Safety incident capture', point: points.incident, map: staticMapPath([points.incident, points.supportHub], []), dispatchUrl: directionsUrl(points.incident, points.supportHub) }
    },
    vendor: {
      store: { title: 'Store pin', point: points.vendor, serviceRadiusKm: 5, map: staticMapPath([points.vendor], []), actionUrl: placeUrl(points.vendor), placeUrl: placeUrl(points.vendor) },
      dispatch: { title: 'Ready orders and incoming riders', route, map: routeMap, navigationUrl: directionsUrl(points.vendor, points.rider) },
      campaignTargeting: { title: 'Campaign targeting zones', radiusKm: 5, neighborhoods: [points.westlands, points.kilimani, points.karen, points.gigiri], map: zoneMap, insightsUrl: placeUrl(points.vendor) }
    },
    merchant: {
      onboarding: { title: 'Merchant location verification', point: points.vendor, map: staticMapPath([points.vendor], []), actionUrl: placeUrl(points.vendor) },
      serviceArea: { title: 'Service area and delivery coverage', radiusKm: 5, map: zoneMap, placeUrl: placeUrl(points.vendor) }
    },
    support: {
      fleet: { title: 'Live fleet operations', activeRiders: 24, delayedOrders: 3, map: staticMapPath([points.rider, points.vendor, points.customerHome, points.incident], []), route, dispatchUrl: directionsUrl(points.vendor, points.rider) },
      incident: { title: 'Incident location', point: points.incident, map: staticMapPath([points.incident], []), actionUrl: placeUrl(points.incident), dispatchUrl: directionsUrl(points.incident, points.supportHub) }
    },
    admin: {
      commandCenter: { title: 'Nairobi command map', map: staticMapPath([points.vendor, points.customerHome, points.rider, points.supportHub, points.incident], []), zones: [points.westlands, points.kilimani, points.karen, points.gigiri], dispatchUrl: directionsUrl(points.incident, points.supportHub) }
    },
    tickets: {
      ticketDetail: { title: 'Ticket SKO-9214 delivery route', route, map: routeMap, actionUrl: directionsUrl(points.customerHome, points.rider), navigationUrl: directionsUrl(points.customerHome, points.rider) }
    },
    sourceFiles: ['maps/manifest/generated', 'apps/backend/controllers/mapController.js']
  };
}

export async function mapManifest(_req, res, next) {
  try { res.json({ maps: manifest() }); } catch (err) { next(err); }
}

export async function updateRiderLocation(req, res, next) {
  try {
    const current = { ...points.rider, lat: Number(req.body.lat), lng: Number(req.body.lng), heading: req.body.heading || 'toward_vendor', updatedAt: new Date().toISOString() };
    res.status(201).json({ location: current, navigationUrl: directionsUrl(points.vendor, current) });
  } catch (err) { next(err); }
}

export async function saveCustomerAddress(req, res, next) {
  try {
    const point = { id: 'customer-address-' + Date.now(), label: req.body.label || 'Saved address', address: req.body.address, lat: Number(req.body.lat), lng: Number(req.body.lng), kind: 'customer' };
    res.status(201).json({ address: point, map: staticMapPath([point], []) });
  } catch (err) { next(err); }
}

export async function updateVendorLocation(req, res, next) {
  try {
    const point = { ...points.vendor, address: req.body.address || points.vendor.address, lat: Number(req.body.lat), lng: Number(req.body.lng), updatedAt: new Date().toISOString() };
    res.status(201).json({ location: point, serviceRadiusKm: Number(req.body.serviceRadiusKm || 5), map: staticMapPath([point], []) });
  } catch (err) { next(err); }
}