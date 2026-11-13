import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { serviceWorkerSource } from "../scripts/service-worker-source.mjs";
function runtime() {
  const handlers = {},
    calls = { add: [], match: [], deleted: [], skip: 0, claim: 0 };
  vm.runInNewContext(
    serviceWorkerSource("ff-shell-current", ["/index.html", "/assets/app.js"]),
    {
      URL,
      fetch: async () => {
        throw Error("offline");
      },
      self: {
        location: { origin: "https://family.invalid" },
        addEventListener: (type, handler) => (handlers[type] = handler),
        skipWaiting: () => calls.skip++,
        clients: { claim: async () => calls.claim++ },
      },
      caches: {
        open: async () => ({
          addAll: async (urls) => calls.add.push(...urls),
          match: async (url) => {
            calls.match.push(url);
            return { shell: true };
          },
        }),
        keys: async () => ["unrelated", "ff-shell-old", "ff-shell-current"],
        delete: async (name) => calls.deleted.push(name),
      },
    },
  );
  return { handlers, calls };
}
test("service worker never intercepts API, evidence, writes or external URLs", () => {
  const { handlers } = runtime();
  for (const [url, method] of [
    ["https://family.invalid/api/me", "GET"],
    ["https://family.invalid/api/attachments/x/content", "GET"],
    ["https://family.invalid/assets/app.js", "POST"],
    ["https://other.invalid/assets/app.js", "GET"],
  ]) {
    let intercepted = false;
    handlers.fetch({
      request: { url, method, mode: "cors" },
      respondWith: () => {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false);
  }
  assert.throws(() => serviceWorkerSource("x", ["/api/me"]), /API/);
});
test("offline fallback contains shell only and updates wait for explicit approval", async () => {
  const { handlers, calls } = runtime();
  let pending;
  handlers.install({ waitUntil: (p) => (pending = p) });
  await pending;
  assert.deepEqual(calls.add, ["/index.html", "/assets/app.js"]);
  assert.equal(calls.skip, 0);
  let response;
  handlers.fetch({
    request: {
      url: "https://family.invalid/",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (p) => (response = p),
  });
  assert.equal((await response).shell, true);
  assert.deepEqual(calls.match, ["/index.html"]);
  handlers.message({ data: "SKIP_WAITING" });
  assert.equal(calls.skip, 1);
  handlers.activate({ waitUntil: (p) => (pending = p) });
  await pending;
  assert.deepEqual(calls.deleted, ["ff-shell-old"]);
  assert.equal(calls.claim, 1);
});
test("manifest and raster icons have installable sizes and matching scope", async () => {
  const manifest = JSON.parse(
    await readFile("public/manifest.webmanifest", "utf8"),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  for (const icon of manifest.icons) {
    const bytes = await readFile("public" + icon.src);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});
