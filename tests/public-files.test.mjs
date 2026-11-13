import { test } from "node:test";
import assert from "node:assert/strict";
import { publicFiles } from "../scripts/public-files.mjs";
test("source package includes tests and example configuration while excluding local data and generated assets", async () => {
  const files = await publicFiles();
  for (const expected of [
    "tests/api.test.mjs",
    "tests/upload-faults.test.mjs",
    ".env.example",
    ".gitignore",
    "LICENSE",
    "package-lock.json",
    "migrations/0001_initial.sql",
    "scripts/prepare-public.mjs",
  ])
    assert.ok(files.includes(expected), expected);
  assert.equal(files.length, new Set(files).size);
  assert.ok(
    files.every(
      (path) =>
        !/(^|\/)(private|backups|dist|node_modules|\.wrangler|\.git|prototype)(\/|$)|\.private\.|\.xlsx$|WORKLOG\.md|\.dev\.vars|initial-credentials/i.test(
          path,
        ),
    ),
  );
});
