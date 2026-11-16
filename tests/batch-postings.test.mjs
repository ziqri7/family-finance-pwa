import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const code = await build({
  entryPoints: ["src/lib/batch-postings.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { submitPostings } = await import(
  "data:text/javascript;base64," +
    Buffer.from(code.outputFiles[0].text).toString("base64")
);
const review = (id) => ({
  item: {
    id,
    row_version: 1,
    amount: 450000,
    recording_mode: "legacy",
    posting_date: null,
  },
  relatedTotal: 400000,
  relatedCount: 1,
  relatedEvidenceCount: 1,
  expectedRevision: 1,
  expenses: [{ id: id + "old", version: 1, amount: 400000 }],
  transfers: [],
});
const choice = (r) => ({
  review: structuredClone(r),
  amount: 400000,
  kind: "external",
});
test("one confirmation processes multiple rows with current revision after own previous write", async () => {
  const rows = new Map(["a", "b"].map((id) => [id, review(id)])),
    choices = [...rows.values()].map(choice),
    writes = [];
  let revision = 1;
  const api = async (path, o) => {
    const id = path.split("/")[2],
      r = rows.get(id);
    if (!o?.method)
      return structuredClone({ ...r, expectedRevision: revision });
    assert.equal(o.body.expectedRevision, revision);
    writes.push(id);
    revision++;
    r.item = {
      ...r.item,
      recording_mode: "actual",
      amount: o.body.amount,
      posting_kind: o.body.postingKind,
    };
  };
  const results = await submitPostings(
    choices,
    api,
    new AbortController().signal,
    () => {},
  );
  assert.deepEqual(
    results.map((r) => r.status),
    ["done", "done"],
  );
  assert.deepEqual(writes, ["a", "b"]);
});
test("stale row or child changes are shown for review without silently changing money", async () => {
  const baseline = review("a"),
    changed = structuredClone(baseline);
  changed.expenses[0].amount = 420000;
  changed.expenses[0].version++;
  let writes = 0;
  const results = await submitPostings(
    [choice(baseline)],
    async (_p, o) => {
      if (o?.method) writes++;
      return changed;
    },
    new AbortController().signal,
    () => {},
  );
  assert.equal(results[0].status, "changed");
  assert.equal(writes, 0);
});
test("lost reply after commit stops batch; retry recognizes success without touching newer manual history", async () => {
  const rows = new Map(["a", "b"].map((id) => [id, review(id)])),
    choices = [...rows.values()].map(choice),
    writes = [];
  let lost = true;
  const api = async (path, o) => {
    const id = path.split("/")[2],
      r = rows.get(id);
    if (!o?.method) return structuredClone(r);
    writes.push(id);
    r.item = {
      ...r.item,
      recording_mode: "actual",
      amount: o.body.amount,
      posting_kind: o.body.postingKind,
    };
    if (lost) {
      lost = false;
      r.expenses.push({ id: "new-extra", amount: 50, version: 1 });
      throw Object.assign(Error("Jawaban hilang"), { status: 0 });
    }
  };
  assert.equal(
    (
      await submitPostings(choices, api, new AbortController().signal, () => {})
    )[0].status,
    "failed",
  );
  assert.deepEqual(writes, ["a"]);
  const result = await submitPostings(
    choices,
    api,
    new AbortController().signal,
    () => {},
  );
  assert.deepEqual(
    result.map((r) => r.status),
    ["done", "done"],
  );
  assert.deepEqual(writes, ["a", "b"]);
  assert.ok(rows.get("a").expenses.some((e) => e.id === "new-extra"));
});
test("session expiry and abort stop further writes; invalid amounts never reach API", async () => {
  const choices = [choice(review("a")), choice(review("b"))];
  let calls = 0;
  await submitPostings(
    choices,
    async () => {
      calls++;
      throw Object.assign(Error("Sesi habis"), { status: 401 });
    },
    new AbortController().signal,
    () => {},
  );
  assert.equal(calls, 1);
  const controller = new AbortController();
  controller.abort();
  await submitPostings(
    choices,
    async () => {
      calls++;
    },
    controller.signal,
    () => {},
  );
  assert.equal(calls, 1);
  const result = await submitPostings(
    [{ ...choices[0], amount: -1 }],
    async () => {
      calls++;
    },
    new AbortController().signal,
    () => {},
  );
  assert.equal(result[0].status, "failed");
  assert.equal(calls, 1);
});
