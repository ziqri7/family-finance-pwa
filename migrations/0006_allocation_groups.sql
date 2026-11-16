CREATE TABLE allocation_groups (
 id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{32}$'),
 period_id text NOT NULL, owner_id text NOT NULL,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 100),
 posting_kind text NOT NULL CHECK(posting_kind IN ('external','internal','reserve')),
 recipient_owner_id text,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','cancelled')),
 posting_date text, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 position integer NOT NULL DEFAULT 0,
 created_at bigint NOT NULL, updated_at bigint NOT NULL, deleted_at bigint,
 FOREIGN KEY(period_id,owner_id) REFERENCES budgets(period_id,owner_id),
 CHECK((posting_kind='internal')=(recipient_owner_id IS NOT NULL)),
 CHECK((posting_kind='internal' AND recipient_owner_id IN ('partner-a','partner-b') AND recipient_owner_id<>owner_id) OR (posting_kind<>'internal' AND recipient_owner_id IS NULL)),
 CHECK(posting_date IS NULL OR (posting_date ~ '^\d{4}-\d{2}-\d{2}$' AND left(posting_date,7)=period_id AND to_char(posting_date::date,'YYYY-MM-DD')=posting_date))
);
CREATE TABLE allocation_group_items (
 group_id text NOT NULL REFERENCES allocation_groups(id),
 item_id text NOT NULL REFERENCES budget_items(id),
 position integer NOT NULL, posted integer NOT NULL DEFAULT 0 CHECK(posted IN (0,1)),
 retired_at bigint, PRIMARY KEY(group_id,item_id)
);
CREATE UNIQUE INDEX active_group_item ON allocation_group_items(item_id) WHERE retired_at IS NULL;
CREATE TABLE allocation_group_operations (
 operation_id text PRIMARY KEY CHECK(operation_id ~ '^[a-f0-9]{32}$'),
 owner_id text NOT NULL CHECK(owner_id IN ('partner-a','partner-b')),
 group_id text NOT NULL REFERENCES allocation_groups(id),
 action text NOT NULL CHECK(action IN ('commit','cancel')),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 resulting_version integer NOT NULL, receipt text NOT NULL,
 created_at bigint NOT NULL
);
CREATE TABLE group_attachments (
 id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{32}$'),
 group_id text NOT NULL REFERENCES allocation_groups(id),
 owner_id text NOT NULL CHECK(owner_id IN ('partner-a','partner-b')),
 object_key text NOT NULL UNIQUE,
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png')),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 width integer, height integer,
 status text NOT NULL CHECK(status IN ('pending','ready','failed','deleting')),
 confirmed_group_version integer NOT NULL,
 created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE FUNCTION group_relations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g allocation_groups; i budget_items;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF TG_TABLE_NAME='allocation_group_items' THEN
  SELECT * INTO g FROM allocation_groups WHERE id=NEW.group_id;
  SELECT * INTO i FROM budget_items WHERE id=NEW.item_id;
  IF i.id IS NULL OR i.kind='income' OR i.owner_id<>g.owner_id OR i.period_id<>g.period_id OR (NEW.retired_at IS NULL AND (i.deleted_at IS NOT NULL OR g.deleted_at IS NOT NULL)) THEN RAISE EXCEPTION 'INVALID_GROUP_MEMBER'; END IF;
 ELSIF TG_TABLE_NAME='allocation_groups' THEN
  IF TG_OP='INSERT' AND (SELECT count(*) FROM allocation_groups WHERE owner_id=NEW.owner_id AND period_id=NEW.period_id AND deleted_at IS NULL)>=200 THEN RAISE EXCEPTION 'GROUP_LIMIT';END IF;
  IF TG_OP='UPDATE' AND (NEW.period_id<>OLD.period_id OR NEW.owner_id<>OLD.owner_id OR NEW.posting_kind<>OLD.posting_kind OR NEW.recipient_owner_id IS DISTINCT FROM OLD.recipient_owner_id) THEN RAISE EXCEPTION 'GROUP_LOCKED';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER group_relations BEFORE INSERT OR UPDATE ON allocation_groups FOR EACH ROW EXECUTE FUNCTION group_relations_guard();
CREATE TRIGGER group_member_relations BEFORE INSERT OR UPDATE ON allocation_group_items FOR EACH ROW EXECUTE FUNCTION group_relations_guard();
CREATE FUNCTION group_item_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.posting_kind IS DISTINCT FROM OLD.posting_kind OR NEW.posting_date IS DISTINCT FROM OLD.posting_date OR NEW.recording_mode<>OLD.recording_mode OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
 AND current_setting('financee.group_write',true) IS DISTINCT FROM '1'
 AND EXISTS(SELECT 1 FROM allocation_group_items WHERE item_id=NEW.id AND retired_at IS NULL) THEN RAISE EXCEPTION 'GROUP_LOCKED';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER grouped_item_write BEFORE UPDATE ON budget_items FOR EACH ROW EXECUTE FUNCTION group_item_write_guard();
CREATE FUNCTION revise_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE periods SET revision=revision+1 WHERE id=NEW.period_id;RETURN NEW;
END $$;
CREATE TRIGGER group_revision AFTER INSERT OR UPDATE ON allocation_groups FOR EACH ROW EXECUTE FUNCTION revise_group();

CREATE FUNCTION apply_allocation_group(gid text, actor text, payload jsonb, fingerprint text, moment bigint) RETURNS text LANGUAGE plpgsql AS $$
DECLARE g allocation_groups; previous allocation_group_operations; line jsonb; member record; source budget_items; receipt text; target_amount bigint; is_selected boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 SELECT * INTO g FROM allocation_groups WHERE id=gid AND owner_id=actor AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND';END IF;
 SELECT * INTO previous FROM allocation_group_operations WHERE operation_id=payload->>'operationId';
 IF FOUND THEN
  IF previous.owner_id<>actor OR previous.group_id<>gid OR previous.payload_hash<>fingerprint THEN RAISE EXCEPTION 'GROUP_OPERATION_CONFLICT';END IF;
  RETURN previous.receipt;
 END IF;
 IF g.version<>(payload->>'expectedVersion')::integer OR NOT EXISTS(SELECT 1 FROM periods WHERE id=g.period_id AND revision=(payload->>'expectedRevision')::integer) THEN RAISE EXCEPTION 'GROUP_CHANGED';END IF;
 IF (payload->>'action') NOT IN ('commit','cancel') THEN RAISE EXCEPTION 'INVALID_GROUP_ACTION';END IF;
 IF payload->>'action'='cancel' AND g.status<>'posted' THEN RAISE EXCEPTION 'GROUP_CHANGED';END IF;
 IF jsonb_array_length(payload->'items')<>(SELECT count(*) FROM allocation_group_items WHERE group_id=gid AND retired_at IS NULL)
 OR (SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(payload->'items') e)<>jsonb_array_length(payload->'items') THEN RAISE EXCEPTION 'INVALID_GROUP_MEMBER';END IF;
 IF payload->>'action'='commit' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'items') e WHERE (e->>'selected')::boolean) THEN RAISE EXCEPTION 'INVALID_GROUP_MEMBER';END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
  SELECT i.* INTO source FROM budget_items i JOIN allocation_group_items m ON m.item_id=i.id WHERE m.group_id=gid AND m.retired_at IS NULL AND i.id=line->>'id' AND i.owner_id=actor AND i.period_id=g.period_id AND i.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_GROUP_MEMBER';END IF;
  IF source.row_version<>(line->>'expectedVersion')::integer THEN RAISE EXCEPTION 'GROUP_CHANGED';END IF;
  IF (line->>'selected')::boolean AND (line->>'amount' IS NULL OR (line->>'amount')::bigint<0 OR (line->>'amount')::bigint>1000000000000) THEN RAISE EXCEPTION 'INVALID_GROUP_AMOUNT';END IF;
 END LOOP;
 IF payload->>'date' IS NOT NULL AND (left(payload->>'date',7)<>g.period_id OR to_char((payload->>'date')::date,'YYYY-MM-DD')<>payload->>'date') THEN RAISE EXCEPTION 'INVALID_GROUP_DATE';END IF;
 IF payload->>'action'='commit' AND g.status='posted' AND EXISTS(SELECT 1 FROM group_attachments WHERE group_id=gid AND status IN ('ready','pending')) AND coalesce(payload->>'evidenceDecision','') NOT IN ('keep','history') THEN RAISE EXCEPTION 'GROUP_EVIDENCE_REVIEW';END IF;
 PERFORM set_config('financee.group_write','1',true);
 FOR line IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
  SELECT * INTO source FROM budget_items WHERE id=line->>'id';
  SELECT * INTO member FROM allocation_group_items WHERE group_id=gid AND item_id=source.id;
  is_selected:=payload->>'action'='commit' AND (line->>'selected')::boolean;
  IF is_selected OR member.posted=1 THEN
   target_amount:=CASE WHEN is_selected THEN (line->>'amount')::bigint ELSE NULL END;
   UPDATE budget_items SET amount=target_amount,recording_mode='actual',posting_kind=g.posting_kind,posting_date=payload->>'date',posting_version=posting_version+1,amount_version=amount_version+1,row_version=row_version+1,updated_at=moment WHERE id=source.id;
   IF is_selected AND source.recording_mode='legacy' THEN
    UPDATE expenses SET superseded_by_item_id=source.id,superseded_at=moment,updated_at=moment,version=version+1 WHERE item_id=source.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL;
    UPDATE transfers SET superseded_by_item_id=source.id,superseded_at=moment,version=version+1 WHERE source_item_id=source.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL;
   END IF;
  END IF;
  UPDATE allocation_group_items SET posted=CASE WHEN is_selected THEN 1 ELSE 0 END WHERE group_id=gid AND item_id=source.id;
 END LOOP;
 UPDATE allocation_groups SET status=CASE WHEN payload->>'action'='cancel' THEN 'cancelled' ELSE 'posted' END,posting_date=payload->>'date',version=version+1,updated_at=moment WHERE id=gid RETURNING * INTO g;
 IF payload->>'action'='cancel' THEN
  UPDATE group_attachments SET status='deleting',updated_at=moment WHERE group_id=gid AND status<>'deleting';
 ELSIF payload->>'evidenceDecision'='keep' THEN
  UPDATE group_attachments SET confirmed_group_version=g.version,updated_at=moment WHERE group_id=gid AND status='ready';
 END IF;
 receipt:=jsonb_build_object('groupId',gid,'version',g.version,'status',g.status,'date',g.posting_date,'items',(SELECT jsonb_agg(jsonb_build_object('id',i.id,'label',i.label,'amount',i.amount,'posted',m.posted) ORDER BY m.position,i.id) FROM allocation_group_items m JOIN budget_items i ON i.id=m.item_id WHERE m.group_id=gid AND m.retired_at IS NULL))::text;
 INSERT INTO allocation_group_operations VALUES(payload->>'operationId',actor,gid,payload->>'action',fingerprint,g.version,receipt,moment);
 RETURN receipt;
END $$;

CREATE FUNCTION group_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF EXISTS(SELECT 1 FROM attachments WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM income_attachments WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM allocation_attachments WHERE id=NEW.id) THEN RAISE EXCEPTION 'ATTACHMENT_ID_CONFLICT';END IF;
 IF NEW.status<>'deleting' AND NOT EXISTS(SELECT 1 FROM allocation_groups WHERE id=NEW.group_id AND owner_id=NEW.owner_id AND status='posted' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_ATTACHMENT_OWNER';END IF;
 IF NEW.status IN ('pending','ready') AND (SELECT count(*) FROM group_attachments WHERE group_id=NEW.group_id AND status IN ('pending','ready') AND id<>NEW.id)>=10 THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER group_evidence BEFORE INSERT OR UPDATE ON group_attachments FOR EACH ROW EXECUTE FUNCTION group_evidence_guard();
CREATE FUNCTION revise_group_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE periods SET revision=revision+1 WHERE id=(SELECT period_id FROM allocation_groups WHERE id=NEW.group_id);RETURN NEW;
END $$;
CREATE TRIGGER group_evidence_revision AFTER INSERT OR UPDATE ON group_attachments FOR EACH ROW EXECUTE FUNCTION revise_group_evidence();

CREATE FUNCTION configure_allocation_group(period text, actor text, payload jsonb, moment bigint) RETURNS text LANGUAGE plpgsql AS $$
DECLARE g allocation_groups; member_id text; ordinal integer:=0; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 n:=jsonb_array_length(payload->'itemIds');
 IF n<1 OR n>200 OR n<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(payload->'itemIds')) THEN RAISE EXCEPTION 'INVALID_GROUP_MEMBER';END IF;
 IF n<>(SELECT count(*) FROM budget_items WHERE id IN (SELECT jsonb_array_elements_text(payload->'itemIds')) AND owner_id=actor AND period_id=period AND deleted_at IS NULL AND kind<>'income') THEN RAISE EXCEPTION 'INVALID_GROUP_MEMBER';END IF;
 SELECT * INTO g FROM allocation_groups WHERE id=payload->>'id';
 IF FOUND THEN
  IF g.owner_id<>actor OR g.period_id<>period THEN RAISE EXCEPTION 'GROUP_NOT_FOUND';END IF;
  IF payload->>'expectedVersion' IS NULL THEN
   IF g.label=payload->>'label' AND g.posting_kind=payload->>'postingKind' AND (SELECT array_agg(item_id ORDER BY item_id) FROM allocation_group_items WHERE group_id=g.id AND retired_at IS NULL)=(SELECT array_agg(value ORDER BY value) FROM jsonb_array_elements_text(payload->'itemIds')) THEN RETURN g.id;END IF;
   RAISE EXCEPTION 'GROUP_OPERATION_CONFLICT';
  END IF;
  IF g.version<>(payload->>'expectedVersion')::integer OR g.posting_kind<>payload->>'postingKind' THEN RAISE EXCEPTION 'GROUP_CHANGED';END IF;
  IF g.status='posted' THEN
   IF (SELECT array_agg(item_id ORDER BY item_id) FROM allocation_group_items WHERE group_id=g.id AND retired_at IS NULL) IS DISTINCT FROM (SELECT array_agg(value ORDER BY value) FROM jsonb_array_elements_text(payload->'itemIds')) THEN RAISE EXCEPTION 'GROUP_CHANGED';END IF;
   UPDATE allocation_groups SET label=payload->>'label',version=version+1,updated_at=moment WHERE id=g.id;
   UPDATE group_attachments SET confirmed_group_version=g.version+1,updated_at=moment WHERE group_id=g.id AND confirmed_group_version=g.version AND status IN ('pending','ready');
   RETURN g.id;
  END IF;
  UPDATE allocation_group_items SET retired_at=moment WHERE group_id=g.id AND retired_at IS NULL;
  UPDATE allocation_groups SET label=payload->>'label',version=version+1,updated_at=moment WHERE id=g.id;
 ELSE
  IF payload->>'expectedVersion' IS NOT NULL THEN RAISE EXCEPTION 'GROUP_NOT_FOUND';END IF;
  INSERT INTO allocation_groups(id,period_id,owner_id,label,posting_kind,recipient_owner_id,created_at,updated_at) VALUES(payload->>'id',period,actor,payload->>'label',payload->>'postingKind',payload->>'recipientOwnerId',moment,moment) RETURNING * INTO g;
 END IF;
 FOR member_id IN SELECT jsonb_array_elements_text(payload->'itemIds') LOOP
  INSERT INTO allocation_group_items(group_id,item_id,position,posted) VALUES(g.id,member_id,ordinal,0) ON CONFLICT(group_id,item_id) DO UPDATE SET retired_at=NULL,position=excluded.position,posted=0;
  ordinal:=ordinal+1;
 END LOOP;
 RETURN g.id;
END $$;

CREATE FUNCTION guard_group_file_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM group_attachments WHERE id=NEW.id) THEN RAISE EXCEPTION 'ATTACHMENT_ID_CONFLICT';END IF;RETURN NEW;
END $$;
CREATE TRIGGER group_file_identity BEFORE INSERT OR UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION guard_group_file_identity();
CREATE TRIGGER group_file_identity BEFORE INSERT OR UPDATE ON income_attachments FOR EACH ROW EXECUTE FUNCTION guard_group_file_identity();
CREATE TRIGGER group_file_identity BEFORE INSERT OR UPDATE ON allocation_attachments FOR EACH ROW EXECUTE FUNCTION guard_group_file_identity();
CREATE FUNCTION immutable_group_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'HISTORY_LOCKED';END $$;
CREATE TRIGGER group_operation_history BEFORE UPDATE OR DELETE ON allocation_group_operations FOR EACH ROW EXECUTE FUNCTION immutable_group_operation();

CREATE FUNCTION remove_allocation_group(gid text, actor text, expected integer, moment bigint) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE g allocation_groups;
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 SELECT * INTO g FROM allocation_groups WHERE id=gid AND owner_id=actor AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND';END IF;
 IF g.version<>expected OR g.status='posted' THEN RAISE EXCEPTION 'GROUP_CHANGED';END IF;
 UPDATE allocation_group_items SET retired_at=moment WHERE group_id=gid AND retired_at IS NULL;
 UPDATE allocation_groups SET deleted_at=moment,version=version+1,updated_at=moment WHERE id=gid;
 RETURN 1;
END $$;

CREATE FUNCTION copy_allocation_groups(source_period text, target_period text, actor text, moment bigint) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE g allocation_groups; new_id text; n integer:=0;
BEGIN
 FOR g IN SELECT * FROM allocation_groups WHERE period_id=source_period AND owner_id=actor AND deleted_at IS NULL LOOP
  new_id:=md5(target_period||':'||actor||':'||g.id);
  INSERT INTO allocation_groups(id,period_id,owner_id,label,posting_kind,recipient_owner_id,position,created_at,updated_at) VALUES(new_id,target_period,actor,g.label,g.posting_kind,g.recipient_owner_id,g.position,moment,moment);
  INSERT INTO allocation_group_items(group_id,item_id,position,posted) SELECT new_id,md5(target_period||':'||actor||':'||m.item_id),m.position,0 FROM allocation_group_items m WHERE m.group_id=g.id AND m.retired_at IS NULL;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION family_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF TG_TABLE_NAME='budget_items' THEN
  IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND (SELECT count(*) FROM budget_items WHERE period_id=NEW.period_id AND owner_id=NEW.owner_id AND deleted_at IS NULL)>=200 THEN RAISE EXCEPTION 'ITEM_LIMIT'; END IF;
  IF TG_OP='UPDATE' AND NEW.deleted_at IS NOT NULL AND (EXISTS(SELECT 1 FROM expenses WHERE item_id=NEW.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL) OR EXISTS(SELECT 1 FROM transfers WHERE source_item_id=NEW.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL)) THEN RAISE EXCEPTION 'ITEM_REFERENCED'; END IF;
 ELSIF TG_TABLE_NAME='expenses' THEN
  IF NEW.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM budget_items WHERE id=NEW.item_id AND owner_id=NEW.owner_id AND period_id=NEW.period_id AND (CASE WHEN NEW.superseded_by_item_id IS NOT NULL THEN kind='allocation' WHEN recording_mode='actual' THEN posting_kind='external' OR (posting_kind IS NULL AND kind='allocation') ELSE kind='allocation' END) AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_EXPENSE_ITEM'; END IF;
  IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND (SELECT count(*) FROM expenses WHERE owner_id=NEW.owner_id AND period_id=NEW.period_id AND deleted_at IS NULL)>=1000 THEN RAISE EXCEPTION 'EXPENSE_LIMIT'; END IF;
 ELSIF TG_TABLE_NAME='transfers' THEN
  IF NEW.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM budget_items WHERE id=NEW.source_item_id AND owner_id=NEW.from_owner_id AND period_id=NEW.period_id AND (CASE WHEN NEW.superseded_by_item_id IS NOT NULL THEN kind='transfer_out' WHEN recording_mode='actual' THEN posting_kind='internal' ELSE kind='transfer_out' END) AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_TRANSFER_ITEM'; END IF;
  IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND (SELECT count(*) FROM transfers WHERE from_owner_id=NEW.from_owner_id AND period_id=NEW.period_id AND deleted_at IS NULL)>=1000 THEN RAISE EXCEPTION 'TRANSFER_LIMIT'; END IF;
 ELSIF TG_TABLE_NAME='attachments' THEN
  IF NEW.status IN ('pending','ready','failed') AND NOT EXISTS(SELECT 1 FROM expenses WHERE id=NEW.expense_id AND owner_id=NEW.owner_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_ATTACHMENT_OWNER'; END IF;
  IF NEW.status IN ('pending','ready') AND (SELECT count(*) FROM attachments WHERE expense_id=NEW.expense_id AND status IN ('pending','ready') AND id<>NEW.id)>=10 THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT'; END IF;
 END IF;
 RETURN NEW;
END $$;
