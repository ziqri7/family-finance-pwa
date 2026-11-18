import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/lib/save-queue.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { SaveQueue } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const base = {
  id: "a".repeat(32),
  period_id: "2026-11",
  owner_id: "partner-a",
  label: "Contoh",
  kind: "income",
  amount: null,
  position: 0,
  label_version: 1,
  amount_version: 1,
  row_version: 1,
  deleted_at: null,
};
const key = base.id + ":amount",
  tick = () => new Promise((resolve) => setImmediate(resolve));
function harness() {
  const requests = [],
    saved = [];
  let online = true;
  const queue = new SaveQueue({
    send: (draft, value) =>
      new Promise((resolve, reject) =>
        requests.push({ draft, value, resolve, reject }),
      ),
    saved: (item) => saved.push(item),
    notify: () => {},
    idle: async () => {},
    online: () => online,
  });
  return {
    queue,
    requests,
    saved,
    setOnline: (value) => {
      online = value;
    },
  };
}
test("funds guard without a current row remains a recoverable error, not a fabricated field conflict", async () => {
  const { queue, requests } = harness();
  queue.edit(base, "amount", "100");
  const saved = queue.commit(key);
  requests[0].reject(
    Object.assign(new Error("Dana belum cukup"), { status: 409 }),
  );
  await saved;
  assert.equal(queue.drafts.get(key).status, "error");
  assert.equal(queue.drafts.get(key).value, "100");
  assert.equal(queue.drafts.get(key).current, undefined);
  queue.resolve(key, false);
  assert.equal(queue.drafts.size, 0);
});
test("late success cannot mark a newer value saved; next write uses returned version", async () => {
  const { queue, requests, saved } = harness();
  queue.edit(base, "amount", "100");
  const first = queue.commit(key);
  queue.edit(base, "amount", "200");
  assert.equal(queue.commit(key), first);
  assert.equal(requests.length, 1);
  requests[0].resolve({
    ...base,
    amount: 100,
    amount_version: 2,
    row_version: 2,
  });
  await tick();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].value, 200);
  assert.equal(requests[1].draft.baseVersion, 2);
  assert.equal(queue.drafts.get(key).value, "200");
  assert.equal(queue.drafts.get(key).status, "saving");
  requests[1].resolve({
    ...base,
    amount: 200,
    amount_version: 3,
    row_version: 3,
  });
  await first;
  assert.equal(queue.drafts.size, 0);
  assert.deepEqual(
    saved.map((i) => i.amount),
    [100, 200],
  );
});
test("network failure preserves draft and retry retains identity and expected version", async () => {
  const { queue, requests, saved } = harness();
  queue.edit(base, "amount", "400");
  const pending = queue.commit(key);
  requests[0].reject(Object.assign(new Error("offline"), { status: 0 }));
  await pending;
  assert.equal(saved.length, 0);
  assert.equal(queue.drafts.get(key).status, "error");
  assert.equal(queue.drafts.get(key).value, "400");
  const retry = queue.commit(key);
  assert.equal(requests[1].draft.itemId, base.id);
  assert.equal(requests[1].draft.baseVersion, 1);
  assert.equal(requests[1].value, 400);
  requests[1].resolve({
    ...base,
    amount: 400,
    amount_version: 2,
    row_version: 2,
  });
  await retry;
  assert.equal(queue.drafts.size, 0);
});
test("conflict waits for an explicit decision and still uses compare-and-swap", async () => {
  const { queue, requests } = harness();
  queue.edit(base, "amount", "400");
  const pending = queue.commit(key);
  requests[0].reject(
    Object.assign(new Error("conflict"), {
      status: 409,
      current: { ...base, amount: 500, amount_version: 3, row_version: 3 },
    }),
  );
  await pending;
  assert.equal(await queue.flush(), false);
  assert.equal(requests.length, 1);
  assert.equal(queue.drafts.get(key).status, "conflict");
  queue.resolve(key, true);
  assert.equal(requests[1].draft.baseVersion, 3);
  assert.equal(requests[1].value, 400);
  requests[1].resolve({
    ...base,
    amount: 400,
    amount_version: 4,
    row_version: 4,
  });
  await queue.flush();
  assert.equal(queue.drafts.size, 0);
});
test("deleted record retains readable draft and cannot be forced back into existence", async () => {
  const { queue, requests } = harness();
  queue.edit(base, "amount", "123");
  queue.markDeleted({ ...base, deleted_at: 1 });
  assert.equal(queue.drafts.get(key).value, "123");
  queue.resolve(key, true);
  assert.equal(requests.length, 0);
  assert.equal(await queue.flush(), false);
  queue.resolve(key, false);
  assert.equal(queue.drafts.size, 0);
});
test("invalid and offline values never produce a success or network write", async () => {
  const { queue, requests, setOnline } = harness();
  queue.edit(base, "amount", "1.5");
  assert.equal(await queue.flush(), false);
  assert.equal(requests.length, 0);
  setOnline(false);
  queue.edit(base, "amount", "0");
  assert.equal(await queue.flush(), false);
  assert.equal(queue.drafts.get(key).value, "0");
  assert.equal(requests.length, 0);
  setOnline(true);
  const pending = queue.flush();
  requests[0].resolve({
    ...base,
    amount: 0,
    amount_version: 2,
    row_version: 2,
  });
  assert.equal(await pending, true);
});

test("delete preparation advances only to an acknowledged own save, not an unconfirmed version", async () => {
  const { queue, requests } = harness();
  assert.equal(queue.confirmed(base).row_version, 1);
  queue.edit(base, "amount", "100");
  const pending = queue.flush();
  assert.equal(queue.confirmed(base).row_version, 1);
  requests[0].resolve({
    ...base,
    amount: 100,
    amount_version: 2,
    row_version: 2,
  });
  await pending;
  assert.equal(queue.confirmed(base).row_version, 2);
  const newerObserved = {
    ...base,
    amount: 200,
    amount_version: 3,
    row_version: 3,
  };
  assert.equal(queue.confirmed(newerObserved), newerObserved);
});
