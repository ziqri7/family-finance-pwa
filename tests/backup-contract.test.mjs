import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { validateManifestObjects } from "../scripts/backup-contract.mjs";
const db = new DatabaseSync(":memory:");
db.exec(
  "CREATE TABLE expenses(id TEXT,deleted_at INTEGER); CREATE TABLE attachments(id TEXT,expense_id TEXT,status TEXT,object_key TEXT,sha256 TEXT,byte_size INTEGER,content_type TEXT);",
);
db.prepare("INSERT INTO expenses VALUES(?,NULL)").run("expense");
const file = {
  id: "a".repeat(32),
  object_key: "evidence/00000000-0000-0000-0000-000000000001",
  sha256: "b".repeat(64),
  byte_size: 123,
  content_type: "image/png",
  file: "objects/" + "a".repeat(32) + ".bin",
};
db.prepare("INSERT INTO attachments VALUES(?,?,?,?,?,?,?)").run(
  file.id,
  "expense",
  "ready",
  file.object_key,
  file.sha256,
  file.byte_size,
  file.content_type,
);
test("restore requires complete exact SQL-to-object coverage", () => {
  assert.equal(validateManifestObjects(db, { objects: [file] }).length, 1);
  assert.throws(() => validateManifestObjects(db, { objects: [] }), /lengkap/);
  assert.throws(
    () => validateManifestObjects(db, { objects: [file, file] }),
    /lengkap/,
  );
});
test("restore rejects duplicate, missing or altered image metadata and unsafe file IDs", () => {
  for (const key of ["object_key", "sha256", "byte_size", "content_type"])
    assert.throws(
      () =>
        validateManifestObjects(db, {
          objects: [{ ...file, [key]: key === "byte_size" ? 124 : "altered" }],
        }),
      /Metadata/,
    );
  assert.throws(
    () =>
      validateManifestObjects(db, {
        objects: [{ ...file, file: "../escape" }],
      }),
    /path/,
  );
  assert.throws(
    () =>
      validateManifestObjects(db, { objects: [{ ...file, id: "../escape" }] }),
    /path/,
  );
});
