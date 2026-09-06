ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS partner_terms_version text;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS partner_terms_role text;

CREATE TABLE IF NOT EXISTS sokoeats_terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES sokoeats_users(id),
  role text NOT NULL CHECK (role IN ('rider', 'vendor', 'merchant')),
  version text NOT NULL,
  document_hash text NOT NULL,
  document jsonb NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, version)
);
