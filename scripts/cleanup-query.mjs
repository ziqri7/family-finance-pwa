export function cleanupQueries(now, apply = false) {
  if (!Number.isSafeInteger(now) || now < 86400000)
    throw Error("Waktu pembersihan tidak valid.");
  const expired = `status IN ('pending','failed') AND updated_at<${now - 86400000}`;
  return {
    mark: apply
      ? `UPDATE attachments SET status='deleting',updated_at=${now} WHERE ${expired}`
      : null,
    select: `SELECT id,object_key FROM attachments WHERE status='deleting'${apply ? "" : ` OR (${expired})`}`,
  };
}
