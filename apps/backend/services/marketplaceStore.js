import pool from '../config/db.js';

let schemaPromise;

function normalizePublicAssetUrl(url) {
  if (!url) return null;
  const targetBase = String(process.env.R2_PUBLIC_BASE_URL_IMAGES || 'https://images.ekazi.co.ke').replace(/\/+$/, '');
  return String(url)
    .replace(/^https?:\/\/image\.desiredoha\.com/i, targetBase)
    .replace(/^https?:\/\/images\.desiredoha\.com/i, targetBase);
}


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
        organization_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10,
        organization_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        handyman_payout_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'confirmed',
        payment_method TEXT NOT NULL DEFAULT 'cash',
        payment_status TEXT NOT NULL DEFAULT 'unpaid',
        provider_settlement_status TEXT NOT NULL DEFAULT 'pending',
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ekazi_job_dispatches (
        id BIGSERIAL PRIMARY KEY,
        job_id BIGINT NOT NULL REFERENCES ekazi_jobs(id) ON DELETE CASCADE,
        handyman_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'offered',
        offer_rank INTEGER NOT NULL DEFAULT 0,
        distance_km NUMERIC(10,2),
        reason TEXT NOT NULL DEFAULT 'created',
        notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        responded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(job_id, handyman_user_id)
      );
      CREATE TABLE IF NOT EXISTS ekazi_notification_events (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        profile_id TEXT,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ekazi_job_dispatches_job_idx ON ekazi_job_dispatches(job_id,status,offer_rank);
      CREATE INDEX IF NOT EXISTS ekazi_job_dispatches_provider_idx ON ekazi_job_dispatches(handyman_user_id,status,created_at DESC);
      CREATE TABLE IF NOT EXISTS ekazi_client_issue_reports (
        id BIGSERIAL PRIMARY KEY,
        booking_id BIGINT REFERENCES ekazi_bookings(id) ON DELETE CASCADE,
        job_id BIGINT REFERENCES ekazi_jobs(id) ON DELETE CASCADE,
        client_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason_code TEXT NOT NULL,
        reason TEXT NOT NULL,
        impact_points INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'pending_review',
        reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(booking_id, provider_user_id, reason_code)
      );
      CREATE INDEX IF NOT EXISTS ekazi_notification_events_user_idx ON ekazi_notification_events(user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_client_issue_reports_client_idx ON ekazi_client_issue_reports(client_user_id,status,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_client_issue_reports_provider_idx ON ekazi_client_issue_reports(provider_user_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS ekazi_provider_commission_debts (
        id BIGSERIAL PRIMARY KEY,
        provider_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        booking_id BIGINT NOT NULL UNIQUE REFERENCES ekazi_bookings(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'due',
        notified_at TIMESTAMPTZ,
        settled_by_payout_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        settled_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS ekazi_provider_commission_payments (
        id BIGSERIAL PRIMARY KEY,
        provider_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'KES',
        phone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        checkout_request_id TEXT UNIQUE,
        merchant_request_id TEXT,
        mpesa_receipt TEXT,
        mpesa_result_code INTEGER,
        mpesa_result_desc TEXT,
        raw_request JSONB,
        raw_callback JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS ekazi_provider_commission_payments_provider_idx ON ekazi_provider_commission_payments(provider_user_id,status,created_at DESC);
      CREATE TABLE IF NOT EXISTS ekazi_provider_payouts (
        id BIGSERIAL PRIMARY KEY,
        provider_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        commission_offset_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'KES',
        method TEXT NOT NULL DEFAULT 'mpesa',
        mpesa_phone TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        provider_reference TEXT,
        originator_conversation_id TEXT,
        conversation_id TEXT,
        result_code INTEGER,
        result_desc TEXT,
        raw_response JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE ekazi_provider_commission_debts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      CREATE INDEX IF NOT EXISTS ekazi_provider_commission_debts_provider_idx ON ekazi_provider_commission_debts(provider_user_id,status,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_provider_payouts_provider_idx ON ekazi_provider_payouts(provider_user_id,status,created_at DESC);
      CREATE TABLE IF NOT EXISTS ekazi_conversations (
        id BIGSERIAL PRIMARY KEY,
        booking_id BIGINT NOT NULL UNIQUE REFERENCES ekazi_bookings(id) ON DELETE CASCADE,
        job_id BIGINT NOT NULL REFERENCES ekazi_jobs(id) ON DELETE CASCADE,
        client_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        handyman_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'open',
        last_message TEXT,
        last_message_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ekazi_messages (
        id BIGSERIAL PRIMARY KEY,
        conversation_id BIGINT NOT NULL REFERENCES ekazi_conversations(id) ON DELETE CASCADE,
        sender_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ekazi_jobs_client_idx ON ekazi_jobs(client_user_id,status,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_jobs_open_idx ON ekazi_jobs(status,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_quotes_job_idx ON ekazi_quotes(job_id,status,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_quotes_handyman_idx ON ekazi_quotes(handyman_user_id,status,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_conversations_client_idx ON ekazi_conversations(client_user_id,last_message_at DESC,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_conversations_handyman_idx ON ekazi_conversations(handyman_user_id,last_message_at DESC,created_at DESC);
      CREATE INDEX IF NOT EXISTS ekazi_messages_conversation_idx ON ekazi_messages(conversation_id,created_at ASC);
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS provider_decline_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS provider_decline_score NUMERIC(5,2) NOT NULL DEFAULT 100;
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS cancellation_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS cancellation_score NUMERIC(5,2) NOT NULL DEFAULT 100;
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS profile_image_status TEXT NOT NULL DEFAULT 'missing';
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS id_document_url TEXT;
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS id_document_status TEXT NOT NULL DEFAULT 'missing';
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS certificate_url TEXT;
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS certificate_status TEXT NOT NULL DEFAULT 'missing';
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS good_conduct_url TEXT;
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS good_conduct_status TEXT NOT NULL DEFAULT 'missing';
      ALTER TABLE ekazi_handyman_profiles ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'incomplete';
      CREATE TABLE IF NOT EXISTS ekazi_handyman_verification_reviews (
        id BIGSERIAL PRIMARY KEY,
        handyman_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        document_type TEXT NOT NULL,
        document_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(handyman_user_id, document_type)
      );
      CREATE INDEX IF NOT EXISTS ekazi_handyman_verification_reviews_status_idx ON ekazi_handyman_verification_reviews(status, created_at DESC);
            ALTER TABLE ekazi_provider_commission_debts ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS provider_settlement_status TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS organization_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10;
      ALTER TABLE ekazi_bookings ALTER COLUMN organization_commission_percent SET DEFAULT 10;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS organization_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS handyman_payout_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS cancellation_reason_code TEXT;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS cancellation_notes TEXT;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
      ALTER TABLE ekazi_quotes ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;
      ALTER TABLE ekazi_quotes ADD COLUMN IF NOT EXISTS decline_reason TEXT;
      ALTER TABLE ekazi_quotes ADD COLUMN IF NOT EXISTS decline_reason_code TEXT;
      ALTER TABLE ekazi_quotes ADD COLUMN IF NOT EXISTS decline_notes TEXT;
      ALTER TABLE ekazi_job_dispatches ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT 'created';
      ALTER TABLE ekazi_job_dispatches ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
      ALTER TABLE ekazi_job_dispatches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE ekazi_notification_events ADD COLUMN IF NOT EXISTS profile_id TEXT;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS client_rating INTEGER;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS client_review TEXT;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS client_reviewed_at TIMESTAMPTZ;
      DO $$ BEGIN
        ALTER TABLE ekazi_bookings ADD CONSTRAINT ekazi_bookings_client_rating_range CHECK (client_rating IS NULL OR (client_rating BETWEEN 1 AND 5)) NOT VALID;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS handyman_latitude DOUBLE PRECISION;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS handyman_longitude DOUBLE PRECISION;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS handyman_location_accuracy DOUBLE PRECISION;
      ALTER TABLE ekazi_bookings ADD COLUMN IF NOT EXISTS handyman_location_updated_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS client_rating_score NUMERIC(5,2) NOT NULL DEFAULT 100;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS client_issue_count INTEGER NOT NULL DEFAULT 0;
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
    photoUrls: (Array.isArray(row.photo_urls) ? row.photo_urls : []).map(normalizePublicAssetUrl).filter(Boolean),
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
    booking: row.booking_id
      ? {
          id: String(row.booking_id),
          quoteId: row.booking_quote_id ? String(row.booking_quote_id) : row.accepted_quote_id ? String(row.accepted_quote_id) : null,
          status: row.booking_status || null,
          completedAt: row.booking_completed_at || null,
          cancelledAt: row.booking_cancelled_at || null,
          providerName: row.booking_provider_business_name || row.booking_provider_name || 'Ekazi Provider',
          review: row.booking_client_rating == null
            ? null
            : {
                rating: Number(row.booking_client_rating),
                comment: row.booking_client_review || '',
                reviewedAt: row.booking_client_reviewed_at || null,
              },
        }
      : null,
    createdAt: row.created_at,
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
    nearestRank: row.nearest_rank == null ? null : Number(row.nearest_rank),
  };
}

function quoteCommissionJson(row) {
  const percent = Number(row.organization_commission_percent || 10);
  const amount = row.organization_commission_amount == null
    ? Math.max(0, Math.round(Number(row.labor || 0) * percent) / 100 - Number(row.discount_amount || 0))
    : Number(row.organization_commission_amount || 0);
  const payout = row.handyman_payout_amount == null
    ? Math.max(0, Number(row.total || 0) - amount)
    : Number(row.handyman_payout_amount || 0);
  return { percent, amount, handymanPayout: payout };
}

function providerReviewsJson(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return [];
          }
        })()
      : [];
  return source
    .map((item) => ({
      rating: item?.rating == null ? null : Number(item.rating),
      comment: String(item?.comment || '').trim(),
      reviewedAt: item?.reviewedAt || null,
    }))
    .filter((item) => item.rating != null && item.comment);
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
      name: row.business_name || row.handyman_name || 'Ekazi Provider',
      ratingAvg: Number(row.rating_avg || 0),
      ratingCount: Number(row.rating_count || 0),
      verifiedId: Boolean(row.verified),
      profileImageUrl: normalizePublicAssetUrl(row.profile_image_url),
      idDocumentStatus: row.id_document_status || 'missing',
      profileImageStatus: row.profile_image_status || 'missing',
      certificateStatus: row.certificate_status || 'missing',
      goodConductStatus: row.good_conduct_status || 'missing',
      fullyVerified: Boolean(row.verified && row.certificate_status === 'approved' && row.good_conduct_status === 'approved'),
      verificationStatus: row.verification_status || (row.verified ? 'active' : 'incomplete'),
      jobsCompleted: Number(row.jobs_completed || 0),
      cancellationScore: Number(row.cancellation_score || 100),
      suspendedUntil: row.suspended_until || null,
      phone: row.handyman_phone || row.phone || null,
      reviews: providerReviewsJson(row.provider_reviews),
    },
    commission: quoteCommissionJson(row),
  };
}



