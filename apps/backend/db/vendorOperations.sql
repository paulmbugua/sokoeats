ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS accepting_orders BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sokoeats_vendors ADD COLUMN IF NOT EXISTS rating_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sokoeats_vendor_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES sokoeats_vendors(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES sokoeats_orders(id) ON DELETE CASCADE,
  customer_user_id UUID REFERENCES sokoeats_users(id) ON DELETE SET NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_sokoeats_vendor_reviews_vendor
  ON sokoeats_vendor_reviews(vendor_id, created_at DESC);

UPDATE sokoeats_vendors v SET
  rating = summary.average_rating,
  rating_count = summary.rating_count
FROM (
  SELECT vendor_id, ROUND(AVG(rating)::numeric, 1) AS average_rating, COUNT(*)::int AS rating_count
  FROM sokoeats_vendor_reviews
  GROUP BY vendor_id
) summary
WHERE summary.vendor_id = v.id;
