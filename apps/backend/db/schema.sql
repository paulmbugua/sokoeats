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
