import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("Pages build routes all requests through the backend and never caches server code", async () => {
  const routes = JSON.parse(await readFile("dist/_routes.json", "utf8"));
  assert.deepEqual(routes, { version: 1, include: ["/*"], exclude: [] });
  const worker = await readFile("dist/_worker.js", "utf8"),
    sw = await readFile("dist/sw.js", "utf8");
  assert.ok(worker.includes("SESSION_SECRET"));
  assert.ok(!sw.includes("_worker.js"));
  assert.ok(!sw.includes("_routes.json"));
});
