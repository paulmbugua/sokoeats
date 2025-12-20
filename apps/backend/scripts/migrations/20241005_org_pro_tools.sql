-- apps/backend/scripts/migrations/20241005_org_pro_tools.sql
-- Pro/Enterprise org tools

CREATE TABLE IF NOT EXISTS org_attendance_sessions (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  instructor_id UUID,
  session_date DATE NOT NULL,
  class_label TEXT,
  period_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_attendance_entries (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES org_attendance_sessions(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (session_id, learner_id)
);

CREATE INDEX IF NOT EXISTS idx_org_attendance_entries_session ON org_attendance_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_org_attendance_sessions_org ON org_attendance_sessions(org_id);

CREATE TABLE IF NOT EXISTS org_fee_charges (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  learner_id UUID NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  class_label TEXT,
  description TEXT,
  due_date DATE,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_fee_charges_org_learner ON org_fee_charges(org_id, learner_id);

CREATE TABLE IF NOT EXISTS org_fee_payments (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  learner_id UUID NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  method TEXT,
  reference TEXT,
  note TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);
CREATE INDEX IF NOT EXISTS idx_org_fee_payments_org_learner ON org_fee_payments(org_id, learner_id);

CREATE TABLE IF NOT EXISTS org_newsletters (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  term_label TEXT,
  title TEXT NOT NULL,
  content_md TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  created_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_newsletter_recipients (
  id BIGSERIAL PRIMARY KEY,
  newsletter_id BIGINT NOT NULL REFERENCES org_newsletters(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  delivered BOOLEAN DEFAULT FALSE,
  delivery_result TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_newsletter_recipients_newsletter ON org_newsletter_recipients(newsletter_id);

CREATE TABLE IF NOT EXISTS org_announcements (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  author_id UUID,
  audience TEXT NOT NULL DEFAULT 'all',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned BOOLEAN DEFAULT FALSE,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_announcements_org ON org_announcements(org_id);
