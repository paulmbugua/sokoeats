CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sokoeats_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('customer','vendor','courier','support','admin')),
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  cuisine TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('draft','review','active','paused')),
  rating NUMERIC(2,1) NOT NULL DEFAULT 4.7,
  prep_minutes INT NOT NULL DEFAULT 25,
  delivery_fee INT NOT NULL DEFAULT 150,
  minimum_order INT NOT NULL DEFAULT 300,
  image_url TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES sokoeats_vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price INT NOT NULL CHECK (price >= 0),
  category TEXT NOT NULL,
  popular BOOLEAN NOT NULL DEFAULT FALSE,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  customer_user_id UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  vendor_id UUID NOT NULL REFERENCES sokoeats_vendors(id),
  status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('cart','placed','accepted','preparing','ready','picked_up','delivered','cancelled')),
  subtotal INT NOT NULL,
  delivery_fee INT NOT NULL,
  service_fee INT NOT NULL DEFAULT 0,
  total INT NOT NULL,
  delivery_address TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sokoeats_orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES sokoeats_menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price INT NOT NULL,
  line_total INT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sokoeats_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  order_id UUID REFERENCES sokoeats_orders(id) ON DELETE SET NULL,
  requester_name TEXT NOT NULL,
  requester_email TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_team TEXT NOT NULL DEFAULT 'support',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES sokoeats_tickets(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sokoeats_orders_vendor ON sokoeats_orders(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_sokoeats_tickets_status ON sokoeats_tickets(status, priority);


CREATE TABLE IF NOT EXISTS sokoeats_screen_payloads (
  screen_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sokoeats_screen_payloads_gin ON sokoeats_screen_payloads USING GIN (payload);

ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS place_id TEXT;
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS service_radius_km NUMERIC(5,2) NOT NULL DEFAULT 5;
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS payment_collection_mode TEXT NOT NULL DEFAULT 'platform' CHECK (payment_collection_mode IN ('platform','direct'));
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'mpesa';
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS payment_account_type TEXT NOT NULL DEFAULT 'paybill' CHECK (payment_account_type IN ('paybill','till','wallet'));
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS payment_shortcode TEXT NOT NULL DEFAULT '4139123';
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS payout_method TEXT NOT NULL DEFAULT 'mpesa';
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS payout_schedule TEXT NOT NULL DEFAULT 'daily';
UPDATE sokoeats_vendors
SET payment_collection_mode = 'platform',
    payment_provider = 'mpesa',
    payment_account_type = 'paybill',
    payment_shortcode = '4139123'
WHERE payment_collection_mode = 'platform';

ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS pickup_latitude NUMERIC(10,7);
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS pickup_longitude NUMERIC(10,7);
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS dropoff_latitude NUMERIC(10,7);
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS dropoff_longitude NUMERIC(10,7);
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS route_polyline TEXT;
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS estimated_distance_km NUMERIC(7,2);
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS estimated_duration_min INT;

CREATE TABLE IF NOT EXISTS sokoeats_user_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sokoeats_users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Saved address',
  address TEXT NOT NULL,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  place_id TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_rider_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_user_id UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  order_id UUID REFERENCES sokoeats_orders(id) ON DELETE SET NULL,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  heading TEXT,
  accuracy_m NUMERIC(7,2),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_delivery_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES sokoeats_orders(id) ON DELETE CASCADE,
  rider_user_id UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  pickup_latitude NUMERIC(10,7) NOT NULL,
  pickup_longitude NUMERIC(10,7) NOT NULL,
  dropoff_latitude NUMERIC(10,7) NOT NULL,
  dropoff_longitude NUMERIC(10,7) NOT NULL,
  encoded_polyline TEXT,
  distance_km NUMERIC(7,2),
  duration_min INT,
  status TEXT NOT NULL DEFAULT 'planned',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_service_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('vendor','admin','support')),
  owner_id UUID,
  name TEXT NOT NULL,
  center_latitude NUMERIC(10,7) NOT NULL,
  center_longitude NUMERIC(10,7) NOT NULL,
  radius_km NUMERIC(6,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sokoeats_vendors_lat_lng ON sokoeats_vendors(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_sokoeats_user_addresses_user ON sokoeats_user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_sokoeats_rider_locations_order ON sokoeats_rider_locations(order_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_sokoeats_delivery_routes_order ON sokoeats_delivery_routes(order_id);
CREATE INDEX IF NOT EXISTS idx_sokoeats_service_zones_center ON sokoeats_service_zones(center_latitude, center_longitude);
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS discount_amount INT NOT NULL DEFAULT 0;
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('mpesa','card'));
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','failed'));
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS payment_provider_reference TEXT;

CREATE TABLE IF NOT EXISTS sokoeats_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  order_id UUID REFERENCES sokoeats_orders(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK (method IN ('mpesa','card')),
  provider TEXT NOT NULL,
  amount INT NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KES',
  status TEXT NOT NULL DEFAULT 'requires_action' CHECK (status IN ('requires_action','paid','failed','cancelled','expired')),
  phone TEXT NOT NULL,
  customer_email TEXT,
  provider_reference TEXT,
  action_url TEXT,
  prompt_message TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sokoeats_sms_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES sokoeats_orders(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  sender_id TEXT NOT NULL DEFAULT 'Ekazi',
  brand_name TEXT NOT NULL DEFAULT 'SokoEats',
  message TEXT NOT NULL,
  event TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued','sent','failed')),
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sokoeats_payment_intents_reference ON sokoeats_payment_intents(reference);
CREATE INDEX IF NOT EXISTS idx_sokoeats_payment_intents_order ON sokoeats_payment_intents(order_id);
CREATE INDEX IF NOT EXISTS idx_sokoeats_payment_intents_provider_reference ON sokoeats_payment_intents(provider_reference);
CREATE INDEX IF NOT EXISTS idx_sokoeats_sms_notifications_order ON sokoeats_sms_notifications(order_id, created_at DESC);


ALTER TABLE sokoeats_users DROP CONSTRAINT IF EXISTS sokoeats_users_role_check;
ALTER TABLE sokoeats_users ADD CONSTRAINT sokoeats_users_role_check CHECK (role IN ('customer','rider','courier','vendor','merchant','support','admin'));
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','review','suspended','disabled'));
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password' CHECK (auth_provider IN ('password','google','otp'));
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS default_address TEXT;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sokoeats_users_google_sub ON sokoeats_users(google_sub) WHERE google_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sokoeats_users_role_status ON sokoeats_users(role, status);

CREATE TABLE IF NOT EXISTS sokoeats_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES sokoeats_users(id) ON DELETE CASCADE,
  token_id TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'password',
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sokoeats_auth_sessions_user ON sokoeats_auth_sessions(user_id, created_at DESC);