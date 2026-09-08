CREATE TABLE IF NOT EXISTS sokoeats_admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 90),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 2 AND 500),
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','customers','riders','partners')),
  channel TEXT NOT NULL DEFAULT 'both' CHECK (channel IN ('in_app','push','both')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high')),
  action_label TEXT,
  action_url TEXT,
  created_by UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  push_attempted INTEGER NOT NULL DEFAULT 0,
  push_sent INTEGER NOT NULL DEFAULT 0,
  push_failed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES sokoeats_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('android','ios')),
  device_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sokoeats_notification_reads (
  notification_id UUID NOT NULL REFERENCES sokoeats_admin_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES sokoeats_users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS sokoeats_notification_dismissals (
  notification_id UUID NOT NULL REFERENCES sokoeats_admin_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES sokoeats_users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS sokoeats_notifications_created_idx ON sokoeats_admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS sokoeats_push_tokens_user_idx ON sokoeats_push_tokens(user_id, is_active);
