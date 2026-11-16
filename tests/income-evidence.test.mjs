import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import jpeg from "jpeg-js";
import { credentials } from "../scripts/credentials.mjs";
import { seed } from "../scripts/seed-template.mjs";
import { config, db, bucket, reset } from "./neon-helper.mjs";
import {
  createBackup,
  restoreBackup,
  readBackup,
} from "../scripts/neon-backup.mjs";
import { runtime, loadConfig, migrate } from "../scripts/neon-runtime.mjs";
test("income evidence: both owners, private reads, quota, copy, retirement and restore", async (t) => {
  const auth = credentials(),
    origin = "http://localhost",
    cookies = {},
    id = () => randomBytes(16).toString("hex");
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
  async function req(who, method, path, body, type = "application/json") {
    const r = await mf.dispatchFetch(origin + "/api" + path, {
      method,
      headers: {
        Origin: origin,
        "X-Financee-Client": "2",
        Cookie: cookies[who] || "",
        "Content-Type": type,
      },
      body:
        body === undefined
          ? undefined
          : type === "application/json"
            ? JSON.stringify(body)
            : body,
    });
    return {
      status: r.status,
      headers: r.headers,
      data: r.headers.get("content-type")?.includes("json")
        ? await r.json()
        : new Uint8Array(await r.arrayBuffer()),
    };
  }
  const png = await readFile("public/icons/icon-192.png");
  const file = (bytes = png, type = "image/png") => ({
    id: id(),
    contentType: type,
    byteSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  let a, b, allocation, first;
  try {
    await reset(auth.users);
    await seed(db);
    for (const [i, who] of ["a", "b"].entries()) {
      const r = await req("", "POST", "/login", {
        email: auth.users[i].email,
        password: auth.passwords[i],
      });
      assert.equal(r.status, 200);
      cookies[who] = r.headers.get("set-cookie").split(";")[0];
      assert.equal(
        (await req(who, "POST", "/periods", { id: "2003-01", mode: "default" }))
          .status,
        201,
      );
    }
    // Defaults are not required by this fixture; create explicit income/allocation rows.
    a = id();
    b = id();
    allocation = id();
    for (const [who, item, kind] of [
      ["a", a, "income"],
      ["b", b, "income"],
      ["a", allocation, "allocation"],
    ])
      assert.equal(
        (
          await req(who, "POST", "/periods/2003-01/items", {
            id: item,
            label: "Contoh " + kind,
            kind,
          })
        ).status,
        201,
      );
    await t.test("owner-only reservations and income-only parent", async () => {
      assert.equal(
        (await req("b", "POST", "/income-items/" + a + "/attachments", file()))
          .status,
        404,
      );
      assert.equal(
        (
          await req(
            "a",
            "POST",
            "/income-items/" + allocation + "/attachments",
            file(),
          )
        ).status,
        409,
      );
      assert.equal(
        (await req("", "GET", "/income-attachments/" + id() + "/content"))
          .status,
        401,
      );
    });
    await t.test(
      "valid PNG/JPG, retry, revision and cross-account view",
      async () => {
        const before = (await req("a", "GET", "/periods/2003-01")).data
          .revision;
        for (const [who, item, type, bytes] of [
          ["a", a, "image/png", png],
          [
            "b",
            b,
            "image/jpeg",
            jpeg.encode(
              { width: 1, height: 1, data: Buffer.from([100, 120, 140, 255]) },
              80,
            ).data,
          ],
        ]) {
          const v = file(bytes, type);
          if (who === "a") first = v;
          assert.equal(
            (
              await req(
                who,
                "POST",
                "/income-items/" + item + "/attachments",
                v,
              )
            ).status,
            201,
          );
          assert.equal(
            (
              await req(
                who,
                "POST",
                "/income-items/" + item + "/attachments",
                v,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await req(
                who === "a" ? "b" : "a",
                "PUT",
                "/income-attachments/" + v.id + "/content",
                bytes,
                type,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await req(
                who,
                "PUT",
                "/income-attachments/" + v.id + "/content",
                bytes,
                type,
              )
            ).status,
            200,
          );
          const view = await req(
            who === "a" ? "b" : "a",
            "GET",
            "/income-attachments/" + v.id + "/content",
          );
          assert.equal(view.status, 200);
          assert.equal(
            createHash("sha256").update(view.data).digest("hex"),
            v.sha256,
          );
          assert.equal(
            (
              await req(
                who === "a" ? "b" : "a",
                "DELETE",
                "/income-attachments/" + v.id,
                {},
              )
            ).status,
            404,
          );
        }
        const snap = (await req("b", "GET", "/periods/2003-01")).data;
        assert.ok(snap.revision > before);
        assert.equal(
          snap.attachments.filter((f) => f.income_item_id).length,
          2,
        );
        assert.ok(!JSON.stringify(snap.attachments).includes("object_key"));
      },
    );
    await t.test(
      "invalid image, checksum, size and concurrent quota rejected",
      async () => {
        const fake = Buffer.from("not a png"),
          v = file(fake);
        assert.equal(
          (await req("a", "POST", "/income-items/" + a + "/attachments", v))
            .status,
          201,
        );
        assert.equal(
          (
            await req(
              "a",
              "PUT",
              "/income-attachments/" + v.id + "/content",
              fake,
              "image/png",
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await req(
              "a",
              "PUT",
              "/income-attachments/" + v.id + "/content",
              png,
              "image/png",
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await req("a", "POST", "/income-items/" + a + "/attachments", {
              ...file(),
              byteSize: 5242881,
            })
          ).status,
          400,
        );
        const results = await Promise.all(
          Array.from({ length: 10 }, () =>
            req("a", "POST", "/income-items/" + a + "/attachments", file()),
          ),
        );
        assert.equal(results.filter((r) => r.status === 201).length, 8);
        assert.equal(results.filter((r) => r.status === 409).length, 2);
      },
    );
    await t.test(
      "evidence IDs cannot collide across income and expense backup entries",
      async () => {
        const expense = id();
        assert.equal(
          (
            await req("a", "POST", "/expenses", {
              id: expense,
              itemId: allocation,
              date: "2003-01-01",
              note: "Contoh",
              amount: 1,
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await req(
              "a",
              "POST",
              "/expenses/" + expense + "/attachments",
              first,
            )
          ).status,
          409,
        );
        const other = file();
        assert.equal(
          (
            await req(
              "a",
              "POST",
              "/expenses/" + expense + "/attachments",
              other,
            )
          ).status,
          201,
        );
        assert.equal(
          (await req("b", "POST", "/income-items/" + b + "/attachments", other))
            .status,
          409,
        );
        assert.equal(
          (
            await req(
              "a",
              "PUT",
              "/attachments/" + other.id + "/content",
              png,
              "image/png",
            )
          ).status,
          200,
        );
      },
    );
    await t.test(
      "copy excludes evidence and does not create income transactions",
      async () => {
        assert.equal(
          (
            await req("a", "POST", "/periods", {
              id: "2003-02",
              mode: "copy",
              sourcePeriodId: "2003-01",
            })
          ).status,
          201,
        );
        const copy = (await req("a", "GET", "/periods/2003-02")).data;
        assert.equal(copy.attachments.length, 0);
        assert.equal(copy.expenses.length, 0);
        assert.ok(copy.items.every((i) => i.amount === null));
      },
    );
    await t.test(
      "backup restores both owners income images and credentials",
      async () => {
        const folder = await createBackup(db, bucket);
        assert.equal((await readBackup(folder)).manifest.objects.length, 3);
        const target = loadConfig(".env.neon-restore");
        assert.equal(target.NEON_BRANCH, "financee-restore-test");
        assert.notEqual(
          new URL(target.DATABASE_URL).host,
          new URL(config.DATABASE_URL).host,
        );
        const { Database, EvidenceStorage } = await runtime(),
          dest = new Database(target.DATABASE_URL),
          storage = new EvidenceStorage(target);
        await migrate(dest);
        await dest
          .prepare(
            "TRUNCATE group_attachments,allocation_group_operations,allocation_group_items,allocation_groups,allocation_attachments,income_attachments,attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts,account_credentials",
          )
          .run();
        assert.deepEqual(await restoreBackup(dest, storage, folder), {
          tables: 14,
          objects: 3,
        });
      },
    );
    await t.test(
      "parent removal retires income evidence and revokes reads",
      async () => {
        const snapshot = (await req("a", "GET", "/periods/2003-01")).data,
          item = snapshot.items.find((i) => i.id === a);
        assert.equal(
          (
            await req("a", "DELETE", "/items/" + a, {
              expectedVersion: item.row_version,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await req(
              "b",
              "GET",
              "/income-attachments/" + first.id + "/content",
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await req(
              "a",
              "PUT",
              "/income-attachments/" + first.id + "/content",
              png,
              "image/png",
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await db
              .prepare("SELECT status FROM income_attachments WHERE id=$1")
              .bind(first.id)
              .first()
          ).status,
          "deleting",
        );
        assert.equal(
          (await req("a", "DELETE", "/income-attachments/" + first.id, {}))
            .status,
          200,
        );
      },
    );
  } finally {
    await mf.dispose();
  }
});
