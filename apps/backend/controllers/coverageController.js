import pool from '../config/db.js';
import { resolveCoverage } from '../services/coverageService.js';

export async function listCoverage(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT c.id,c.name,c.slug,c.operations_status AS status,c.delivery_mode,
              c.center_latitude,c.center_longitude,co.name AS county,
              (SELECT COUNT(*)::int FROM sokoeats_vendors v WHERE v.city_id=c.id) AS vendor_count,
              (SELECT COUNT(*)::int FROM sokoeats_orders o JOIN sokoeats_delivery_zones oz ON oz.id=o.delivery_zone_id WHERE oz.city_id=c.id) AS order_count,
              COALESCE(jsonb_agg(jsonb_build_object('id',z.id,'name',z.name,'status',z.status,'radiusKm',z.radius_km,'maxSurgeMultiplier',z.max_surge_multiplier)) FILTER (WHERE z.id IS NOT NULL),'[]') AS zones
         FROM sokoeats_cities c JOIN sokoeats_counties co ON co.id=c.county_id
         LEFT JOIN sokoeats_delivery_zones z ON z.city_id=c.id GROUP BY c.id,co.name ORDER BY co.name,c.name`,
    );
    const counties = await pool.query('SELECT code,name,registration_open FROM sokoeats_counties ORDER BY code');
    res.json({ country: 'Kenya', registrationOpen: true, cities: rows, counties: counties.rows });
  } catch (error) { next(error); }
}

export async function createCity(req, res, next) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO sokoeats_cities(county_id,name,slug,center_latitude,center_longitude,operations_status,delivery_mode)
       SELECT id,$2,$3,$4,$5,$6,$7 FROM sokoeats_counties WHERE code=$1 RETURNING *`,
      [req.body.countyCode,req.body.name,req.body.slug,req.body.latitude,req.body.longitude,req.body.status,req.body.deliveryMode],
    );
    if (!rows[0]) return res.status(422).json({ message: 'A valid Kenya county code is required' });
    res.status(201).json({ city: rows[0] });
  } catch (error) { next(error); }
}

export async function createZone(req, res, next) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO sokoeats_delivery_zones(city_id,name,center_latitude,center_longitude,radius_km,status,max_surge_multiplier)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.cityId,req.body.name,req.body.latitude,req.body.longitude,req.body.radiusKm,req.body.status,req.body.maxSurgeMultiplier],
    );
    res.status(201).json({ zone: rows[0] });
  } catch (error) { next(error); }
}

export async function checkCoverage(req, res, next) {
  try { res.json(await resolveCoverage(pool, req.query.latitude, req.query.longitude)); } catch (error) { next(error); }
}

export async function updateCityCoverage(req, res, next) {
  try {
    const { rows } = await pool.query(
      `UPDATE sokoeats_cities SET operations_status=$2,delivery_mode=COALESCE($3,delivery_mode),
       activated_at=CASE WHEN $2='active' THEN COALESCE(activated_at,NOW()) ELSE activated_at END
       WHERE id::text=$1 OR slug=$1 RETURNING *`,
      [req.params.cityKey,req.body.status,req.body.deliveryMode || null],
    );
    if (!rows[0]) return res.status(404).json({ message: 'City not found' });
    res.json({ city: rows[0] });
  } catch (error) { next(error); }
}

export async function setVendorZone(req, res, next) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO sokoeats_vendor_delivery_zones(vendor_id,zone_id,active) VALUES ($1,$2,$3)
       ON CONFLICT (vendor_id,zone_id) DO UPDATE SET active=EXCLUDED.active RETURNING *`,
      [req.params.vendorId,req.params.zoneId,req.body.active],
    );
    res.json({ membership: rows[0] });
  } catch (error) { next(error); }
}

export async function setRiderZone(req, res, next) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO sokoeats_rider_delivery_zones(rider_user_id,zone_id,active) VALUES ($1,$2,$3)
       ON CONFLICT (rider_user_id,zone_id) DO UPDATE SET active=EXCLUDED.active RETURNING *`,
      [req.params.riderId,req.params.zoneId,req.body.active],
    );
    res.json({ membership: rows[0] });
  } catch (error) { next(error); }
}
