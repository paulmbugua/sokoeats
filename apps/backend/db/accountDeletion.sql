ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_sokoeats_users_deleted_at ON sokoeats_users(deleted_at) WHERE deleted_at IS NOT NULL;
