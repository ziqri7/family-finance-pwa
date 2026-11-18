-- Additive transition: old monetary values, receipts, authors and image keys stay intact.
ALTER TABLE budget_items ADD COLUMN tracking_enabled integer NOT NULL DEFAULT 0 CHECK(tracking_enabled IN (0,1));
ALTER TABLE budget_items ADD COLUMN copied_from_item_id text REFERENCES budget_items(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE budget_items ADD COLUMN copied_by text CHECK(copied_by IN ('partner-a','partner-b'));
ALTER TABLE allocation_groups ADD COLUMN purpose text NOT NULL DEFAULT 'legacy' CHECK(purpose IN ('legacy','evidence'));
ALTER TABLE allocation_groups ALTER COLUMN posting_kind DROP NOT NULL;
ALTER TABLE allocation_groups ADD CONSTRAINT bundle_shape CHECK(purpose='legacy' OR (posting_kind IS NULL AND recipient_owner_id IS NULL AND status='posted' AND posting_date IS NULL));
ALTER TABLE allocation_group_items ADD COLUMN linked_version integer;
ALTER TABLE allocation_group_items ADD COLUMN linked_amount bigint;
ALTER TABLE allocation_group_items ADD COLUMN linked_label text;
DROP INDEX active_group_item;
CREATE INDEX active_group_item ON allocation_group_items(item_id) WHERE retired_at IS NULL;
DROP TRIGGER grouped_item_write ON budget_items;
ALTER TABLE expenses ADD COLUMN converted_to text CHECK(converted_to IN ('allocation','usage'));
ALTER TABLE expenses ADD COLUMN converted_id text;
ALTER TABLE expenses ADD COLUMN converted_payload text;
ALTER TABLE expenses ADD CONSTRAINT expense_conversion_pair CHECK((converted_to IS NULL)=(converted_id IS NULL));
ALTER TABLE transfers ADD COLUMN converted_to text CHECK(converted_to IN ('allocation','usage'));
ALTER TABLE transfers ADD COLUMN converted_id text;
ALTER TABLE transfers ADD COLUMN converted_payload text;
ALTER TABLE transfers ADD CONSTRAINT transfer_conversion_pair CHECK((converted_to IS NULL)=(converted_id IS NULL));

CREATE TABLE usage_entries (
 id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{32}$'), period_id text NOT NULL REFERENCES periods(id),
 item_id text NOT NULL REFERENCES budget_items(id),
 owner_id text NOT NULL CHECK(owner_id IN ('partner-a','partner-b')),
 occurred_on text NOT NULL CHECK(occurred_on ~ '^\d{4}-\d{2}-\d{2}$' AND left(occurred_on,7)=period_id AND to_char(occurred_on::date,'YYYY-MM-DD')=occurred_on),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 150),
 amount bigint NOT NULL CHECK(amount BETWEEN 1 AND 1000000000000),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at bigint NOT NULL, updated_at bigint NOT NULL, deleted_at bigint
);
CREATE INDEX usage_parent ON usage_entries(item_id,deleted_at);
CREATE TABLE usage_attachments (
 id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{32}$'), usage_entry_id text NOT NULL REFERENCES usage_entries(id),
 owner_id text NOT NULL CHECK(owner_id IN ('partner-a','partner-b')), object_key text NOT NULL UNIQUE,
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png')), byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), width integer CHECK(width BETWEEN 1 AND 10000), height integer CHECK(height BETWEEN 1 AND 10000),
 status text NOT NULL CHECK(status IN ('pending','ready','failed','deleting')), created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE INDEX usage_attachment_parent ON usage_attachments(usage_entry_id,status);
CREATE INDEX usage_attachment_cleanup ON usage_attachments(status,updated_at);

CREATE OR REPLACE FUNCTION group_relations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g allocation_groups; i budget_items;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF TG_TABLE_NAME='allocation_group_items' THEN
  SELECT * INTO g FROM allocation_groups WHERE id=NEW.group_id;
  SELECT * INTO i FROM budget_items WHERE id=NEW.item_id;
  IF i.id IS NULL OR i.kind='income' OR i.period_id<>g.period_id OR (g.purpose='legacy' AND i.owner_id<>g.owner_id) THEN RAISE EXCEPTION 'INVALID_GROUP_MEMBER';END IF;
 ELSIF TG_TABLE_NAME='allocation_groups' THEN
  IF TG_OP='INSERT' AND (SELECT count(*) FROM allocation_groups WHERE period_id=NEW.period_id AND deleted_at IS NULL)>=400 THEN RAISE EXCEPTION 'GROUP_LIMIT';END IF;
  IF TG_OP='UPDATE' AND (NEW.period_id<>OLD.period_id OR NEW.owner_id<>OLD.owner_id OR NEW.purpose<>OLD.purpose OR NEW.posting_kind IS DISTINCT FROM OLD.posting_kind OR NEW.recipient_owner_id IS DISTINCT FROM OLD.recipient_owner_id) THEN RAISE EXCEPTION 'GROUP_LOCKED';END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION family_item_write(actor text,target text,payload jsonb,moment bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE i budget_items; f text:=payload->>'field'; proposed bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 SELECT * INTO i FROM budget_items WHERE id=target AND owner_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'FAMILY_NOT_FOUND';END IF;
 IF i.deleted_at IS NOT NULL THEN
  IF payload->>'action'='delete' THEN RETURN to_jsonb(i);END IF;
  RAISE EXCEPTION 'FAMILY_CHANGED';
 END IF;
 IF payload->>'action'='delete' THEN
  IF i.row_version<>(payload->>'expectedVersion')::integer THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  UPDATE budget_items SET deleted_at=moment,updated_at=moment,row_version=row_version+1 WHERE id=target RETURNING * INTO i;
 ELSIF f='tracking' THEN
  IF i.kind='income' THEN RAISE EXCEPTION 'INVALID_USAGE_ITEM';END IF;
  IF i.tracking_enabled=(payload->>'value')::integer THEN RETURN to_jsonb(i);END IF;
  IF i.row_version<>(payload->>'expectedVersion')::integer THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  UPDATE budget_items SET tracking_enabled=(payload->>'value')::integer,updated_at=moment,row_version=row_version+1 WHERE id=target RETURNING * INTO i;
 ELSIF f='label' THEN
  IF i.label=payload->>'value' THEN RETURN to_jsonb(i);END IF;
  IF i.label_version<>(payload->>'expectedVersion')::integer THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  UPDATE budget_items SET label=payload->>'value',updated_at=moment,label_version=label_version+1,row_version=row_version+1 WHERE id=target RETURNING * INTO i;
 ELSIF f='date' THEN
  IF i.kind='income' OR i.recording_mode<>'actual' THEN RAISE EXCEPTION 'INVALID_USAGE_ITEM';END IF;
  IF i.posting_date IS NOT DISTINCT FROM (payload->>'value') THEN RETURN to_jsonb(i);END IF;
  IF i.row_version<>(payload->>'expectedVersion')::integer THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  UPDATE budget_items SET posting_date=payload->>'value',updated_at=moment,row_version=row_version+1,posting_version=posting_version+1 WHERE id=target RETURNING * INTO i;
 ELSIF f='amount' THEN
  proposed:=(payload->>'value')::bigint;
  IF i.amount IS NOT DISTINCT FROM proposed THEN RETURN to_jsonb(i);END IF;
  IF i.amount_version<>(payload->>'expectedVersion')::integer THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  IF i.kind<>'income' AND i.recording_mode='legacy' AND i.amount IS NOT NULL THEN RAISE EXCEPTION 'LEGACY_REVIEW_REQUIRED';END IF;
  IF i.kind<>'income' AND proposed IS NULL AND EXISTS(SELECT 1 FROM allocation_attachments WHERE allocation_item_id=target AND status IN ('pending','ready')) AND coalesce((payload->>'confirmCancel')::boolean,false)=false THEN RAISE EXCEPTION 'EVIDENCE_CONFIRM_REQUIRED';END IF;
  UPDATE budget_items SET amount=proposed,recording_mode=CASE WHEN kind='income' THEN 'legacy' ELSE 'actual' END,posting_kind=CASE WHEN kind='income' THEN NULL ELSE coalesce(posting_kind,'external') END,updated_at=moment,amount_version=amount_version+1,row_version=row_version+1 WHERE id=target RETURNING * INTO i;
 ELSE RAISE EXCEPTION 'INVALID_FAMILY_ACTION';
 END IF;
 IF f='amount' OR payload->>'action'='delete' THEN PERFORM assert_family_funds(i.period_id);END IF;
 RETURN to_jsonb(i);
END $$;

CREATE FUNCTION family_usage_write(actor text,target text,payload jsonb,moment bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE u usage_entries; i budget_items;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 SELECT * INTO u FROM usage_entries WHERE id=target;
 IF FOUND THEN
  IF u.owner_id<>actor THEN RAISE EXCEPTION 'FAMILY_NOT_FOUND';END IF;
  IF payload->>'action'='delete' THEN
   IF u.deleted_at IS NOT NULL THEN RETURN to_jsonb(u);END IF;
  ELSIF u.deleted_at IS NULL AND u.item_id=payload->>'itemId' AND u.note=payload->>'note' AND u.occurred_on=payload->>'date' AND u.amount=(payload->>'amount')::bigint THEN RETURN to_jsonb(u);
  END IF;
  IF u.deleted_at IS NOT NULL OR u.version<>coalesce((payload->>'expectedVersion')::integer,0) THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  IF payload->>'action'='delete' THEN
   UPDATE usage_entries SET deleted_at=moment,updated_at=moment,version=version+1 WHERE id=target RETURNING * INTO u;
   UPDATE usage_attachments SET status='deleting',updated_at=moment WHERE usage_entry_id=target;
   RETURN to_jsonb(u);
  END IF;
  IF u.item_id<>payload->>'itemId' THEN RAISE EXCEPTION 'INVALID_USAGE_ITEM';END IF;
  IF NOT EXISTS(SELECT 1 FROM budget_items WHERE id=u.item_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  UPDATE usage_entries SET occurred_on=payload->>'date',note=payload->>'note',amount=(payload->>'amount')::bigint,version=version+1,updated_at=moment WHERE id=target RETURNING * INTO u;
 ELSE
  IF payload->>'action'='delete' OR payload->>'expectedVersion' IS NOT NULL THEN RAISE EXCEPTION 'FAMILY_NOT_FOUND';END IF;
  SELECT * INTO i FROM budget_items WHERE id=payload->>'itemId' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAMILY_NOT_FOUND';END IF;
  INSERT INTO usage_entries(id,period_id,item_id,owner_id,occurred_on,note,amount,created_at,updated_at) VALUES(target,i.period_id,i.id,actor,payload->>'date',payload->>'note',(payload->>'amount')::bigint,moment,moment) RETURNING * INTO u;
 END IF;
 RETURN to_jsonb(u);
END $$;

CREATE FUNCTION family_create_period(actor text,payload jsonb,moment bigint) RETURNS text LANGUAGE plpgsql AS $$
DECLARE period text:=payload->>'id'; source text:=payload->>'sourcePeriodId';
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF EXISTS(SELECT 1 FROM periods WHERE id=period) THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
 IF payload->>'mode'='copy' AND NOT EXISTS(SELECT 1 FROM periods WHERE id=source) THEN RAISE EXCEPTION 'FAMILY_NOT_FOUND';END IF;
 INSERT INTO periods(id,created_at) VALUES(period,moment);
 IF payload->>'mode'='copy' THEN
  INSERT INTO budgets(period_id,owner_id,created_at) SELECT period,owner_id,moment FROM budgets WHERE period_id=source;
  INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at,recording_mode,posting_kind,tracking_enabled,copied_from_item_id,copied_by)
   SELECT md5(period||':'||owner_id||':'||id),period,owner_id,label,kind,NULL,position,moment,moment,CASE WHEN kind='income' THEN 'legacy' ELSE 'actual' END,CASE WHEN kind='income' THEN NULL ELSE 'external' END,tracking_enabled,id,actor FROM budget_items WHERE period_id=source AND deleted_at IS NULL;
 ELSE
  INSERT INTO budgets VALUES(period,actor,moment);
  INSERT INTO budget_items(id,period_id,owner_id,label,kind,position,created_at,updated_at,recording_mode,posting_kind)
   SELECT replace(gen_random_uuid()::text,'-',''),period,actor,label,CASE WHEN kind='income' THEN 'income' ELSE 'allocation' END,position,moment,moment,CASE WHEN kind='income' THEN 'legacy' ELSE 'actual' END,CASE WHEN kind='income' THEN NULL ELSE 'external' END FROM default_items WHERE owner_id=actor;
 END IF;
 RETURN period;
END $$;

CREATE FUNCTION family_create_item(actor text,period text,payload jsonb,moment bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE i budget_items;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 SELECT * INTO i FROM budget_items WHERE id=payload->>'id';
 IF FOUND THEN
  IF i.owner_id<>actor THEN RAISE EXCEPTION 'FAMILY_NOT_FOUND';END IF;
  IF i.deleted_at IS NOT NULL OR i.period_id<>period OR i.kind<>payload->>'kind' OR i.label<>payload->>'label' OR i.tracking_enabled<>coalesce((payload->>'trackingEnabled')::integer,0) THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  RETURN to_jsonb(i);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM periods WHERE id=period) THEN RAISE EXCEPTION 'FAMILY_NOT_FOUND';END IF;
 INSERT INTO budgets VALUES(period,actor,moment) ON CONFLICT DO NOTHING;
 INSERT INTO budget_items(id,period_id,owner_id,label,kind,position,created_at,updated_at,recording_mode,posting_kind,tracking_enabled)
 VALUES(payload->>'id',period,actor,payload->>'label',payload->>'kind',(SELECT coalesce(max(position),-1)+1 FROM budget_items WHERE period_id=period),moment,moment,CASE WHEN payload->>'kind'='income' THEN 'legacy' ELSE 'actual' END,CASE WHEN payload->>'kind'='income' THEN NULL ELSE 'external' END,coalesce((payload->>'trackingEnabled')::integer,0)) RETURNING * INTO i;
 RETURN to_jsonb(i);
END $$;

CREATE FUNCTION family_evidence_write(actor text,period text,payload jsonb,moment bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE g allocation_groups; line jsonb; i budget_items; ordinal integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 SELECT * INTO g FROM allocation_groups WHERE id=payload->>'id';
 IF FOUND THEN
  IF g.owner_id<>actor OR g.period_id<>period THEN RAISE EXCEPTION 'FAMILY_NOT_FOUND';END IF;
  IF payload->>'action'='delete' AND g.deleted_at IS NOT NULL THEN RETURN to_jsonb(g);END IF;
  IF g.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  IF payload->>'expectedVersion' IS NULL THEN
   IF g.purpose='evidence' AND g.label=payload->>'label' AND (SELECT array_agg(item_id||':'||linked_version ORDER BY item_id) FROM allocation_group_items WHERE group_id=g.id AND retired_at IS NULL)=(SELECT array_agg((e->>'id')||':'||(e->>'expectedVersion') ORDER BY e->>'id') FROM jsonb_array_elements(payload->'items') e) THEN RETURN to_jsonb(g);END IF;
   RAISE EXCEPTION 'FAMILY_CHANGED';
  END IF;
  IF g.version<>(payload->>'expectedVersion')::integer THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  IF payload->>'action'='delete' THEN
   UPDATE allocation_groups SET deleted_at=moment,version=version+1,updated_at=moment WHERE id=g.id RETURNING * INTO g;
   UPDATE group_attachments SET status='deleting',updated_at=moment WHERE group_id=g.id;
   RETURN to_jsonb(g);
  END IF;
  IF g.purpose<>'evidence' THEN RAISE EXCEPTION 'HISTORY_LOCKED';END IF;
 ELSE
  IF payload->>'expectedVersion' IS NOT NULL THEN RAISE EXCEPTION 'FAMILY_NOT_FOUND';END IF;
  INSERT INTO budgets VALUES(period,actor,moment) ON CONFLICT DO NOTHING;
  INSERT INTO allocation_groups(id,period_id,owner_id,label,posting_kind,recipient_owner_id,status,purpose,created_at,updated_at) VALUES(payload->>'id',period,actor,payload->>'label',NULL,NULL,'posted','evidence',moment,moment) RETURNING * INTO g;
 END IF;
 UPDATE allocation_group_items SET retired_at=moment WHERE group_id=g.id AND retired_at IS NULL;
 FOR line IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
  SELECT * INTO i FROM budget_items WHERE id=line->>'id' AND period_id=period AND kind<>'income' AND deleted_at IS NULL AND row_version=(line->>'expectedVersion')::integer;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  INSERT INTO allocation_group_items(group_id,item_id,position,posted,linked_version,linked_amount,linked_label) VALUES(g.id,i.id,ordinal,0,i.row_version,i.amount,i.label)
   ON CONFLICT(group_id,item_id) DO UPDATE SET retired_at=NULL,position=excluded.position;
  ordinal:=ordinal+1;
 END LOOP;
 IF payload->>'expectedVersion' IS NOT NULL THEN
  UPDATE allocation_groups SET label=payload->>'label',version=version+1,updated_at=moment WHERE id=g.id RETURNING * INTO g;
  UPDATE group_attachments SET confirmed_group_version=g.version,updated_at=moment WHERE group_id=g.id AND status='ready';
 END IF;
 RETURN to_jsonb(g);
END $$;

CREATE FUNCTION usage_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i budget_items;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 SELECT * INTO i FROM budget_items WHERE id=NEW.item_id;
 IF i.id IS NULL OR i.kind='income' OR i.period_id<>NEW.period_id THEN RAISE EXCEPTION 'INVALID_USAGE_ITEM';END IF;
 IF TG_OP='UPDATE' AND (NEW.owner_id<>OLD.owner_id OR NEW.item_id<>OLD.item_id OR NEW.period_id<>OLD.period_id) THEN RAISE EXCEPTION 'HISTORY_LOCKED';END IF;
 IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND current_setting('financee.restore',true) IS DISTINCT FROM '1' AND (i.deleted_at IS NOT NULL OR i.tracking_enabled<>1 OR i.recording_mode<>'actual' OR i.amount IS NULL) THEN RAISE EXCEPTION 'TRACKING_DISABLED';END IF;
 IF NEW.deleted_at IS NULL AND coalesce((SELECT sum(amount) FROM usage_entries WHERE item_id=NEW.item_id AND id<>NEW.id AND deleted_at IS NULL),0)+NEW.amount>coalesce(i.amount,0) THEN RAISE EXCEPTION 'ALLOWANCE_EXCEEDED';END IF;
 IF TG_OP='INSERT' AND (SELECT count(*) FROM usage_entries WHERE period_id=NEW.period_id AND deleted_at IS NULL)>=2000 THEN RAISE EXCEPTION 'USAGE_LIMIT';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER usage_guard BEFORE INSERT OR UPDATE ON usage_entries FOR EACH ROW EXECUTE FUNCTION usage_guard();
CREATE TRIGGER usage_revision AFTER INSERT OR UPDATE ON usage_entries FOR EACH ROW EXECUTE FUNCTION revise_group();
CREATE FUNCTION usage_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF EXISTS(SELECT 1 FROM attachments WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM income_attachments WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM allocation_attachments WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM group_attachments WHERE id=NEW.id) THEN RAISE EXCEPTION 'ATTACHMENT_ID_CONFLICT';END IF;
 IF NEW.status<>'deleting' AND NOT EXISTS(SELECT 1 FROM usage_entries WHERE id=NEW.usage_entry_id AND owner_id=NEW.owner_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_ATTACHMENT_OWNER';END IF;
 IF NEW.status IN ('pending','ready') AND (SELECT count(*) FROM usage_attachments WHERE usage_entry_id=NEW.usage_entry_id AND status IN ('pending','ready') AND id<>NEW.id)>=10 THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER usage_evidence BEFORE INSERT OR UPDATE ON usage_attachments FOR EACH ROW EXECUTE FUNCTION usage_evidence_guard();
CREATE FUNCTION revise_usage_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE periods SET revision=revision+1 WHERE id=(SELECT period_id FROM usage_entries WHERE id=NEW.usage_entry_id);RETURN NEW;END $$;
CREATE TRIGGER usage_evidence_revision AFTER INSERT OR UPDATE ON usage_attachments FOR EACH ROW EXECUTE FUNCTION revise_usage_evidence();
CREATE FUNCTION guard_usage_file_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_advisory_xact_lock(61324017);IF EXISTS(SELECT 1 FROM usage_attachments WHERE id=NEW.id) THEN RAISE EXCEPTION 'ATTACHMENT_ID_CONFLICT';END IF;RETURN NEW;END $$;
CREATE TRIGGER usage_file_identity BEFORE INSERT OR UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION guard_usage_file_identity();
CREATE TRIGGER usage_file_identity BEFORE INSERT OR UPDATE ON income_attachments FOR EACH ROW EXECUTE FUNCTION guard_usage_file_identity();
CREATE TRIGGER usage_file_identity BEFORE INSERT OR UPDATE ON allocation_attachments FOR EACH ROW EXECUTE FUNCTION guard_usage_file_identity();
CREATE TRIGGER usage_file_identity BEFORE INSERT OR UPDATE ON group_attachments FOR EACH ROW EXECUTE FUNCTION guard_usage_file_identity();

CREATE VIEW family_book_totals AS
 SELECT p.id AS period_id,
 coalesce((SELECT sum(amount) FROM budget_items WHERE period_id=p.id AND kind='income' AND deleted_at IS NULL),0)::bigint AS income,
 (coalesce((SELECT sum(amount) FROM budget_items WHERE period_id=p.id AND kind<>'income' AND recording_mode='actual' AND deleted_at IS NULL),0)
 +coalesce((SELECT sum(amount) FROM expenses WHERE period_id=p.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL AND converted_to IS NULL),0)
 +coalesce((SELECT sum(amount) FROM transfers WHERE period_id=p.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL AND converted_to IS NULL),0))::bigint AS distributed
 FROM periods p;
CREATE FUNCTION assert_family_funds(period text) RETURNS integer LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM family_book_totals WHERE period_id=period AND distributed>income) THEN RAISE EXCEPTION 'FUNDS_EXCEEDED';END IF;
 IF EXISTS(SELECT 1 FROM budget_items i WHERE period_id=period AND deleted_at IS NULL AND coalesce(amount,0)<(SELECT coalesce(sum(amount),0) FROM usage_entries WHERE item_id=i.id AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'ALLOWANCE_EXCEEDED';END IF;
 RETURN 1;
END $$;

CREATE FUNCTION convert_family_extra(actor text,source_id text,payload jsonb,moment bigint) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r record; target_id text:=md5((payload->>'source')||':'||source_id); target budget_items;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF payload->>'source'='expense' THEN
  SELECT id,period_id,owner_id,amount,note,occurred_on,version,deleted_at,superseded_by_item_id,converted_to,converted_id,converted_payload INTO r FROM expenses WHERE id=source_id AND owner_id=actor;
 ELSE
  SELECT id,period_id,from_owner_id AS owner_id,amount,'Catatan lama'::text AS note,occurred_on,version,deleted_at,superseded_by_item_id,converted_to,converted_id,converted_payload INTO r FROM transfers WHERE id=source_id AND from_owner_id=actor;
 END IF;
 IF r.id IS NULL THEN RAISE EXCEPTION 'FAMILY_NOT_FOUND';END IF;
 IF r.converted_to=payload->>'mode' AND r.converted_id=target_id AND r.converted_payload=payload::text THEN RETURN target_id;END IF;
 IF r.deleted_at IS NOT NULL OR r.superseded_by_item_id IS NOT NULL OR r.converted_to IS NOT NULL OR r.version<>(payload->>'expectedVersion')::integer THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
 IF payload->>'mode'='usage' THEN
  SELECT * INTO target FROM budget_items WHERE id=payload->>'itemId' AND period_id=r.period_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_USAGE_ITEM';END IF;
  INSERT INTO usage_entries(id,period_id,item_id,owner_id,occurred_on,note,amount,created_at,updated_at) VALUES(target_id,r.period_id,target.id,actor,r.occurred_on,payload->>'label',r.amount,moment,moment);
 ELSE
  INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,recording_mode,posting_kind,created_at,updated_at) VALUES(target_id,r.period_id,actor,payload->>'label','allocation',r.amount,0,'actual','external',moment,moment);
 END IF;
 IF payload->>'source'='expense' THEN
  UPDATE expenses SET converted_to=payload->>'mode',converted_id=target_id,converted_payload=payload::text,version=version+1,updated_at=moment WHERE id=source_id;
 ELSE
  UPDATE transfers SET converted_to=payload->>'mode',converted_id=target_id,converted_payload=payload::text,version=version+1 WHERE id=source_id;
 END IF;
 PERFORM assert_family_funds(r.period_id);RETURN target_id;
END $$;
CREATE FUNCTION protect_family_conversion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.converted_to IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'HISTORY_LOCKED';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER expense_conversion_history BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION protect_family_conversion();
CREATE TRIGGER transfer_conversion_history BEFORE UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION protect_family_conversion();
CREATE FUNCTION validate_family_conversion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text;
BEGIN
 IF NEW.converted_to IS NULL THEN RETURN NEW;END IF;
 actor:=CASE WHEN TG_TABLE_NAME='expenses' THEN to_jsonb(NEW)->>'owner_id' ELSE to_jsonb(NEW)->>'from_owner_id' END;
 IF NEW.converted_payload IS NULL OR (NEW.converted_to='allocation' AND NOT EXISTS(SELECT 1 FROM budget_items WHERE id=NEW.converted_id AND period_id=NEW.period_id AND owner_id=actor AND kind<>'income')) OR (NEW.converted_to='usage' AND NOT EXISTS(SELECT 1 FROM usage_entries WHERE id=NEW.converted_id AND period_id=NEW.period_id AND owner_id=actor)) THEN RAISE EXCEPTION 'INVALID_CONVERSION_TARGET';END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER expense_conversion_target AFTER INSERT OR UPDATE ON expenses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_family_conversion();
CREATE CONSTRAINT TRIGGER transfer_conversion_target AFTER INSERT OR UPDATE ON transfers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_family_conversion();

-- This function is the only current client path for reviewing old planned values.
-- Existing extras must be explicitly mapped first; never silently supersede them.
CREATE FUNCTION review_family_items(period text,actor text,payload jsonb,moment bigint) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE line jsonb; i budget_items;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF NOT EXISTS(SELECT 1 FROM periods WHERE id=period AND revision=(payload->>'expectedRevision')::integer) THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
  SELECT * INTO i FROM budget_items WHERE id=line->>'id' AND period_id=period AND owner_id=actor AND deleted_at IS NULL AND kind<>'income' AND row_version=(line->>'expectedVersion')::integer;
  IF NOT FOUND OR i.amount IS NULL THEN RAISE EXCEPTION 'FAMILY_CHANGED';END IF;
  IF EXISTS(SELECT 1 FROM expenses WHERE item_id=i.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL AND converted_to IS NULL) OR EXISTS(SELECT 1 FROM transfers WHERE source_item_id=i.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL AND converted_to IS NULL) THEN RAISE EXCEPTION 'LEGACY_REVIEW_REQUIRED';END IF;
  UPDATE budget_items SET recording_mode='actual',posting_kind=coalesce(posting_kind,'external'),row_version=row_version+1,posting_version=posting_version+1,updated_at=moment WHERE id=i.id;
 END LOOP;
 PERFORM assert_family_funds(period);RETURN 1;
END $$;
CREATE OR REPLACE FUNCTION family_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF TG_TABLE_NAME='budget_items' THEN
  IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND (SELECT count(*) FROM budget_items WHERE period_id=NEW.period_id AND owner_id=NEW.owner_id AND deleted_at IS NULL)>=200 THEN RAISE EXCEPTION 'ITEM_LIMIT'; END IF;
  IF TG_OP='UPDATE' AND NEW.deleted_at IS NOT NULL AND (EXISTS(SELECT 1 FROM expenses WHERE item_id=NEW.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL AND converted_to IS NULL) OR EXISTS(SELECT 1 FROM transfers WHERE source_item_id=NEW.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL AND converted_to IS NULL)) THEN RAISE EXCEPTION 'ITEM_REFERENCED'; END IF;
 ELSIF TG_TABLE_NAME='expenses' THEN
  IF NEW.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM budget_items WHERE id=NEW.item_id AND owner_id=NEW.owner_id AND period_id=NEW.period_id AND (CASE WHEN NEW.superseded_by_item_id IS NOT NULL OR NEW.converted_to IS NOT NULL THEN kind<>'income' WHEN recording_mode='actual' THEN posting_kind='external' OR (posting_kind IS NULL AND kind='allocation') ELSE kind='allocation' END) AND (deleted_at IS NULL OR NEW.superseded_by_item_id IS NOT NULL OR NEW.converted_to IS NOT NULL)) THEN RAISE EXCEPTION 'INVALID_EXPENSE_ITEM'; END IF;
  IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND (SELECT count(*) FROM expenses WHERE owner_id=NEW.owner_id AND period_id=NEW.period_id AND deleted_at IS NULL)>=1000 THEN RAISE EXCEPTION 'EXPENSE_LIMIT'; END IF;
 ELSIF TG_TABLE_NAME='transfers' THEN
  IF NEW.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM budget_items WHERE id=NEW.source_item_id AND owner_id=NEW.from_owner_id AND period_id=NEW.period_id AND (CASE WHEN NEW.superseded_by_item_id IS NOT NULL OR NEW.converted_to IS NOT NULL THEN kind<>'income' WHEN recording_mode='actual' THEN posting_kind='internal' ELSE kind='transfer_out' END) AND (deleted_at IS NULL OR NEW.superseded_by_item_id IS NOT NULL OR NEW.converted_to IS NOT NULL)) THEN RAISE EXCEPTION 'INVALID_TRANSFER_ITEM'; END IF;
  IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND (SELECT count(*) FROM transfers WHERE from_owner_id=NEW.from_owner_id AND period_id=NEW.period_id AND deleted_at IS NULL)>=1000 THEN RAISE EXCEPTION 'TRANSFER_LIMIT'; END IF;
 ELSIF TG_TABLE_NAME='attachments' THEN
  IF NEW.status IN ('pending','ready','failed') AND NOT EXISTS(SELECT 1 FROM expenses WHERE id=NEW.expense_id AND owner_id=NEW.owner_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_ATTACHMENT_OWNER'; END IF;
  IF NEW.status IN ('pending','ready') AND (SELECT count(*) FROM attachments WHERE expense_id=NEW.expense_id AND status IN ('pending','ready') AND id<>NEW.id)>=10 THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT'; END IF;
 END IF;
 RETURN NEW;
END $$;
