import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { db, reset, config } from "./neon-helper.mjs";
import { credentials } from "../scripts/credentials.mjs";
import { runtime, loadConfig, migrate } from "../scripts/neon-runtime.mjs";
import {
  snapshot as databaseSnapshot,
  createBackup,
  readBackup,
  restoreBackup,
} from "../scripts/neon-backup.mjs";
test("grouped allocations commit atomically, retry safely, retain shared evidence and copy empty structure", async () => {
  const auth = credentials(),
    id = () => randomBytes(16).toString("hex"),
    origin = "http://localhost";
  await reset(auth.users);
  const items = Array.from({ length: 4 }, id),
    group = id(),
    oldExpense = id();
  await db.batch([
    db.prepare("INSERT INTO periods VALUES('2026-11',1,1)"),
    db.prepare(
      "INSERT INTO budgets VALUES('2026-11','partner-a',1),('2026-11','partner-b',1)",
    ),
    ...items.map((item, i) =>
      db
        .prepare(
          "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at) VALUES($1,'2026-11','partner-a',$2,'allocation',500000,$3,1,1)",
        )
        .bind(item, "Pos " + i, i),
    ),
    db
      .prepare(
        "INSERT INTO expenses(id,period_id,owner_id,item_id,occurred_on,note,amount,created_at,updated_at) VALUES($1,'2026-11','partner-a',$2,'2026-11-01','Catatan lama',400000,1,1)",
      )
      .bind(oldExpense, items[0]),
  ]);
  const compiled = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  });
  const mf = new Miniflare(
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
  async function req(path, { method = "GET", body, who = 0, raw } = {}) {
    const r = await mf.dispatchFetch(origin + "/api" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookies[who] || "",
        "Content-Type": raw ? "image/png" : "application/json",
        "X-Financee-Client": "2",
      },
      body: method === "GET" ? undefined : (raw ?? JSON.stringify(body ?? {})),
    });
    const bytes = Buffer.from(await r.arrayBuffer());
    let data;
    try {
      data = JSON.parse(bytes);
    } catch {
      data = null;
    }
    return { status: r.status, data, bytes, headers: r.headers };
  }
  const payload = (review) => ({
    operationId: id(),
    expectedVersion: review.group.version,
    expectedRevision: review.group.expected_revision,
    date: null,
    items: review.items.map((i, index) => ({
      id: i.id,
      expectedVersion: i.row_version,
      selected: true,
      amount: index === 0 ? 400000 : 500000,
    })),
  });
  const review = async () => {
    const r = await req("/allocation-groups/" + group);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  };
  try {
    for (const [i, u] of auth.users.entries()) {
      const r = await req("/login", {
        method: "POST",
        body: { email: u.email, password: auth.passwords[i] },
      });
      assert.equal(r.status, 200);
      cookies[i] = r.headers.get("set-cookie").split(";")[0];
    }
    const definition = {
      id: group,
      label: "Ke istri",
      postingKind: "internal",
      itemIds: items,
    };
    assert.equal(
      (
        await req("/periods/2026-11/allocation-groups", {
          method: "POST",
          body: definition,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await req("/periods/2026-11/allocation-groups", {
          method: "POST",
          body: definition,
        })
      ).status,
      200,
      "configure retry",
    );
    const original = await review(),
      bad = payload(original);
    bad.items[3].expectedVersion++;
    const before = (
      await db.prepare("SELECT * FROM budget_items ORDER BY id").all()
    ).results;
    assert.equal(
      (
        await req("/allocation-groups/" + group + "/commit", {
          method: "POST",
          body: bad,
        })
      ).status,
      409,
    );
    assert.deepEqual(
      (await db.prepare("SELECT * FROM budget_items ORDER BY id").all())
        .results,
      before,
      "Partial financial commit",
    );
    const good = payload(await review());
    const committed = await req("/allocation-groups/" + group + "/commit", {
      method: "POST",
      body: good,
    });
    assert.equal(committed.status, 200, JSON.stringify(committed.data));
    assert.equal(
      (
        await req("/allocation-groups/" + group + "/commit", {
          method: "POST",
          body: good,
          who: 1,
        })
      ).status,
      404,
    );
    assert.equal(
      (await req("/allocation-groups/" + group, { who: 1 })).status,
      200,
      "Partner reads",
    );
    assert.equal(
      (
        await req("/items/" + items[0], {
          method: "PATCH",
          body: { field: "amount", value: 1, expectedVersion: 2 },
        })
      ).status,
      409,
      "Old amount endpoint blocked",
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT sum(amount)::bigint AS n FROM effective_postings WHERE posting_kind='internal'",
          )
          .first()
      ).n,
      1900000,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT superseded_by_item_id FROM expenses WHERE id=$1")
          .bind(oldExpense)
          .first()
      ).superseded_by_item_id,
      items[0],
    );
    const corrected = payload(await review());
    corrected.items[0].amount = 450000;
    assert.equal(
      (
        await req("/allocation-groups/" + group + "/commit", {
          method: "POST",
          body: corrected,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await req("/allocation-groups/" + group + "/commit", {
          method: "POST",
          body: good,
        })
      ).status,
      200,
      "Late retry reads original receipt",
    );
    assert.equal(
      (
        await db
          .prepare("SELECT amount FROM budget_items WHERE id=$1")
          .bind(items[0])
          .first()
      ).amount,
      450000,
      "Late retry overwrote correction",
    );
    const extra = id();
    assert.equal(
      (
        await req("/transfers", {
          method: "POST",
          body: {
            id: extra,
            sourceItemId: items[0],
            date: "2026-11-16",
            amount: 50000,
          },
        })
      ).status,
      201,
      "Additional transfer on grouped allocation rejected",
    );
    assert.equal(
      (
        await req("/allocation-groups/" + group + "/commit", {
          method: "POST",
          body: good,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT superseded_by_item_id FROM transfers WHERE id=$1")
          .bind(extra)
          .first()
      ).superseded_by_item_id,
      null,
      "Late retry superseded new transfer",
    );
    assert.equal(
      (
        await req("/expenses", {
          method: "POST",
          body: {
            id: id(),
            itemId: items[0],
            date: "2026-11-16",
            note: "Wrong destination",
            amount: 1,
          },
        })
      ).status,
      400,
      "Internal allocation accepted external expense",
    );
    assert.equal(
      (
        await req("/transfers/" + extra, {
          method: "DELETE",
          body: { expectedVersion: 1 },
        })
      ).status,
      200,
    );
    const file = await readFile("public/icons/icon-192.png"),
      fileId = id(),
      sha256 = createHash("sha256").update(file).digest("hex"),
      current = await review();
    const reservation = {
      id: fileId,
      contentType: "image/png",
      byteSize: file.length,
      sha256,
      expectedVersion: current.group.version,
    };
    assert.equal(
      (
        await req("/allocation-groups/" + group + "/attachments", {
          method: "POST",
          who: 1,
          body: reservation,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await req("/allocation-groups/" + group + "/attachments", {
          method: "POST",
          body: reservation,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await req("/group-attachments/" + fileId + "/content", {
          method: "PUT",
          raw: file,
        })
      ).status,
      200,
    );
    const image = await req("/group-attachments/" + fileId + "/content", {
      who: 1,
    });
    assert.equal(image.status, 200);
    assert.deepEqual(image.bytes, file);
    const snapshot = (await req("/periods/2026-11")).data;
    assert.equal(snapshot.groups.length, 1);
    assert.equal(snapshot.groupItems.length, 4);
    assert.equal(
      snapshot.attachments.filter((a) => a.group_id === group).length,
      1,
    );
    assert.ok(!JSON.stringify(snapshot).includes("object_key"));
    const pendingId = id(),
      pendingReview = await review();
    assert.equal(
      (
        await req("/allocation-groups/" + group + "/attachments", {
          method: "POST",
          body: {
            ...reservation,
            id: pendingId,
            expectedVersion: pendingReview.group.version,
          },
        })
      ).status,
      201,
    );
    const update = payload(await review());
    assert.equal(
      (
        await req("/allocation-groups/" + group + "/commit", {
          method: "POST",
          body: update,
        })
      ).status,
      409,
      "Evidence decision required",
    );
    update.evidenceDecision = "history";
    assert.equal(
      (
        await req("/allocation-groups/" + group + "/commit", {
          method: "POST",
          body: update,
        })
      ).status,
      200,
    );
    assert.equal(
      (await req("/group-attachments/" + fileId + "/content")).status,
      200,
      "Old evidence retained",
    );
    assert.equal(
      (
        await req("/group-attachments/" + pendingId + "/content", {
          method: "PUT",
          raw: file,
        })
      ).status,
      409,
      "Stale image attached to corrected amount",
    );
    assert.equal(
      (await req("/group-attachments/" + pendingId, { method: "DELETE" }))
        .status,
      200,
    );
    assert.equal(
      (
        await req("/group-attachments/" + pendingId + "/content", {
          method: "PUT",
          raw: file,
        })
      ).status,
      409,
      "Cancelled pending image revived",
    );
    assert.equal(
      (
        await req("/periods", {
          method: "POST",
          body: { id: "2026-12", mode: "copy", sourcePeriodId: "2026-11" },
        })
      ).status,
      201,
    );
    const copied = (await req("/periods/2026-12")).data;
    assert.equal(copied.groups.length, 1);
    assert.equal(copied.groups[0].status, "draft");
    assert.equal(copied.groupItems.length, 4);
    assert.ok(
      copied.items.every((i) => i.amount === null && i.posting_date === null),
    );
    assert.equal(copied.attachments.length, 0);
    const latest = await review(),
      rename = {
        ...definition,
        label: "Pembagian bersama",
        expectedVersion: latest.group.version,
      };
    assert.equal(
      (
        await req("/allocation-groups/" + group, {
          method: "PATCH",
          body: rename,
        })
      ).status,
      200,
    );
    const concurrencyReview = await review(),
      one = payload(concurrencyReview),
      two = payload(concurrencyReview);
    one.evidenceDecision = "history";
    two.evidenceDecision = "history";
    two.items[0].amount = 475000;
    const raced = await Promise.all([
      req("/allocation-groups/" + group + "/commit", {
        method: "POST",
        body: one,
      }),
      req("/allocation-groups/" + group + "/commit", {
        method: "POST",
        body: two,
      }),
    ]);
    assert.deepEqual(
      raced.map((r) => r.status).sort(),
      [200, 409],
      "Concurrent commits both applied",
    );
    const backup = await createBackup(
        db,
        (await import("./neon-helper.mjs")).bucket,
      ),
      checked = await readBackup(backup);
    assert.equal(checked.manifest.version, 6);
    assert.equal(Object.keys(checked.data).length, 14);
    assert.equal(checked.manifest.objects.length, 1);
    const target = loadConfig(".env.neon-restore");
    assert.equal(target.NEON_BRANCH, "financee-restore-test");
    assert.equal(target.NEON_BRANCH_ID, "br-wild-meadow-a1x656sx");
    assert.notEqual(
      new URL(target.DATABASE_URL).hostname,
      new URL(config.DATABASE_URL).hostname,
    );
    const { Database, EvidenceStorage } = await runtime(),
      dest = new Database(target.DATABASE_URL),
      storage = new EvidenceStorage(target);
    await migrate(dest);
    for (const row of (
      await dest
        .prepare(
          "SELECT object_key FROM attachments UNION ALL SELECT object_key FROM income_attachments UNION ALL SELECT object_key FROM allocation_attachments UNION ALL SELECT object_key FROM group_attachments",
        )
        .all()
    ).results)
      await storage.delete(row.object_key);
    await dest
      .prepare(
        "TRUNCATE group_attachments,allocation_group_operations,allocation_group_items,allocation_groups,allocation_attachments,income_attachments,attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts,account_credentials",
      )
      .run();
    assert.deepEqual(await restoreBackup(dest, storage, backup, auth.pepper), {
      tables: 14,
      objects: 1,
    });
    assert.deepEqual(
      await databaseSnapshot(dest),
      await databaseSnapshot(db),
      "Group restore differs",
    );
    const cancel = payload(await review());
    assert.equal(
      (
        await req("/allocation-groups/" + group + "/cancel", {
          method: "POST",
          body: cancel,
        })
      ).status,
      200,
    );
    assert.equal(
      (await req("/group-attachments/" + fileId + "/content")).status,
      404,
    );
    assert.equal(
      (
        await req("/group-attachments/" + fileId + "/content", {
          method: "PUT",
          raw: file,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT count(*)::int AS n FROM effective_postings")
          .first()
      ).n,
      0,
      "History revived after cancellation",
    );
    const cancelled = await review();
    assert.equal(
      (
        await req("/allocation-groups/" + group, {
          method: "DELETE",
          body: { expectedVersion: cancelled.group.version },
        })
      ).status,
      200,
    );
    assert.equal((await req("/allocation-groups/" + group)).status, 404);
    const retiredBackup = await createBackup(
        db,
        (await import("./neon-helper.mjs")).bucket,
      ),
      retired = await readBackup(retiredBackup);
    assert.equal(retired.manifest.objects.length, 0);
    await dest
      .prepare(
        "TRUNCATE group_attachments,allocation_group_operations,allocation_group_items,allocation_groups,allocation_attachments,income_attachments,attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts,account_credentials",
      )
      .run();
    assert.deepEqual(
      await restoreBackup(dest, storage, retiredBackup, auth.pepper),
      { tables: 14, objects: 0 },
    );
    assert.deepEqual(
      await databaseSnapshot(dest),
      await databaseSnapshot(db),
      "Retired group history restore differs",
    );
    const oldFolder = retiredBackup + "-format5";
    await mkdir(oldFolder);
    const oldData = Object.fromEntries(
        Object.entries(retired.data).filter(
          ([key]) =>
            ![
              "allocation_groups",
              "allocation_group_items",
              "allocation_group_operations",
              "group_attachments",
            ].includes(key),
        ),
      ),
      oldJson = JSON.stringify(oldData);
    await writeFile(oldFolder + "/database.json", oldJson);
    await writeFile(
      oldFolder + "/manifest.json",
      JSON.stringify({
        ...retired.manifest,
        version: 5,
        migrations: retired.manifest.migrations.slice(0, 5),
        databaseSha256: createHash("sha256").update(oldJson).digest("hex"),
      }),
    );
    const oldRead = await readBackup(oldFolder);
    assert.equal(oldRead.data.allocation_groups.length, 0);
    await dest
      .prepare(
        "TRUNCATE group_attachments,allocation_group_operations,allocation_group_items,allocation_groups,allocation_attachments,income_attachments,attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts,account_credentials",
      )
      .run();
    assert.deepEqual(
      await restoreBackup(dest, storage, oldFolder, auth.pepper),
      { tables: 14, objects: 0 },
    );
  } finally {
    await mf.dispose();
  }
});
