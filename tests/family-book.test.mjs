import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { db, reset, config } from "./neon-helper.mjs";
import { credentials } from "../scripts/credentials.mjs";
import { runtime, loadConfig, migrate } from "../scripts/neon-runtime.mjs";
import {
  snapshot,
  createBackup,
  readBackup,
  restoreBackup,
} from "../scripts/neon-backup.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { encode } from "fast-png";
const id = () => randomBytes(16).toString("hex");
test("one family book: funds, cross-creator usage, independent evidence, history and restore", async (t) => {
  const auth = credentials();
  await reset(auth.users);
  const compiled = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  });
  const origin = "http://localhost",
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: compiled.outputFiles[0].text,
        compatibilityDate: "2026-11-12",
        bindings: {
          ...config,
          APP_ORIGIN: origin,
          LOCAL_DEV: "1",
          AUTH_USERS_JSON: JSON.stringify(auth.users),
          SESSION_SECRET: auth.secret,
          PASSWORD_PEPPER: auth.pepper,
        },
      }),
    );
  const cookies = [];
  async function req(
    path,
    { method = "GET", body, who = 0, raw, version = "3" } = {},
  ) {
    const response = await mf.dispatchFetch(origin + "/api" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookies[who] || "",
        "Content-Type": raw ? "image/png" : "application/json",
        "X-Financee-Client": version,
      },
      body: method === "GET" ? undefined : (raw ?? JSON.stringify(body ?? {})),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    let data;
    try {
      data = JSON.parse(bytes);
    } catch {}
    return { status: response.status, data, bytes, headers: response.headers };
  }
  const ok = async (path, options = {}, status = 200) => {
    const r = await req(path, options);
    assert.equal(r.status, status, JSON.stringify(r.data));
    return r.data;
  };
  const period = "2026-11";
  const snap = async () => ok("/periods/" + period);
  const find = async (item) => (await snap()).items.find((i) => i.id === item);
  async function add(
    label,
    kind = "allocation",
    who = 0,
    trackingEnabled = false,
  ) {
    const item = id();
    return (
      await ok(
        `/periods/${period}/items`,
        {
          method: "POST",
          who,
          body: { id: item, label, kind, trackingEnabled },
        },
        201,
      )
    ).item;
  }
  async function amount(item, value, who = 0) {
    const current = await find(item);
    return ok("/items/" + item, {
      method: "PATCH",
      who,
      body: { field: "amount", value, expectedVersion: current.amount_version },
    });
  }
  async function usage(item, amount, who = 1, uid = id()) {
    return ok(
      "/usages",
      {
        method: "POST",
        who,
        body: {
          id: uid,
          itemId: item,
          date: period + "-05",
          note: "Pemakaian contoh",
          amount,
        },
      },
      201,
    );
  }
  const png = Buffer.from(
    encode({
      width: 2,
      height: 2,
      data: new Uint8Array(16).fill(200),
      channels: 4,
      depth: 8,
    }),
  );
  async function image(parentRoute, parent, collection, who = 0, version) {
    const fid = id(),
      body = {
        id: fid,
        contentType: "image/png",
        byteSize: png.length,
        sha256: createHash("sha256").update(png).digest("hex"),
        ...(version ? { expectedVersion: version } : {}),
      };
    await ok(
      `/${parentRoute}/${parent}/attachments`,
      { method: "POST", who, body },
      201,
    );
    await ok(`/${collection}/${fid}/content`, { method: "PUT", raw: png, who });
    return fid;
  }
  try {
    for (const [who, u] of auth.users.entries()) {
      const r = await req("/login", {
        method: "POST",
        body: { email: u.email, password: auth.passwords[who] },
      });
      assert.equal(r.status, 200);
      cookies[who] = r.headers.get("set-cookie").split(";")[0];
    }
    await t.test(
      "one month works without a second budget; old clients and financial group writes are blocked",
      async () => {
        await ok(
          "/periods",
          { method: "POST", body: { id: period, mode: "default" } },
          201,
        );
        assert.equal((await snap()).budgets.length, 1);
        assert.equal(
          (await req("/periods/" + period, { version: "2" })).status,
          409,
        );
        assert.equal(
          (
            await req("/periods/" + period + "/allocation-groups", {
              method: "POST",
              body: {},
            })
          ).status,
          410,
        );
        assert.equal(
          (await req("/expenses", { method: "POST", body: {} })).status,
          410,
        );
      },
    );
    const income = await add("Penghasilan contoh", "income"),
      a = await add("Kebutuhan keluarga", "allocation", 0, true),
      b = await add("Tabungan keluarga");
    await amount(income.id, 8000000);
    await amount(a.id, 2000000);
    await amount(b.id, 6000000);
    await t.test(
      "no synthetic wife income and income reduction / allocation increases obey funds",
      async () => {
        assert.equal(
          (
            await req("/items/" + b.id, {
              method: "PATCH",
              body: {
                field: "amount",
                value: 6000001,
                expectedVersion: (await find(b.id)).amount_version,
              },
            })
          ).data.error.code,
          "FUNDS_EXCEEDED",
        );
        assert.equal(
          (
            await req("/items/" + income.id, {
              method: "PATCH",
              body: {
                field: "amount",
                value: 7999999,
                expectedVersion: (await find(income.id)).amount_version,
              },
            })
          ).status,
          409,
        );
        assert.equal((await find(income.id)).amount, 8000000);
        const report = await ok("/reports/year/2026");
        assert.equal(report.months[10].allocation, 8000000);
        assert.equal(report.months[10].complete, true);
        assert.equal(report.months[10].income, 8000000);
      },
    );
    let bundle, proof;
    await t.test(
      "collective proof across creators never changes any source monetary field",
      async () => {
        const wife = await add("Pos buatan istri", "allocation", 1);
        await amount(wife.id, 0, 1);
        const before = (await snap()).items;
        const input = {
          id: id(),
          label: "Satu bukti keluarga",
          items: [a.id, b.id, wife.id].map((item) => ({
            id: item,
            expectedVersion: before.find((i) => i.id === item).row_version,
          })),
        };
        bundle = (
          await ok(
            `/periods/${period}/evidence-bundles`,
            { method: "POST", who: 1, body: input },
            201,
          )
        ).group;
        assert.equal(bundle.posting_kind, null);
        assert.equal(bundle.recipient_owner_id, null);
        assert.deepEqual((await snap()).items, before);
        await ok(
          `/periods/${period}/evidence-bundles`,
          { method: "POST", who: 1, body: input },
          201,
        );
        assert.equal(
          (
            await req(`/periods/${period}/evidence-bundles`, {
              method: "POST",
              body: { ...input, id: id(), amount: 100 },
            })
          ).status,
          400,
        );
        proof = await image(
          "allocation-groups",
          bundle.id,
          "group-attachments",
          1,
          bundle.version,
        );
        for (let who = 0; who < 2; who++) {
          const r = await req(`/group-attachments/${proof}/content`, { who });
          assert.equal(r.status, 200);
          assert.deepEqual(r.bytes, png);
        }
        assert.equal(
          (
            await req("/group-attachments/" + proof, {
              method: "DELETE",
              body: {},
            })
          ).status,
          404,
        );
        const second = { ...input, id: id() };
        await ok(
          `/periods/${period}/evidence-bundles`,
          { method: "POST", body: second },
          201,
        );
        assert.equal(
          (await snap()).groupItems.filter((m) => m.item_id === a.id).length,
          2,
        );
      },
    );
    let child;
    await t.test(
      "cross-creator usage is capped, retry-safe and excluded from main total",
      async () => {
        child = (await usage(a.id, 100000)).usage;
        const retry = {
          id: child.id,
          itemId: a.id,
          date: period + "-05",
          note: "Pemakaian contoh",
          amount: 100000,
        };
        await ok("/usages", { method: "POST", who: 1, body: retry }, 201);
        assert.equal((await snap()).usages.length, 1);
        assert.equal(
          (
            await req("/usages/" + child.id, {
              method: "DELETE",
              body: { expectedVersion: child.version },
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await req("/items/" + a.id + "/tracking", {
              method: "PATCH",
              who: 1,
              body: {
                enabled: false,
                expectedVersion: (await find(a.id)).row_version,
              },
            })
          ).status,
          404,
        );
        const body = {
          id: id(),
          itemId: a.id,
          date: period + "-05",
          note: "Terlalu besar",
          amount: 2000000,
        };
        assert.equal(
          (await req("/usages", { method: "POST", who: 1, body })).data.error
            .code,
          "ALLOWANCE_EXCEEDED",
        );
        assert.equal((await ok("/reports/year/2026")).allocation, 8000000);
        const picture = await image("usages", child.id, "usage-attachments", 1);
        assert.equal(
          (await req("/usage-attachments/" + picture + "/content")).status,
          200,
        );
        assert.equal(
          (
            await req("/usage-attachments/" + picture, {
              method: "DELETE",
              body: {},
            })
          ).status,
          404,
        );
        const r = await req("/items/" + a.id, {
          method: "PATCH",
          body: {
            field: "amount",
            value: 99999,
            expectedVersion: (await find(a.id)).amount_version,
          },
        });
        assert.equal(r.data.error.code, "ALLOWANCE_EXCEEDED");
      },
    );
    await t.test(
      "two simultaneous users cannot spend the same allowance",
      async () => {
        const results = await Promise.all(
          [0, 1].map((who) =>
            req("/usages", {
              method: "POST",
              who,
              body: {
                id: id(),
                itemId: a.id,
                date: period + "-05",
                note: "Bersamaan",
                amount: 1200000,
              },
            }),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        assert.equal(
          (await snap()).usages.reduce((n, u) => n + u.amount, 0),
          1300000,
        );
      },
    );
    await t.test(
      "two allocation increases share one remaining pool; stale edits do not overwrite",
      async () => {
        await amount(income.id, 8100000);
        const aa = await find(a.id),
          bb = await find(b.id);
        const results = await Promise.all(
          [aa, bb].map((i) =>
            req("/items/" + i.id, {
              method: "PATCH",
              body: {
                field: "amount",
                value: i.amount + 100000,
                expectedVersion: i.amount_version,
              },
            }),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const now = await find(a.id);
        await amount(a.id, now.amount + 0); // identical retry allowed.
        const changed = await req("/items/" + a.id, {
          method: "PATCH",
          body: { field: "amount", value: now.amount + 2, expectedVersion: 1 },
        });
        assert.equal(changed.status, 409);
        assert.equal(changed.data.error.code, "FIELD_CONFLICT");
        const state = await snap(),
          winner = [aa, bb][results.findIndex((r) => r.status === 200)],
          linked = state.groupItems.find(
            (m) => m.group_id === bundle.id && m.item_id === winner.id,
          );
        assert.equal(linked.linked_amount, winner.amount);
        const bundleResult = await ok(
          `/periods/${period}/evidence-bundles`,
          {
            method: "POST",
            who: 1,
            body: {
              id: bundle.id,
              label: bundle.label,
              expectedVersion: bundle.version,
              items: state.groupItems
                .filter((m) => m.group_id === bundle.id)
                .map((m) => ({
                  id: m.item_id,
                  expectedVersion: state.items.find((i) => i.id === m.item_id)
                    .row_version,
                })),
            },
          },
          201,
        );
        bundle = bundleResult.group;
        const retained = (await snap()).groupItems.find(
          (m) => m.group_id === bundle.id && m.item_id === winner.id,
        );
        assert.equal(retained.linked_amount, winner.amount);
        assert.equal(retained.linked_version, linked.linked_version);
      },
    );
    await t.test(
      "invalid usage parents, forged creators and invalid dates are rejected",
      async () => {
        assert.equal(
          (
            await req("/usages", {
              method: "POST",
              body: {
                id: id(),
                itemId: income.id,
                date: period + "-05",
                note: "Bukan alokasi",
                amount: 1,
              },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await req("/usages", {
              method: "POST",
              body: {
                id: id(),
                itemId: b.id,
                date: period + "-05",
                note: "Palsu",
                amount: 1,
                owner_id: "partner-b",
              },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await req("/items/" + b.id, {
              method: "PATCH",
              body: {
                field: "date",
                value: "2026-11-31",
                expectedVersion: (await find(b.id)).row_version,
              },
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "disable tracking retains history; copy carries all creators without money or images",
      async () => {
        const source = await find(a.id);
        await ok("/items/" + a.id + "/tracking", {
          method: "PATCH",
          body: { enabled: false, expectedVersion: source.row_version },
        });
        assert.equal(
          (
            await req("/usages", {
              method: "POST",
              body: {
                id: id(),
                itemId: a.id,
                date: period + "-05",
                note: "Dinonaktifkan",
                amount: 1,
              },
            })
          ).status,
          409,
        );
        assert.equal((await snap()).usages.length, 2);
        await ok(
          "/periods",
          {
            method: "POST",
            who: 1,
            body: { id: "2026-12", mode: "copy", sourcePeriodId: period },
          },
          201,
        );
        const copied = await ok("/periods/2026-12");
        assert.equal(
          copied.items.length,
          (await snap()).items.filter((i) => !i.deleted_at).length,
        );
        assert.equal(
          copied.items.filter((i) => i.owner_id === "partner-a").length,
          3,
        );
        assert.ok(
          copied.items.every(
            (i) =>
              i.amount === null &&
              i.posting_date === null &&
              i.copied_by === "partner-b",
          ),
        );
        assert.equal(copied.usages.length, 0);
        assert.equal(copied.groups.length, 0);
        assert.equal(copied.attachments.length, 0);
        const wrong = copied.items.find((i) => i.owner_id === "partner-a");
        assert.equal(
          (
            await req("/items/" + wrong.id, {
              method: "PATCH",
              who: 1,
              body: {
                field: "label",
                value: "Ambil alih",
                expectedVersion: wrong.label_version,
              },
            })
          ).status,
          404,
        );
      },
    );
    await t.test(
      "source deletion retains partner usage and its private images; deleting bundle changes no money",
      async () => {
        const parent = await find(a.id);
        await ok("/items/" + a.id, {
          method: "DELETE",
          body: { expectedVersion: parent.row_version },
        });
        const s = await snap();
        assert.equal(
          s.usages.filter((u) => u.item_id === a.id && !u.deleted_at).length,
          2,
        );
        assert.ok(s.items.find((i) => i.id === a.id).deleted_at);
        const ufile = s.attachments.find((f) => f.usage_entry_id === child.id);
        assert.equal(
          (await req("/usage-attachments/" + ufile.id + "/content")).status,
          200,
        );
        const before = s.items;
        await ok("/evidence-bundles/" + bundle.id, {
          method: "DELETE",
          who: 1,
          body: { expectedVersion: bundle.version },
        });
        assert.deepEqual((await snap()).items, before);
        assert.equal(
          (await req("/group-attachments/" + proof + "/content")).status,
          404,
        );
      },
    );
    await t.test(
      "backup7 restores all sixteen tables and usage images including deleted-parent history",
      async () => {
        const { Database, EvidenceStorage } = await runtime(),
          restore = loadConfig(".env.neon-restore");
        assert.equal(restore.NEON_BRANCH, "financee-restore-test");
        const target = new Database(restore.DATABASE_URL),
          bucket = new EvidenceStorage(restore);
        await migrate(target);
        await target
          .prepare(
            "TRUNCATE usage_attachments,usage_entries,group_attachments,allocation_group_operations,allocation_group_items,allocation_groups,allocation_attachments,income_attachments,attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts,account_credentials",
          )
          .run();
        const folder = await createBackup(db, new EvidenceStorage(config));
        const read = await readBackup(folder);
        assert.equal(read.manifest.version, 7);
        assert.equal(Object.keys(read.data).length, 16);
        const restored = await restoreBackup(
          target,
          bucket,
          folder,
          auth.pepper,
        );
        assert.equal(restored.tables, 16);
        assert.ok(restored.objects >= 1);
      },
    );
  } finally {
    await mf.dispose();
  }
});
