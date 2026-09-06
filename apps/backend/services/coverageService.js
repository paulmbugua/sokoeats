const haversineSql = (latPosition, lngPosition, alias = 'z') => `
  6371 * 2 * ASIN(SQRT(
    POWER(SIN(RADIANS(${alias}.center_latitude - $${latPosition}) / 2), 2) +
    COS(RADIANS($${latPosition})) * COS(RADIANS(${alias}.center_latitude)) *
    POWER(SIN(RADIANS(${alias}.center_longitude - $${lngPosition}) / 2), 2)
  ))`;

export async function resolveCoverage(client, latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw Object.assign(new Error('Valid latitude and longitude are required'), { status: 422 });
  const { rows } = await client.query(
    `SELECT z.*,c.name AS city_name,c.slug AS city_slug,c.operations_status,c.delivery_mode,
            co.name AS county_name,${haversineSql(1, 2)} AS distance_from_center_km
       FROM sokoeats_delivery_zones z
       JOIN sokoeats_cities c ON c.id=z.city_id
       JOIN sokoeats_counties co ON co.id=c.county_id
      WHERE z.status='active' AND c.operations_status='active'
        AND ${haversineSql(1, 2)} <= z.radius_km
      ORDER BY ${haversineSql(1, 2)} LIMIT 1`,
    [lat,lng],
  );
  if (!rows[0]) return { serviceable: false, status: 'coming_soon', message: 'SokoEats registration is open nationwide. Delivery is not active at this location yet.' };
  const zone = rows[0];
  return {
    serviceable: true,
    status: zone.operations_status,
    city: { id: zone.city_id, name: zone.city_name, slug: zone.city_slug, county: zone.county_name, deliveryMode: zone.delivery_mode },
    zone: { id: zone.id, name: zone.name, radiusKm: Number(zone.radius_km), maxSurgeMultiplier: Number(zone.max_surge_multiplier) },
  };
}
