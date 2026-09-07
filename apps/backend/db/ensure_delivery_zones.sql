-- Restore operational delivery zones after a data-only database reset.
INSERT INTO sokoeats_delivery_zones(city_id,name,center_latitude,center_longitude,radius_km,status)
SELECT id,'Nairobi Metro',-1.286389,36.817223,35,'active'
FROM sokoeats_cities
WHERE slug='nairobi' AND operations_status='active'
ON CONFLICT (city_id,name) DO UPDATE SET
  center_latitude=EXCLUDED.center_latitude,
  center_longitude=EXCLUDED.center_longitude,
  radius_km=EXCLUDED.radius_km,
  status=EXCLUDED.status;

INSERT INTO sokoeats_vendor_delivery_zones(vendor_id,zone_id,active)
SELECT v.id,z.id,TRUE
FROM sokoeats_vendors v
JOIN sokoeats_delivery_zones z ON z.city_id=v.city_id
WHERE v.status='active'
ON CONFLICT (vendor_id,zone_id) DO UPDATE SET active=TRUE;
