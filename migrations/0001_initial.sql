CREATE TABLE default_items(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL CHECK(owner_id IN ('partner-a','partner-b')),label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 100),kind TEXT NOT NULL CHECK(kind IN ('income','allocation','transfer_out')),position INTEGER NOT NULL CHECK(position>=0));
CREATE TABLE periods(id TEXT PRIMARY KEY CHECK(id ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),created_at BIGINT NOT NULL);
CREATE TABLE budgets(period_id TEXT NOT NULL REFERENCES periods(id),owner_id TEXT NOT NULL CHECK(owner_id IN ('partner-a','partner-b')),created_at BIGINT NOT NULL,PRIMARY KEY(period_id,owner_id));
CREATE TABLE budget_items(id TEXT PRIMARY KEY CHECK(length(id)=32),period_id TEXT NOT NULL,owner_id TEXT NOT NULL,label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 100),kind TEXT NOT NULL CHECK(kind IN ('income','allocation','transfer_out')),amount BIGINT CHECK(amount IS NULL OR (amount BETWEEN 0 AND 1000000000000)),position INTEGER NOT NULL CHECK(position>=0),label_version INTEGER NOT NULL DEFAULT 1 CHECK(label_version>=1),amount_version INTEGER NOT NULL DEFAULT 1 CHECK(amount_version>=1),row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version>=1),created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,deleted_at BIGINT,FOREIGN KEY(period_id,owner_id) REFERENCES budgets(period_id,owner_id),UNIQUE(id,period_id,owner_id));
CREATE INDEX items_period ON budget_items(period_id,owner_id,deleted_at,kind,position,id);
CREATE TABLE expenses(id TEXT PRIMARY KEY CHECK(length(id)=32),period_id TEXT NOT NULL,owner_id TEXT NOT NULL,item_id TEXT NOT NULL,occurred_on TEXT NOT NULL CHECK(substr(occurred_on,1,7)=period_id AND length(occurred_on)=10),note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 150),amount BIGINT NOT NULL CHECK(amount BETWEEN 1 AND 1000000000000),version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,deleted_at BIGINT,FOREIGN KEY(item_id,period_id,owner_id) REFERENCES budget_items(id,period_id,owner_id));
CREATE INDEX expenses_period ON expenses(period_id,owner_id,deleted_at,occurred_on,id);
CREATE INDEX expenses_item ON expenses(item_id);
CREATE TABLE transfers(id TEXT PRIMARY KEY CHECK(length(id)=32),period_id TEXT NOT NULL,from_owner_id TEXT NOT NULL CHECK(from_owner_id IN ('partner-a','partner-b')),to_owner_id TEXT NOT NULL CHECK(to_owner_id IN ('partner-a','partner-b') AND to_owner_id<>from_owner_id),source_item_id TEXT NOT NULL,occurred_on TEXT NOT NULL CHECK(substr(occurred_on,1,7)=period_id AND length(occurred_on)=10),amount BIGINT NOT NULL CHECK(amount BETWEEN 1 AND 1000000000000),version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),created_at BIGINT NOT NULL,deleted_at BIGINT,FOREIGN KEY(source_item_id,period_id,from_owner_id) REFERENCES budget_items(id,period_id,owner_id));
CREATE INDEX transfers_period ON transfers(period_id,from_owner_id,deleted_at);
CREATE INDEX transfers_recipient ON transfers(period_id,to_owner_id,deleted_at);
CREATE INDEX transfers_item ON transfers(source_item_id);
CREATE TABLE attachments(id TEXT PRIMARY KEY CHECK(length(id)=32),expense_id TEXT NOT NULL REFERENCES expenses(id),owner_id TEXT NOT NULL CHECK(owner_id IN ('partner-a','partner-b')),object_key TEXT NOT NULL UNIQUE,content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png')),byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),sha256 TEXT NOT NULL CHECK(length(sha256)=64),width INTEGER CHECK(width BETWEEN 1 AND 10000),height INTEGER CHECK(height BETWEEN 1 AND 10000),status TEXT NOT NULL CHECK(status IN ('pending','ready','deleting','failed')),created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL);
CREATE INDEX attachment_expense ON attachments(expense_id,status);
CREATE INDEX attachment_cleanup ON attachments(status,updated_at);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL CHECK(account_id IN ('partner-a','partner-b')),auth_fingerprint TEXT NOT NULL,created_at BIGINT NOT NULL,expires_at BIGINT NOT NULL);
CREATE INDEX session_expiry ON sessions(expires_at);
CREATE TABLE login_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,window_start BIGINT NOT NULL,blocked_until BIGINT NOT NULL);
-- Every writer takes the same transaction lock before any data statement.
-- The server adapter and maintenance tools enforce this order; guards also lock
-- to cover direct SQL maintenance in READ COMMITTED transactions.
CREATE FUNCTION family_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF TG_TABLE_NAME='budget_items' THEN
  IF TG_OP='INSERT' AND (SELECT count(*) FROM budget_items WHERE period_id=NEW.period_id AND owner_id=NEW.owner_id AND deleted_at IS NULL)>=200 THEN RAISE EXCEPTION 'ITEM_LIMIT'; END IF;
  IF TG_OP='UPDATE' AND NEW.deleted_at IS NOT NULL AND (EXISTS(SELECT 1 FROM expenses WHERE item_id=NEW.id AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM transfers WHERE source_item_id=NEW.id AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'ITEM_REFERENCED'; END IF;
 ELSIF TG_TABLE_NAME='expenses' THEN
  IF NEW.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM budget_items WHERE id=NEW.item_id AND owner_id=NEW.owner_id AND period_id=NEW.period_id AND kind='allocation' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_EXPENSE_ITEM'; END IF;
  IF TG_OP='INSERT' AND (SELECT count(*) FROM expenses WHERE owner_id=NEW.owner_id AND period_id=NEW.period_id AND deleted_at IS NULL)>=1000 THEN RAISE EXCEPTION 'EXPENSE_LIMIT'; END IF;
 ELSIF TG_TABLE_NAME='transfers' THEN
  IF NEW.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM budget_items WHERE id=NEW.source_item_id AND owner_id=NEW.from_owner_id AND period_id=NEW.period_id AND kind='transfer_out' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_TRANSFER_ITEM'; END IF;
  IF TG_OP='INSERT' AND (SELECT count(*) FROM transfers WHERE from_owner_id=NEW.from_owner_id AND period_id=NEW.period_id AND deleted_at IS NULL)>=1000 THEN RAISE EXCEPTION 'TRANSFER_LIMIT'; END IF;
 ELSIF TG_TABLE_NAME='attachments' THEN
  IF NEW.status IN ('pending','ready','failed') AND NOT EXISTS(SELECT 1 FROM expenses WHERE id=NEW.expense_id AND owner_id=NEW.owner_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_ATTACHMENT_OWNER'; END IF;
  IF NEW.status IN ('pending','ready') AND (SELECT count(*) FROM attachments WHERE expense_id=NEW.expense_id AND status IN ('pending','ready') AND id<>NEW.id)>=10 THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER item_guard BEFORE INSERT OR UPDATE ON budget_items FOR EACH ROW EXECUTE FUNCTION family_guard();
CREATE TRIGGER expense_guard BEFORE INSERT OR UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION family_guard();
CREATE TRIGGER transfer_guard BEFORE INSERT OR UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION family_guard();
CREATE TRIGGER attachment_guard BEFORE INSERT OR UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION family_guard();
CREATE FUNCTION family_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='attachments' THEN
  UPDATE periods SET revision=revision+1 WHERE id=(SELECT period_id FROM expenses WHERE id=NEW.expense_id);
 ELSE
  UPDATE periods SET revision=revision+1 WHERE id=NEW.period_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER item_revision AFTER INSERT OR UPDATE ON budget_items FOR EACH ROW EXECUTE FUNCTION family_revision();
CREATE TRIGGER budget_revision AFTER INSERT ON budgets FOR EACH ROW EXECUTE FUNCTION family_revision();
CREATE TRIGGER expense_revision AFTER INSERT OR UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION family_revision();
CREATE TRIGGER transfer_revision AFTER INSERT OR UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION family_revision();
CREATE TRIGGER attachment_revision AFTER INSERT OR UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION family_revision();
