-- Ekazi marketplace production migration
-- Run once against production before the first production release.
-- This captures the schema that runtime ensureMarketplaceSchema/ensureAuthSchema currently creates.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp VARCHAR(12);
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expiration TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_resend_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_last_sent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_email_sent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_estate TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_preference TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_rating_score NUMERIC(5,2) NOT NULL DEFAULT 100;
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_issue_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_warning_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_role_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_role_check;
  END IF;
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IS NULL OR btrim(role) <> '');
END $$;

CREATE TABLE IF NOT EXISTS ekazi_jobs (
  id BIGSERIAL PRIMARY KEY,
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT,
  category_name TEXT,
  service_name TEXT,
  description TEXT NOT NULL,
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  estate TEXT,
  city TEXT DEFAULT 'Nairobi',
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  schedule_type TEXT DEFAULT 'soon',
  scheduled_for TIMESTAMPTZ,
  flexible_schedule TEXT,
  budget_min NUMERIC(12,2),
  budget_max NUMERIC(12,2),
  provider_brings_materials BOOLEAN DEFAULT FALSE,
  notes TEXT,
  discount_code TEXT,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  accepted_quote_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ekazi_handyman_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT,
  bio TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',
  estate TEXT,
  city TEXT DEFAULT 'Nairobi',
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  service_radius_km NUMERIC(8,2) DEFAULT 20,
  rating_avg NUMERIC(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  jobs_completed INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  cancellation_count INTEGER NOT NULL DEFAULT 0,
  cancellation_score NUMERIC(5,2) NOT NULL DEFAULT 100,
  provider_decline_count INTEGER NOT NULL DEFAULT 0,
  provider_decline_score NUMERIC(5,2) NOT NULL DEFAULT 100,
  suspended_until TIMESTAMPTZ,
  profile_image_url TEXT,
  profile_image_status TEXT NOT NULL DEFAULT 'missing',
  id_document_url TEXT,
  id_document_status TEXT NOT NULL DEFAULT 'missing',
  certificate_url TEXT,
  certificate_status TEXT NOT NULL DEFAULT 'missing',
  good_conduct_url TEXT,
  good_conduct_status TEXT NOT NULL DEFAULT 'missing',
  verification_status TEXT NOT NULL DEFAULT 'incomplete',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ekazi_quotes (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES ekazi_jobs(id) ON DELETE CASCADE,
  handyman_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  labor NUMERIC(12,2) NOT NULL DEFAULT 0,
  materials NUMERIC(12,2) NOT NULL DEFAULT 0,
  transport NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  eta_minutes INTEGER,
  duration_hours NUMERIC(5,2),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  organization_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10,
  organization_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  handyman_payout_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  declined_at TIMESTAMPTZ,
  decline_reason TEXT,
  decline_reason_code TEXT,
  decline_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, handyman_user_id)
);

CREATE TABLE IF NOT EXISTS ekazi_bookings (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL UNIQUE REFERENCES ekazi_jobs(id) ON DELETE CASCADE,
  quote_id BIGINT NOT NULL REFERENCES ekazi_quotes(id) ON DELETE CASCADE,
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handyman_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  provider_settlement_status TEXT NOT NULL DEFAULT 'pending',
  organization_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10,
  organization_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  handyman_payout_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  cancelled_by TEXT,
  cancellation_reason TEXT,
  cancellation_reason_code TEXT,
  cancellation_notes TEXT,
  cancelled_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  client_rating INTEGER,
  client_review TEXT,
  client_reviewed_at TIMESTAMPTZ,
  handyman_latitude DOUBLE PRECISION,
  handyman_longitude DOUBLE PRECISION,
  handyman_location_accuracy DOUBLE PRECISION,
  handyman_location_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ekazi_job_dispatches (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES ekazi_jobs(id) ON DELETE CASCADE,
  handyman_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offered',
  offer_rank INTEGER NOT NULL DEFAULT 1,
  distance_km NUMERIC(8,2),
  reason TEXT NOT NULL DEFAULT 'created',
  notified_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, handyman_user_id)
);

CREATE TABLE IF NOT EXISTS ekazi_notification_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ekazi_client_issue_reports (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT REFERENCES ekazi_bookings(id) ON DELETE CASCADE,
  provider_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  client_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason_code TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  impact INTEGER NOT NULL DEFAULT 0,
  severe BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id, provider_user_id, reason_code)
);

CREATE TABLE IF NOT EXISTS ekazi_provider_commission_debts (
  id BIGSERIAL PRIMARY KEY,
  provider_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id BIGINT NOT NULL UNIQUE REFERENCES ekazi_bookings(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ekazi_provider_commission_payments (
  id BIGSERIAL PRIMARY KEY,
  provider_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  checkout_request_id TEXT,
  merchant_request_id TEXT,
  mpesa_receipt TEXT,
  mpesa_result_code INTEGER,
  mpesa_result_desc TEXT,
  raw_callback JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ekazi_provider_payouts (
  id BIGSERIAL PRIMARY KEY,
  provider_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_offset_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'mpesa',
  mpesa_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_ref TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ekazi_conversations (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL UNIQUE REFERENCES ekazi_bookings(id) ON DELETE CASCADE,
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handyman_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ekazi_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES ekazi_conversations(id) ON DELETE CASCADE,
  sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ekazi_handyman_verification_reviews (
  id BIGSERIAL PRIMARY KEY,
  handyman_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(handyman_user_id, document_type)
);

CREATE INDEX IF NOT EXISTS ekazi_jobs_client_status_idx ON ekazi_jobs(client_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ekazi_quotes_job_status_idx ON ekazi_quotes(job_id, status);
CREATE INDEX IF NOT EXISTS ekazi_quotes_provider_idx ON ekazi_quotes(handyman_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ekazi_bookings_client_idx ON ekazi_bookings(client_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ekazi_bookings_provider_idx ON ekazi_bookings(handyman_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ekazi_dispatch_provider_idx ON ekazi_job_dispatches(handyman_user_id, status, notified_at DESC);
CREATE INDEX IF NOT EXISTS ekazi_provider_commission_debts_provider_idx ON ekazi_provider_commission_debts(provider_user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ekazi_provider_commission_payments_provider_idx ON ekazi_provider_commission_payments(provider_user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ekazi_messages_conversation_idx ON ekazi_messages(conversation_id, created_at ASC);

COMMIT;
