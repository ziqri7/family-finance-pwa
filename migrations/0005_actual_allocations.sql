ALTER TABLE default_items ADD COLUMN posting_kind text CHECK(posting_kind IN ('external','internal','reserve'));
ALTER TABLE budget_items ADD COLUMN recording_mode text NOT NULL DEFAULT 'legacy' CHECK(recording_mode IN ('legacy','actual'));
ALTER TABLE budget_items ADD COLUMN posting_kind text CHECK(posting_kind IN ('external','internal','reserve'));
ALTER TABLE budget_items ADD COLUMN posting_date text;
ALTER TABLE budget_items ADD COLUMN posting_version integer NOT NULL DEFAULT 1 CHECK(posting_version>0);
ALTER TABLE budget_items ADD CONSTRAINT posting_shape CHECK(
 (recording_mode='legacy' AND posting_kind IS NULL AND posting_date IS NULL) OR
 (recording_mode='actual' AND kind<>'income' AND (amount IS NULL OR posting_kind IS NOT NULL) AND
  (posting_date IS NULL OR (posting_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND substr(posting_date,1,7)=period_id AND to_char(to_date(posting_date,'YYYY-MM-DD'),'YYYY-MM-DD')=posting_date))));
ALTER TABLE expenses ADD COLUMN superseded_by_item_id text REFERENCES budget_items(id);
ALTER TABLE expenses ADD COLUMN superseded_at bigint;
ALTER TABLE expenses ADD CONSTRAINT expense_superseded_pair CHECK((superseded_by_item_id IS NULL)=(superseded_at IS NULL));
ALTER TABLE transfers ADD COLUMN superseded_by_item_id text REFERENCES budget_items(id);
ALTER TABLE transfers ADD COLUMN superseded_at bigint;
ALTER TABLE transfers ADD CONSTRAINT transfer_superseded_pair CHECK((superseded_by_item_id IS NULL)=(superseded_at IS NULL));
CREATE TABLE allocation_attachments (
 id text PRIMARY KEY CHECK(length(id)=32), allocation_item_id text NOT NULL REFERENCES budget_items(id),
 owner_id text NOT NULL CHECK(owner_id IN ('partner-a','partner-b')), object_key text NOT NULL UNIQUE,
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png')), byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
 sha256 text NOT NULL CHECK(length(sha256)=64),width integer CHECK(width BETWEEN 1 AND 10000),height integer CHECK(height BETWEEN 1 AND 10000),
 status text NOT NULL CHECK(status IN ('pending','ready','deleting','failed')),created_at bigint NOT NULL,updated_at bigint NOT NULL
);
CREATE INDEX allocation_attachment_parent ON allocation_attachments(allocation_item_id,status);
CREATE INDEX allocation_attachment_cleanup ON allocation_attachments(status,updated_at);
CREATE OR REPLACE FUNCTION guard_evidence_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF (TG_TABLE_NAME<>'attachments' AND EXISTS(SELECT 1 FROM attachments WHERE id=NEW.id)) OR
 (TG_TABLE_NAME<>'income_attachments' AND EXISTS(SELECT 1 FROM income_attachments WHERE id=NEW.id)) OR
 (TG_TABLE_NAME<>'allocation_attachments' AND EXISTS(SELECT 1 FROM allocation_attachments WHERE id=NEW.id)) THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT_OR_ID_CONFLICT'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_allocation_evidence_id BEFORE INSERT ON allocation_attachments FOR EACH ROW EXECUTE FUNCTION guard_evidence_id();
CREATE FUNCTION guard_allocation_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF NEW.status<>'deleting' AND NOT EXISTS(SELECT 1 FROM budget_items WHERE id=NEW.allocation_item_id AND owner_id=NEW.owner_id AND recording_mode='actual' AND amount IS NOT NULL AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_ATTACHMENT_OWNER'; END IF;
 IF NEW.status IN ('pending','ready') AND (SELECT count(*) FROM allocation_attachments WHERE allocation_item_id=NEW.allocation_item_id AND status IN ('pending','ready') AND id<>NEW.id)>=10 THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_allocation_evidence BEFORE INSERT OR UPDATE ON allocation_attachments FOR EACH ROW EXECUTE FUNCTION guard_allocation_evidence();
CREATE FUNCTION revise_allocation_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE periods SET revision=revision+1 WHERE id=(SELECT period_id FROM budget_items WHERE id=NEW.allocation_item_id);RETURN NEW;
END $$;
CREATE TRIGGER revise_allocation_evidence AFTER INSERT OR UPDATE ON allocation_attachments FOR EACH ROW EXECUTE FUNCTION revise_allocation_evidence();
CREATE FUNCTION retire_allocation_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) OR (NEW.amount IS NULL AND OLD.amount IS NOT NULL) THEN
 UPDATE allocation_attachments SET status='deleting',updated_at=NEW.updated_at WHERE allocation_item_id=NEW.id AND status<>'deleting';END IF;RETURN NEW;
END $$;
CREATE TRIGGER retire_allocation_evidence AFTER UPDATE ON budget_items FOR EACH ROW EXECUTE FUNCTION retire_allocation_evidence();
CREATE FUNCTION guard_superseded_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id text; parent_owner text;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF TG_OP='UPDATE' AND OLD.superseded_by_item_id IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'HISTORY_LOCKED';END IF;
 IF TG_TABLE_NAME='expenses' THEN parent_id=NEW.item_id;parent_owner=NEW.owner_id;ELSE parent_id=NEW.source_item_id;parent_owner=NEW.from_owner_id;END IF;
 IF NEW.superseded_by_item_id IS NOT NULL AND (NEW.superseded_by_item_id<>parent_id OR NOT EXISTS(SELECT 1 FROM budget_items WHERE id=parent_id AND owner_id=parent_owner AND period_id=NEW.period_id AND recording_mode='actual')) THEN RAISE EXCEPTION 'INVALID_SUPERSEDED_SOURCE';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER expense_history_guard BEFORE INSERT OR UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION guard_superseded_history();
CREATE TRIGGER transfer_history_guard BEFORE INSERT OR UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION guard_superseded_history();
CREATE VIEW effective_postings AS
 SELECT 'allocation:'||id AS id,'allocation'::text AS source,id AS source_id,period_id,owner_id,id AS item_id,label,amount,posting_kind,posting_date AS occurred_on FROM budget_items WHERE recording_mode='actual' AND amount IS NOT NULL AND posting_kind IS NOT NULL AND deleted_at IS NULL
 UNION ALL SELECT 'expense:'||id,'expense',id,period_id,owner_id,item_id,note,amount,'external',occurred_on FROM expenses WHERE deleted_at IS NULL AND superseded_by_item_id IS NULL
 UNION ALL SELECT 'transfer:'||id,'transfer',id,period_id,from_owner_id,source_item_id,'Kiriman pasangan',amount,'internal',occurred_on FROM transfers WHERE deleted_at IS NULL AND superseded_by_item_id IS NULL;

CREATE OR REPLACE FUNCTION family_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF TG_TABLE_NAME='budget_items' THEN
  IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND (SELECT count(*) FROM budget_items WHERE period_id=NEW.period_id AND owner_id=NEW.owner_id AND deleted_at IS NULL)>=200 THEN RAISE EXCEPTION 'ITEM_LIMIT'; END IF;
  IF TG_OP='UPDATE' AND NEW.deleted_at IS NOT NULL AND (EXISTS(SELECT 1 FROM expenses WHERE item_id=NEW.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL) OR EXISTS(SELECT 1 FROM transfers WHERE source_item_id=NEW.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL)) THEN RAISE EXCEPTION 'ITEM_REFERENCED'; END IF;
 ELSIF TG_TABLE_NAME='expenses' THEN
  IF NEW.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM budget_items WHERE id=NEW.item_id AND owner_id=NEW.owner_id AND period_id=NEW.period_id AND kind='allocation' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_EXPENSE_ITEM'; END IF;
  IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND (SELECT count(*) FROM expenses WHERE owner_id=NEW.owner_id AND period_id=NEW.period_id AND deleted_at IS NULL)>=1000 THEN RAISE EXCEPTION 'EXPENSE_LIMIT'; END IF;
 ELSIF TG_TABLE_NAME='transfers' THEN
  IF NEW.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM budget_items WHERE id=NEW.source_item_id AND owner_id=NEW.from_owner_id AND period_id=NEW.period_id AND kind='transfer_out' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_TRANSFER_ITEM'; END IF;
  IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND (SELECT count(*) FROM transfers WHERE from_owner_id=NEW.from_owner_id AND period_id=NEW.period_id AND deleted_at IS NULL)>=1000 THEN RAISE EXCEPTION 'TRANSFER_LIMIT'; END IF;
 ELSIF TG_TABLE_NAME='attachments' THEN
  IF NEW.status IN ('pending','ready','failed') AND NOT EXISTS(SELECT 1 FROM expenses WHERE id=NEW.expense_id AND owner_id=NEW.owner_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_ATTACHMENT_OWNER'; END IF;
  IF NEW.status IN ('pending','ready') AND (SELECT count(*) FROM attachments WHERE expense_id=NEW.expense_id AND status IN ('pending','ready') AND id<>NEW.id)>=10 THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT'; END IF;
 END IF;
 RETURN NEW;
END $$;
