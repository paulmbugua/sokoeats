-- Server-authoritative marketplace pricing and settlement allocation.
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS commission_plan TEXT NOT NULL DEFAULT 'launch';
ALTER TABLE sokoeats_vendors ALTER COLUMN commission_rate_bps SET DEFAULT 1000;
UPDATE sokoeats_vendors SET commission_rate_bps = 1000, commission_plan = 'launch' WHERE commission_rate_bps = 1500;

CREATE TABLE IF NOT EXISTS sokoeats_pricing_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES sokoeats_users(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES sokoeats_vendors(id) ON DELETE CASCADE,
  items JSONB NOT NULL,
  delivery_address TEXT NOT NULL,
  dropoff_latitude NUMERIC(10,7) NOT NULL,
  dropoff_longitude NUMERIC(10,7) NOT NULL,
  subtotal INT NOT NULL,
  delivery_fee INT NOT NULL,
  service_fee INT NOT NULL,
  surge_fee INT NOT NULL DEFAULT 0,
  discount_amount INT NOT NULL DEFAULT 0,
  total INT NOT NULL,
  distance_km NUMERIC(7,2) NOT NULL,
  duration_min INT NOT NULL,
  surge_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1,
  rider_surge_bonus INT NOT NULL DEFAULT 0,
  vendor_surge_bonus INT NOT NULL DEFAULT 0,
  platform_surge_revenue INT NOT NULL DEFAULT 0,
  demand_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  route_polyline TEXT,
  pricing_version TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sokoeats_pricing_quotes_user ON sokoeats_pricing_quotes(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS sokoeats_surge_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  center_latitude NUMERIC(10,7) NOT NULL,
  center_longitude NUMERIC(10,7) NOT NULL,
  radius_km NUMERIC(6,2) NOT NULL,
  multiplier NUMERIC(4,2) NOT NULL DEFAULT 1 CHECK (multiplier BETWEEN 1 AND 1.75),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sokoeats_payment_intents ADD COLUMN IF NOT EXISTS pricing_quote_id UUID REFERENCES sokoeats_pricing_quotes(id);
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS pricing_quote_id UUID REFERENCES sokoeats_pricing_quotes(id);
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS surge_fee INT NOT NULL DEFAULT 0;
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS surge_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1;
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS rider_surge_bonus INT NOT NULL DEFAULT 0;
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS vendor_surge_bonus INT NOT NULL DEFAULT 0;
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS platform_surge_revenue INT NOT NULL DEFAULT 0;
ALTER TABLE sokoeats_order_settlements ADD COLUMN IF NOT EXISTS surge_fee INT NOT NULL DEFAULT 0;
ALTER TABLE sokoeats_order_settlements ADD COLUMN IF NOT EXISTS rider_surge_bonus INT NOT NULL DEFAULT 0;
ALTER TABLE sokoeats_order_settlements ADD COLUMN IF NOT EXISTS vendor_surge_bonus INT NOT NULL DEFAULT 0;
ALTER TABLE sokoeats_order_settlements ADD COLUMN IF NOT EXISTS platform_surge_revenue INT NOT NULL DEFAULT 0;
