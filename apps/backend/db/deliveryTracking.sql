BEGIN;
ALTER TABLE sokoeats_orders ADD COLUMN IF NOT EXISTS rider_arrived_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS sokoeats_order_tracking_events (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES sokoeats_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, event_type)
);
CREATE OR REPLACE FUNCTION sokoeats_capture_delivery_event() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO sokoeats_order_tracking_events(order_id,event_type,occurred_at)
      VALUES(NEW.id,'placed',NEW.created_at) ON CONFLICT DO NOTHING;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO sokoeats_order_tracking_events(order_id,event_type) VALUES(NEW.id,NEW.status) ON CONFLICT DO NOTHING;
    END IF;
    IF NEW.rider_user_id IS NOT NULL AND NEW.rider_user_id IS DISTINCT FROM OLD.rider_user_id THEN
      INSERT INTO sokoeats_order_tracking_events(order_id,event_type) VALUES(NEW.id,'rider_assigned') ON CONFLICT DO NOTHING;
    END IF;
    IF NEW.rider_arrived_at IS NOT NULL AND OLD.rider_arrived_at IS NULL THEN
      INSERT INTO sokoeats_order_tracking_events(order_id,event_type,occurred_at)
        VALUES(NEW.id,'arrived',NEW.rider_arrived_at) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sokoeats_delivery_event ON sokoeats_orders;
CREATE TRIGGER sokoeats_delivery_event AFTER INSERT OR UPDATE ON sokoeats_orders
  FOR EACH ROW EXECUTE FUNCTION sokoeats_capture_delivery_event();
INSERT INTO sokoeats_order_tracking_events(order_id,event_type,occurred_at)
  SELECT id,'placed',created_at FROM sokoeats_orders ON CONFLICT DO NOTHING;
COMMIT;
