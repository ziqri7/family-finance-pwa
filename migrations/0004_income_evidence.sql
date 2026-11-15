CREATE TABLE income_attachments (
 id text PRIMARY KEY CHECK(length(id)=32),
 income_item_id text NOT NULL REFERENCES budget_items(id),
 owner_id text NOT NULL CHECK(owner_id IN ('partner-a','partner-b')),
 object_key text NOT NULL UNIQUE,
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png')),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
 sha256 text NOT NULL CHECK(length(sha256)=64),
 width integer CHECK(width BETWEEN 1 AND 10000),height integer CHECK(height BETWEEN 1 AND 10000),
 status text NOT NULL CHECK(status IN ('pending','ready','deleting','failed')),
 created_at bigint NOT NULL,updated_at bigint NOT NULL
);
CREATE INDEX income_attachment_parent ON income_attachments(income_item_id,status);
CREATE INDEX income_attachment_cleanup ON income_attachments(status,updated_at);
CREATE FUNCTION guard_evidence_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF (TG_TABLE_NAME='income_attachments' AND EXISTS(SELECT 1 FROM attachments WHERE id=NEW.id)) OR (TG_TABLE_NAME='attachments' AND EXISTS(SELECT 1 FROM income_attachments WHERE id=NEW.id)) THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT_OR_ID_CONFLICT'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_income_evidence_id BEFORE INSERT ON income_attachments FOR EACH ROW EXECUTE FUNCTION guard_evidence_id();
CREATE TRIGGER guard_expense_evidence_id BEFORE INSERT ON attachments FOR EACH ROW EXECUTE FUNCTION guard_evidence_id();
CREATE FUNCTION guard_income_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF NEW.status<>'deleting' AND NOT EXISTS(SELECT 1 FROM budget_items WHERE id=NEW.income_item_id AND owner_id=NEW.owner_id AND kind='income' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_ATTACHMENT_OWNER'; END IF;
 IF NEW.status IN ('pending','ready') AND (SELECT count(*) FROM income_attachments WHERE income_item_id=NEW.income_item_id AND status IN ('pending','ready') AND id<>NEW.id)>=10 THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_income_evidence BEFORE INSERT OR UPDATE ON income_attachments FOR EACH ROW EXECUTE FUNCTION guard_income_evidence();
CREATE FUNCTION revise_income_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE periods SET revision=revision+1 WHERE id=(SELECT period_id FROM budget_items WHERE id=NEW.income_item_id);
 RETURN NEW;
END $$;
CREATE TRIGGER revise_income_evidence AFTER INSERT OR UPDATE ON income_attachments FOR EACH ROW EXECUTE FUNCTION revise_income_evidence();
CREATE FUNCTION retire_income_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
  UPDATE income_attachments SET status='deleting',updated_at=NEW.deleted_at WHERE income_item_id=NEW.id AND status<>'deleting';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retire_income_evidence AFTER UPDATE ON budget_items FOR EACH ROW EXECUTE FUNCTION retire_income_evidence();
