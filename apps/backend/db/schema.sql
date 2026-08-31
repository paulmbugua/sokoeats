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

-- Marketplace shop taxonomy and vendor-editable product sections.
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS shop_type TEXT NOT NULL DEFAULT 'restaurants' CHECK (shop_type IN ('restaurants','groceries','pharmacy','gas','electronics'));
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS tagline TEXT;

CREATE TABLE IF NOT EXISTS sokoeats_menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES sokoeats_vendors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id, title)
);

ALTER TABLE sokoeats_menu_items ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sokoeats_menu_categories(id) ON DELETE SET NULL;
ALTER TABLE sokoeats_menu_items ADD COLUMN IF NOT EXISTS unit_label TEXT;
ALTER TABLE sokoeats_menu_items ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE sokoeats_menu_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_sokoeats_vendors_shop_type ON sokoeats_vendors(shop_type, status, rating DESC);
CREATE INDEX IF NOT EXISTS idx_sokoeats_menu_categories_vendor ON sokoeats_menu_categories(vendor_id, sort_order, title);
CREATE INDEX IF NOT EXISTS idx_sokoeats_menu_items_section ON sokoeats_menu_items(section_id, available, sort_order, name);


CREATE TABLE IF NOT EXISTS sokoeats_scan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_reference TEXT UNIQUE NOT NULL REFERENCES sokoeats_payment_intents(reference) ON DELETE CASCADE,
  vendor_id UUID REFERENCES sokoeats_vendors(id) ON DELETE SET NULL,
  vendor_slug TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  amount INT NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KES',
  status TEXT NOT NULL DEFAULT 'requires_action' CHECK (status IN ('requires_action','paid','failed','cancelled','expired')),
  notes TEXT,
  qr_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sokoeats_scan_payments_vendor ON sokoeats_scan_payments(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sokoeats_scan_payments_status ON sokoeats_scan_payments(status, created_at DESC);

ALTER TABLE sokoeats_payment_intents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL;
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL;
DROP INDEX IF EXISTS sokoeats_vendors_owner_user_unique;
CREATE INDEX IF NOT EXISTS sokoeats_vendors_owner_user_idx ON sokoeats_vendors(owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sokoeats_payment_intents_user_idx ON sokoeats_payment_intents(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sokoeats_auth_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES sokoeats_users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Marketplace finance, compliance, ledger, and settlement subsystem.
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS risk_tier TEXT NOT NULL DEFAULT 'new'
  CHECK (risk_tier IN ('new','standard','trusted','restricted'));
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS commission_rate_bps INT NOT NULL DEFAULT 1500
  CHECK (commission_rate_bps BETWEEN 0 AND 5000);
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'not_submitted'
  CHECK (verification_status IN ('not_submitted','submitted','under_review','verified','rejected','suspended'));
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'not_configured'
  CHECK (payout_status IN ('not_configured','configuration_required','pending_verification','active','frozen','disabled'));
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS rider_user_id UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL;
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS finance_state TEXT NOT NULL DEFAULT 'UNINITIALIZED';

CREATE TABLE IF NOT EXISTS sokoeats_vendor_compliance (
  vendor_id UUID PRIMARY KEY REFERENCES sokoeats_vendors(id) ON DELETE CASCADE,
  legal_business_name TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  kra_pin_encrypted BYTEA NOT NULL,
  kra_pin_last4 TEXT NOT NULL,
  director_name TEXT NOT NULL,
  director_national_id_encrypted BYTEA NOT NULL,
  director_national_id_last4 TEXT NOT NULL,
  settlement_method TEXT NOT NULL CHECK (settlement_method IN ('mpesa_wallet','mpesa_till','mpesa_paybill','bank')),
  settlement_bank_code TEXT,
  settlement_account_encrypted BYTEA NOT NULL,
  settlement_account_last4 TEXT NOT NULL,
  psp_provider TEXT NOT NULL DEFAULT 'paystack',
  psp_subaccount_id TEXT,
  psp_recipient_code TEXT,
  commission_rate_bps INT NOT NULL DEFAULT 1500 CHECK (commission_rate_bps BETWEEN 0 AND 5000),
  commission_agreement_version TEXT NOT NULL,
  commission_agreed_at TIMESTAMPTZ NOT NULL,
  commission_agreed_by UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  verification_status TEXT NOT NULL DEFAULT 'submitted' CHECK (verification_status IN ('submitted','under_review','verified','rejected','suspended')),
  verification_note TEXT,
  verified_by UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  payout_status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (payout_status IN ('configuration_required','pending_verification','active','frozen','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_payout_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('vendor','rider')),
  vendor_id UUID REFERENCES sokoeats_vendors(id) ON DELETE CASCADE,
  rider_user_id UUID REFERENCES sokoeats_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'paystack',
  method TEXT NOT NULL CHECK (method IN ('mpesa_wallet','mpesa_till','mpesa_paybill','bank')),
  bank_code TEXT,
  account_number_encrypted BYTEA NOT NULL,
  account_last4 TEXT NOT NULL,
  recipient_code TEXT,
  schedule TEXT NOT NULL DEFAULT 'daily' CHECK (schedule IN ('immediate','daily')),
  status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('configuration_required','pending_verification','active','frozen','disabled')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((owner_type = 'vendor' AND vendor_id IS NOT NULL AND rider_user_id IS NULL) OR
         (owner_type = 'rider' AND rider_user_id IS NOT NULL AND vendor_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS sokoeats_payout_profiles_vendor_unique ON sokoeats_payout_profiles(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sokoeats_payout_profiles_rider_unique ON sokoeats_payout_profiles(rider_user_id) WHERE rider_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sokoeats_ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset','liability','revenue','expense','equity')),
  owner_type TEXT NOT NULL DEFAULT 'platform' CHECK (owner_type IN ('platform','vendor','rider','customer','provider','reserve')),
  owner_id UUID,
  currency TEXT NOT NULL DEFAULT 'KES',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_ledger_journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  order_id UUID REFERENCES sokoeats_orders(id) ON DELETE RESTRICT,
  payment_intent_id UUID REFERENCES sokoeats_payment_intents(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sokoeats_ledger_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID NOT NULL REFERENCES sokoeats_ledger_journals(id) ON DELETE RESTRICT,
  line_no INT NOT NULL,
  account_id UUID NOT NULL REFERENCES sokoeats_ledger_accounts(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount INT NOT NULL CHECK (amount > 0),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(journal_id, line_no)
);

CREATE OR REPLACE FUNCTION sokoeats_prevent_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Posted SokoEats ledger records are immutable; post a reversing journal instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sokoeats_ledger_journal_immutable ON sokoeats_ledger_journals;
CREATE TRIGGER sokoeats_ledger_journal_immutable BEFORE UPDATE OR DELETE ON sokoeats_ledger_journals
FOR EACH ROW EXECUTE FUNCTION sokoeats_prevent_ledger_mutation();
DROP TRIGGER IF EXISTS sokoeats_ledger_line_immutable ON sokoeats_ledger_lines;
CREATE TRIGGER sokoeats_ledger_line_immutable BEFORE UPDATE OR DELETE ON sokoeats_ledger_lines
FOR EACH ROW EXECUTE FUNCTION sokoeats_prevent_ledger_mutation();

CREATE OR REPLACE FUNCTION sokoeats_assert_journal_balanced() RETURNS trigger AS $$
DECLARE debit_total BIGINT; credit_total BIGINT; target UUID;
BEGIN
  target := COALESCE(NEW.journal_id, OLD.journal_id);
  SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'debit'),0),
         COALESCE(SUM(amount) FILTER (WHERE direction = 'credit'),0)
    INTO debit_total, credit_total FROM sokoeats_ledger_lines WHERE journal_id = target;
  IF debit_total <> credit_total THEN
    RAISE EXCEPTION 'Unbalanced SokoEats journal %, debits %, credits %', target, debit_total, credit_total;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sokoeats_ledger_balance_guard ON sokoeats_ledger_lines;
CREATE CONSTRAINT TRIGGER sokoeats_ledger_balance_guard
AFTER INSERT ON sokoeats_ledger_lines DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sokoeats_assert_journal_balanced();

CREATE TABLE IF NOT EXISTS sokoeats_order_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID UNIQUE NOT NULL REFERENCES sokoeats_orders(id) ON DELETE RESTRICT,
  payment_intent_id UUID NOT NULL REFERENCES sokoeats_payment_intents(id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES sokoeats_vendors(id) ON DELETE RESTRICT,
  rider_user_id UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  state TEXT NOT NULL CHECK (state IN ('PAYMENT_CONFIRMED','VENDOR_ACCEPTED','RIDER_ASSIGNED','PICKED_UP','DELIVERY_OTP_CONFIRMED','PAYOUT_ELIGIBLE','SETTLED','CANCELLED','REFUNDED')),
  vendor_gross INT NOT NULL,
  vendor_commission INT NOT NULL,
  vendor_net INT NOT NULL,
  service_fee INT NOT NULL,
  delivery_fee INT NOT NULL,
  rider_entitlement INT NOT NULL,
  psp_charge INT NOT NULL DEFAULT 0,
  reserve_amount INT NOT NULL DEFAULT 0,
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('new','standard','trusted','restricted')),
  vendor_release_at TIMESTAMPTZ,
  rider_release_at TIMESTAMPTZ,
  delivery_otp_hash TEXT NOT NULL,
  otp_verified_at TIMESTAMPTZ,
  vendor_accepted_at TIMESTAMPTZ,
  rider_assigned_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  payout_eligible_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  dispute_status TEXT NOT NULL DEFAULT 'none' CHECK (dispute_status IN ('none','open','resolved_customer','resolved_vendor','resolved_partial')),
  frozen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_settlement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES sokoeats_order_settlements(id) ON DELETE RESTRICT,
  from_state TEXT,
  to_state TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  settlement_id UUID NOT NULL REFERENCES sokoeats_order_settlements(id) ON DELETE RESTRICT,
  beneficiary_type TEXT NOT NULL CHECK (beneficiary_type IN ('vendor','rider')),
  vendor_id UUID REFERENCES sokoeats_vendors(id) ON DELETE RESTRICT,
  rider_user_id UUID REFERENCES sokoeats_users(id) ON DELETE RESTRICT,
  amount INT NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KES',
  provider TEXT NOT NULL DEFAULT 'paystack',
  recipient_code TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','queued','otp','processing','paid','failed','frozen','cancelled')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  provider_reference TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(settlement_id, beneficiary_type)
);

CREATE TABLE IF NOT EXISTS sokoeats_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES sokoeats_orders(id) ON DELETE RESTRICT,
  payment_intent_id UUID NOT NULL REFERENCES sokoeats_payment_intents(id) ON DELETE RESTRICT,
  amount INT NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','submitted','processing','paid','failed','cancelled')),
  provider_reference TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_finance_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES sokoeats_order_settlements(id) ON DELETE RESTRICT,
  opened_by UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved_customer','resolved_vendor','resolved_partial')),
  resolution_note TEXT,
  resolved_by UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sokoeats_ledger_journals_order_idx ON sokoeats_ledger_journals(order_id, posted_at);
CREATE INDEX IF NOT EXISTS sokoeats_ledger_lines_account_idx ON sokoeats_ledger_lines(account_id, created_at);
CREATE INDEX IF NOT EXISTS sokoeats_settlements_state_release_idx ON sokoeats_order_settlements(state, vendor_release_at, rider_release_at);
CREATE INDEX IF NOT EXISTS sokoeats_payouts_due_idx ON sokoeats_payouts(status, scheduled_for);
CREATE INDEX IF NOT EXISTS sokoeats_refunds_order_idx ON sokoeats_refunds(order_id, created_at DESC);
