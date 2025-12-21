-- apps/backend/scripts/migrations/20250207_org_portal.sql
-- Org portal scaffolding: fees, attendance, announcements, clubs, messaging

CREATE TABLE IF NOT EXISTS org_fee_structures (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_term TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_fee_structures_org ON org_fee_structures(org_id);

CREATE TABLE IF NOT EXISTS org_fee_structure_items (
  id BIGSERIAL PRIMARY KEY,
  structure_id BIGINT NOT NULL REFERENCES org_fee_structures(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  cadence TEXT,
  is_optional BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_fee_structure_items_structure ON org_fee_structure_items(structure_id);

ALTER TABLE org_fee_charges
  ADD COLUMN IF NOT EXISTS structure_id BIGINT REFERENCES org_fee_structures(id),
  ADD COLUMN IF NOT EXISTS structure_item_id BIGINT REFERENCES org_fee_structure_items(id),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE org_fee_payments
  ADD COLUMN IF NOT EXISTS charge_id BIGINT REFERENCES org_fee_charges(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

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

ALTER TABLE org_announcements
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS meeting_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meeting_location TEXT,
  ADD COLUMN IF NOT EXISTS meeting_url TEXT,
  ADD COLUMN IF NOT EXISTS agenda_md TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS org_sports_events (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_at TIMESTAMPTZ,
  location TEXT,
  audience TEXT DEFAULT 'all',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_sports_events_org ON org_sports_events(org_id);
CREATE INDEX IF NOT EXISTS idx_org_sports_events_time ON org_sports_events(event_at);

CREATE TABLE IF NOT EXISTS org_clubs (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  advisor_id UUID,
  meeting_schedule TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_clubs_org ON org_clubs(org_id);

CREATE TABLE IF NOT EXISTS org_club_memberships (
  id BIGSERIAL PRIMARY KEY,
  club_id BIGINT NOT NULL REFERENCES org_clubs(id) ON DELETE CASCADE,
  member_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (club_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_org_club_memberships_club ON org_club_memberships(club_id);

CREATE TABLE IF NOT EXISTS org_message_log (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  recipient_id UUID,
  channel TEXT,
  template_key TEXT,
  subject TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'queued',
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_message_log_org ON org_message_log(org_id);
CREATE INDEX IF NOT EXISTS idx_org_message_log_recipient ON org_message_log(recipient_id);
