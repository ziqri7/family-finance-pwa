import assert from "node:assert/strict";
const origin = "http://127.0.0.1:5173";
const index = await fetch(origin + "/");
assert.equal(index.status, 200);
assert.match(
  index.headers.get("content-security-policy"),
  /frame-ancestors 'none'/,
);
assert.equal(index.headers.get("x-content-type-options"), "nosniff");
assert.equal(index.headers.get("cache-control"), "no-store");
const manifest = await (await fetch(origin + "/manifest.webmanifest")).json();
assert.equal(manifest.display, "standalone");
const sw = await fetch(origin + "/sw.js");
assert.equal(sw.status, 200);
assert.equal(sw.headers.get("cache-control"), "no-store");
assert.match(await sw.text(), /ff-shell-/);
const api = await fetch(origin + "/api/me");
assert.equal(api.status, 401);
assert.equal(api.headers.get("cache-control"), "no-store");
for (const path of [
  "/Keu.xlsx",
  "/.dev.vars",
  "/.initial-credentials.txt",
  "/private/template.json",
]) {
  const response = await fetch(origin + path),
    type = response.headers.get("content-type") || "";
  assert.ok(
    response.status === 404 || type.includes("text/html"),
    "Berkas privat dapat diakses: " + path,
  );
  const text = await response.text();
  assert.ok(
    !text.includes("AUTH_USERS_JSON=") && !text.includes("AKUN LOKAL SAJA"),
  );
}
console.log(
  "Build lokal: manifest, service worker, header keamanan, API tanpa sesi dan pemisahan berkas privat lulus.",
);
