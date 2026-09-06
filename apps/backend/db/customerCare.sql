CREATE SEQUENCE IF NOT EXISTS sokoeats_application_number_seq;
ALTER TABLE sokoeats_users ADD COLUMN IF NOT EXISTS application_reference text UNIQUE;
CREATE OR REPLACE FUNCTION sokoeats_assign_application_reference() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.application_reference IS NOT NULL THEN
    NEW.application_reference := OLD.application_reference;
  ELSIF NEW.role IN ('vendor','merchant') THEN
    NEW.application_reference := 'SKO-APP-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('sokoeats_application_number_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sokoeats_application_reference ON sokoeats_users;
CREATE TRIGGER sokoeats_application_reference BEFORE INSERT OR UPDATE ON sokoeats_users
FOR EACH ROW EXECUTE FUNCTION sokoeats_assign_application_reference();
UPDATE sokoeats_users SET application_reference = NULL WHERE role IN ('vendor','merchant') AND application_reference IS NULL;

CREATE TABLE IF NOT EXISTS sokoeats_chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES sokoeats_users(id),
  ticket_id uuid NOT NULL UNIQUE REFERENCES sokoeats_tickets(id),
  version integer NOT NULL DEFAULT 0,
  customer_read_sequence integer NOT NULL DEFAULT 0,
  staff_read_sequence integer NOT NULL DEFAULT 0,
  assigned_user_id uuid REFERENCES sokoeats_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sokoeats_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES sokoeats_chat_conversations(id),
  sequence integer NOT NULL,
  client_message_id uuid NOT NULL,
  sender_id uuid NOT NULL REFERENCES sokoeats_users(id),
  sender_kind text NOT NULL CHECK (sender_kind IN ('customer','support')),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, sequence),
  UNIQUE (conversation_id, sender_id, client_message_id)
);
CREATE INDEX IF NOT EXISTS sokoeats_chat_inbox ON sokoeats_chat_conversations(updated_at DESC);

CREATE OR REPLACE FUNCTION sokoeats_chat_ticket_changed() RETURNS trigger AS $$
BEGIN
  UPDATE sokoeats_chat_conversations SET version=version+1, updated_at=now() WHERE ticket_id=NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sokoeats_chat_ticket_changed ON sokoeats_tickets;
CREATE TRIGGER sokoeats_chat_ticket_changed AFTER UPDATE OF status ON sokoeats_tickets
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION sokoeats_chat_ticket_changed();
