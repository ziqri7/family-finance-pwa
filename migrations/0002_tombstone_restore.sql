-- Tombstones remain restorable even when a month has reached its live-row quota.
CREATE OR REPLACE FUNCTION family_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(61324017);
 IF TG_TABLE_NAME='budget_items' THEN
  IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND (SELECT count(*) FROM budget_items WHERE period_id=NEW.period_id AND owner_id=NEW.owner_id AND deleted_at IS NULL)>=200 THEN RAISE EXCEPTION 'ITEM_LIMIT'; END IF;
  IF TG_OP='UPDATE' AND NEW.deleted_at IS NOT NULL AND (EXISTS(SELECT 1 FROM expenses WHERE item_id=NEW.id AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM transfers WHERE source_item_id=NEW.id AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'ITEM_REFERENCED'; END IF;
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
