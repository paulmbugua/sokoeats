import pool from '../config/db.js';

let schemaPromise;

export function ensureMarketplaceSchema() {
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS ekazi_jobs (
        id BIGSERIAL PRIMARY KEY,
        client_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL, category_name TEXT, service_id TEXT, service_name TEXT,
        description TEXT NOT NULL, photo_urls TEXT[] NOT NULL DEFAULT '{}',
        estate TEXT NOT NULL, city TEXT NOT NULL DEFAULT 'Nairobi', address TEXT,
        latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
        schedule_type TEXT NOT NULL, scheduled_for TIMESTAMPTZ,
        flexible_schedule BOOLEAN NOT NULL DEFAULT FALSE,
        budget_min NUMERIC(12,2), budget_max NUMERIC(12,2),
        provider_brings_materials BOOLEAN NOT NULL DEFAULT FALSE, notes TEXT,
        status TEXT NOT NULL DEFAULT 'active', discount_code TEXT,
        discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0, accepted_quote_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ekazi_handyman_profiles (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        business_name TEXT, categories TEXT[] NOT NULL DEFAULT '{}',
        address TEXT, estate TEXT, city TEXT NOT NULL DEFAULT 'Nairobi',
        latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
        service_radius_km NUMERIC(8,2) NOT NULL DEFAULT 20, bio TEXT,
        verified BOOLEAN NOT NULL DEFAULT FALSE, rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
        rating_count INTEGER NOT NULL DEFAULT 0, jobs_completed INTEGER NOT NULL DEFAULT 0,
        cancellation_count INTEGER NOT NULL DEFAULT 0,
        cancellation_score NUMERIC(5,2) NOT NULL DEFAULT 100,
        suspended_until TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ekazi_quotes (
        id BIGSERIAL PRIMARY KEY,
        job_id BIGINT NOT NULL REFERENCES ekazi_jobs(id) ON DELETE CASCADE,
        handyman_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        labor NUMERIC(12,2) NOT NULL DEFAULT 0, materials NUMERIC(12,2) NOT NULL DEFAULT 0,
        transport NUMERIC(12,2) NOT NULL DEFAULT 0, subtotal NUMERIC(12,2) NOT NULL,
        discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0, total NUMERIC(12,2) NOT NULL,
        message TEXT, eta_minutes INTEGER, duration_hours NUMERIC(8,2),
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(job_id, handyman_user_id)
      );
      CREATE TABLE IF NOT EXISTS ekazi_bookings (
        id BIGSERIAL PRIMARY KEY,
        job_id BIGINT NOT NULL UNIQUE REFERENCES ekazi_jobs(id) ON DELETE CASCADE,
        quote_id BIGINT NOT NULL UNIQUE REFERENCES ekazi_quotes(id) ON DELETE CASCADE,
        client_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        handyman_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subtotal NUMERIC(12,2) NOT NULL, discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL,
        organization_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 15,
        organization_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        handyman_payout_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'confirmed',
        cancelled_by TEXT,
        cancellation_reason TEXT,
        cancellation_reason_code TEXT,
        cancellation_notes TEXT,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ekazi_jobs_client_idx ON ekazi_jobs(client_user_id,status,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_jobs_open_idx ON ekazi_jobs(status,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_quotes_job_idx ON ekazi_quotes(job_id,status,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_quotes_handyman_idx ON ekazi_quotes(handyman_user_id,status,created_at DESC);
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS cancellation_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS cancellation_score NUMERIC(5,2) NOT NULL DEFAULT 100;
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS organization_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 15;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS organization_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS handyman_payout_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS cancellation_reason_code TEXT;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS cancellation_notes TEXT;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_warning_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
    `).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

export function jobJson(row) {
  return row && {
    id: String(row.id),
    clientUserId: String(row.client_user_id),
    categoryId: row.category_id,
    categoryName: row.category_name,
    serviceId: row.service_id,
    serviceName: row.service_name,
    description: row.description,
    photoUrls: row.photo_urls || [],
    estate: row.estate,
    city: row.city,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    scheduleType: row.schedule_type,
    scheduledFor: row.scheduled_for,
    flexibleSchedule: row.flexible_schedule,
    budgetMin: row.budget_min == null ? null : Number(row.budget_min),
    budgetMax: row.budget_max == null ? null : Number(row.budget_max),
    providerBringsMaterials: row.provider_brings_materials,
    notes: row.notes,
    status: row.status,
    discountCode: row.discount_code,
    discountPercent: Number(row.discount_percent || 0),
    quoteCount: Number(row.quote_count || 0),
    createdAt: row.created_at,
  };
}

export function quoteJson(row) {
  return row && {
    id: String(row.id),
    jobId: String(row.job_id),
    labor: Number(row.labor || 0),
    materials: Number(row.materials || 0),
    transport: Number(row.transport || 0),
    subtotal: Number(row.subtotal || 0),
    discountAmount: Number(row.discount_amount || 0),
    total: Number(row.total || 0),
    message: row.message || '',
    etaMinutes: row.eta_minutes,
    durationHours: row.duration_hours == null ? null : Number(row.duration_hours),
    status: row.status,
    createdAt: row.created_at,
    pro: {
      id: String(row.handyman_user_id),
      name: row.business_name || row.handyman_name || 'Ekazi Handyman',
      ratingAvg: Number(row.rating_avg || 0),
      ratingCount: Number(row.rating_count || 0),
      verifiedId: Boolean(row.verified),
      jobsCompleted: Number(row.jobs_completed || 0),
      cancellationScore: Number(row.cancellation_score || 100),
      suspendedUntil: row.suspended_until || null,
      phone: row.handyman_phone || row.phone || null,
    },
    commission: {
      percent: Number(row.organization_commission_percent || 15),
      amount: Number(row.organization_commission_amount || 0),
      handymanPayout: Number(row.handyman_payout_amount || 0),
    },
  };
}
