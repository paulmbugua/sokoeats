-- Newsletters (Pro/Enterprise org tools)
-- Requires UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS org_newsletters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  term_label text,
  title text NOT NULL,
  content_md text NOT NULL DEFAULT '',

  -- draft | sending | sent | archived
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sending','sent','archived')),

  class_label text, -- optional targeting helper (e.g. "Grade 6 A")
  created_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_org_newsletters_org_updated
  ON org_newsletters (org_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS org_newsletter_recipients (
  id bigserial PRIMARY KEY,
  newsletter_id uuid NOT NULL REFERENCES org_newsletters(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  delivered boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(newsletter_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_org_newsletter_recipients_newsletter
  ON org_newsletter_recipients (newsletter_id);

CREATE INDEX IF NOT EXISTS idx_org_newsletter_recipients_delivered
  ON org_newsletter_recipients (newsletter_id, delivered);
