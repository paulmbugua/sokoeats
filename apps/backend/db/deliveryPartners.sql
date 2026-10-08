CREATE TABLE IF NOT EXISTS sokoeats_delivery_partner_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES sokoeats_users(id) ON DELETE CASCADE,
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('motorbike','foot')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','approved','declined')),
  passport_photo_key TEXT NOT NULL,
  national_id_copy_key TEXT NOT NULL,
  good_conduct_key TEXT NOT NULL,
  motorbike_photo_key TEXT,
  vehicle_type TEXT,
  registration_number TEXT,
  decline_reason_code TEXT,
  review_note TEXT,
  reviewed_by UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (delivery_mode <> 'motorbike' OR (motorbike_photo_key IS NOT NULL AND vehicle_type IS NOT NULL AND registration_number IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS sokoeats_delivery_partner_review_idx
  ON sokoeats_delivery_partner_applications(status, submitted_at DESC);
