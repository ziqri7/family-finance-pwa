export function validateManifestObjects(db, manifest) {
  const required = db
    .prepare(
      "SELECT a.id,a.object_key,a.sha256,a.byte_size,a.content_type FROM attachments a JOIN expenses e ON e.id=a.expense_id WHERE a.status='ready' AND e.deleted_at IS NULL",
    )
    .all();
  if (
    !Array.isArray(manifest.objects) ||
    manifest.objects.length !== required.length
  )
    throw Error("Daftar gambar backup tidak lengkap.");
  const expected = new Map(required.map((file) => [file.id, file]));
  const seen = new Set();
  for (const file of manifest.objects) {
    if (
      !file ||
      !/^[a-f0-9]{32}$/.test(file.id) ||
      seen.has(file.id) ||
      file.file !== "objects/" + file.id + ".bin"
    )
      throw Error("ID/path gambar backup tidak valid atau duplikat.");
    seen.add(file.id);
    const original = expected.get(file.id);
    if (
      !original ||
      !["object_key", "sha256", "byte_size", "content_type"].every(
        (key) => file[key] === original[key],
      )
    )
      throw Error("Metadata gambar backup tidak sama dengan snapshot SQL.");
    if (
      !/^evidence\/[a-f0-9-]{36}$/.test(file.object_key) ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw Error("Key/checksum gambar backup tidak valid.");
  }
  return required;
}
