import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { AppEnv, Bindings } from "./types";
import { configure, authenticated, login, logout } from "./auth";
import * as finance from "./finance";
import * as files from "./attachments";
import { Database } from "./db/postgres";
import { EvidenceStorage } from "./storage";
import { changePassword } from "./passwords";
import { yearReport } from "./reports";
import * as postings from "./postings";
import * as groups from "./groups";
import * as family from "./family";
const app = new Hono<AppEnv>();
app.use("/api/*", configure);
app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/login" && c.req.method === "POST") return next();
  return authenticated(c, next);
});
app.use("/api/*", async (c, next) => {
  if (
    (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) ||
      /^\/api\/(periods|reports)(\/|$)/.test(c.req.path)) &&
    !["/api/login", "/api/logout", "/api/account/password"].includes(
      c.req.path,
    ) &&
    c.req.header("X-Financee-Client") !== "3"
  )
    return c.json(
      {
        error: {
          code: "UPDATE_REQUIRED",
          message:
            "Perbarui aplikasi sebelum melanjutkan pencatatan. Isian Anda belum tersimpan.",
        },
      },
      409,
    );
  await next();
});
app.post("/api/login", login);
app.post("/api/logout", logout);
app.post("/api/account/password", changePassword);
app.get("/api/me", (c) =>
  c.json({
    user: c.get("user"),
    people: c.get("users").map((u) => ({ id: u.id, name: u.name })),
  }),
);
app.get("/api/periods", finance.listPeriods);
app.get("/api/reports/year/:year", yearReport);
app.post("/api/periods", family.createPeriod);
app.get("/api/periods/:id", family.snapshot);
app.post("/api/periods/:id/review", family.reviewItems);
app.post("/api/legacy-extras/:id/convert", family.convertExtra);
app.post("/api/periods/:id/evidence-bundles", family.saveBundle);
app.delete("/api/evidence-bundles/:id", family.deleteBundle);
app.post("/api/usages", family.createUsage);
app.patch("/api/usages/:id", family.editUsage);
app.delete("/api/usages/:id", family.deleteUsage);
app.patch("/api/items/:id/tracking", family.tracking);
const retired = (c: import("hono").Context<AppEnv>) =>
  c.json(
    {
      error: {
        code: "FLOW_REPLACED",
        message: "Gunakan buku keluarga. Bukti bersama tidak mengubah uang.",
      },
    },
    410,
  );
app.post("/api/periods/:id/allocation-groups", retired);
app.get("/api/allocation-groups/:id", groups.review);
app.patch("/api/allocation-groups/:id", retired);
app.delete("/api/allocation-groups/:id", retired);
app.post("/api/allocation-groups/:id/commit", retired);
app.post("/api/allocation-groups/:id/cancel", retired);
app.post("/api/allocation-groups/:id/attachments", files.reserve);
app.put("/api/group-attachments/:id/content", files.upload);
app.get("/api/group-attachments/:id/content", files.download);
app.delete("/api/group-attachments/:id", files.remove);
app.post("/api/periods/:id/items", family.createItem);
app.get("/api/items/:id/posting", postings.review);
app.patch("/api/items/:id/posting", retired);
app.patch("/api/items/:id", family.editItem);
app.delete("/api/items/:id", family.deleteItem);
app.post("/api/expenses", retired);
app.patch("/api/expenses/:id", retired);
app.delete("/api/expenses/:id", finance.deleteExpense);
app.post("/api/transfers", retired);
app.delete("/api/transfers/:id", finance.deleteTransfer);
app.post("/api/allocation-items/:id/attachments", files.reserve);
app.put("/api/allocation-attachments/:id/content", files.upload);
app.get("/api/allocation-attachments/:id/content", files.download);
app.delete("/api/allocation-attachments/:id", files.remove);
app.post("/api/income-items/:id/attachments", files.reserve);
app.put("/api/income-attachments/:id/content", files.upload);
app.get("/api/income-attachments/:id/content", files.download);
app.delete("/api/income-attachments/:id", files.remove);
app.post("/api/expenses/:id/attachments", files.reserve);
app.put("/api/attachments/:id/content", files.upload);
app.get("/api/attachments/:id/content", files.download);
app.delete("/api/attachments/:id", files.remove);
app.post("/api/usages/:id/attachments", files.reserve);
app.put("/api/usage-attachments/:id/content", files.upload);
app.get("/api/usage-attachments/:id/content", files.download);
app.delete("/api/usage-attachments/:id", files.remove);
app.notFound((c) =>
  c.json(
    { error: { code: "NOT_FOUND", message: "Alamat tidak ditemukan." } },
    404,
  ),
);
app.onError(async (err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  if (err instanceof ZodError)
    return c.json(
      {
        error: { code: "INVALID_INPUT", message: "ID atau isian tidak valid." },
      },
      400,
    );
  const message = String(err);
  if (/FAMILY_NOT_FOUND/.test(message))
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Catatan tidak ditemukan atau bukan buatan Anda.",
        },
      },
      404,
    );
  const familyError = [
    [
      "FUNDS_EXCEEDED",
      "Dana belum cukup. Kurangi alokasi lain atau tambah pemasukan dahulu.",
    ],
    ["ALLOWANCE_EXCEEDED", "Melebihi jatah pos. Tambah alokasi dahulu."],
    [
      "TRACKING_DISABLED",
      "Aktifkan rincian pemakaian pada pos yang sudah diisi.",
    ],
    [
      "LEGACY_REVIEW_REQUIRED",
      "Tinjau catatan lama sebelum mengubah nominalnya.",
    ],
    [
      "EVIDENCE_CONFIRM_REQUIRED",
      "Pos ini memiliki bukti. Konfirmasikan pengosongan nominal.",
    ],
    [
      "FAMILY_CHANGED",
      "Catatan berubah. Muat data terbaru lalu periksa kembali.",
    ],
  ].find(([code]) => message.includes(code));
  if (familyError) {
    const current =
      familyError[0] === "FAMILY_CHANGED" &&
      /^\/api\/items\/[a-f0-9]{32}$/.test(c.req.path)
        ? await c.env.DB.prepare(
            "SELECT * FROM budget_items WHERE id=$1 AND owner_id=$2",
          )
            .bind(c.req.param("id"), c.get("user").id)
            .first()
        : undefined;
    return c.json(
      {
        error: {
          code: current ? "FIELD_CONFLICT" : familyError[0],
          message: familyError[1],
        },
        ...(current ? { current } : {}),
      },
      409,
    );
  }
  if (/GROUP_NOT_FOUND/.test(message))
    return c.json(
      { error: { code: "NOT_FOUND", message: "Penyerahan tidak ditemukan." } },
      404,
    );
  if (
    /GROUP_CHANGED|GROUP_LOCKED|GROUP_OPERATION_CONFLICT|GROUP_EVIDENCE_REVIEW|GROUP_LIMIT/.test(
      message,
    )
  )
    return c.json(
      {
        error: {
          code: "GROUP_CHANGED",
          message:
            "Data berubah atau pos tergabung. Buka penyerahan dan periksa nominal terbaru.",
        },
      },
      409,
    );
  if (/INVALID_GROUP/.test(message))
    return c.json(
      {
        error: {
          code: "INVALID_GROUP",
          message: "Periksa anggota, nominal dan tanggal penyerahan.",
        },
      },
      400,
    );
  if (
    /HISTORY_LOCKED|ITEM_LIMIT|EXPENSE_LIMIT|TRANSFER_LIMIT|USAGE_LIMIT|ATTACHMENT_LIMIT|ATTACHMENT_ID_CONFLICT|ITEM_REFERENCED|unique constraint/i.test(
      message,
    )
  )
    return c.json(
      {
        error: {
          code: "LIMIT_OR_CONFLICT",
          message: /ITEM_REFERENCED/.test(message)
            ? "Pos sudah digunakan oleh pengeluaran atau kiriman."
            : "Batas catatan tercapai atau data sudah ada. Muat data terbaru.",
        },
      },
      409,
    );
  if (
    /INVALID_USAGE_ITEM|INVALID_CONVERSION_TARGET|INVALID_FAMILY_ACTION|INVALID_EXPENSE_ITEM|INVALID_TRANSFER_ITEM|INVALID_ATTACHMENT_OWNER|CHECK constraint|FOREIGN KEY/i.test(
      message,
    )
  )
    return c.json(
      {
        error: {
          code: "INVALID_RELATION",
          message: "Pos atau hubungan catatan tidak valid.",
        },
      },
      400,
    );
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Belum berhasil. Silakan coba lagi.",
        requestId: crypto.randomUUID(),
      },
    },
    500,
  );
});
export { app };
export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const url = new URL(request.url);
    let response: Response;
    try {
      response =
        ["/_worker.js", "/_routes.json"].includes(url.pathname) ||
        url.pathname.startsWith("/.vite/")
          ? new Response("Not found", { status: 404 })
          : url.pathname.startsWith("/api/")
            ? await app.fetch(
                request,
                {
                  ...env,
                  DB: new Database(env.DATABASE_URL),
                  EVIDENCE: new EvidenceStorage(env),
                },
                ctx,
              )
            : await env.ASSETS.fetch(request);
    } catch {
      response = Response.json(
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Layanan belum dapat dihubungi. Silakan coba lagi.",
          },
        },
        { status: 503 },
      );
    }
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    headers.set("X-Frame-Options", "DENY");
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname === "/sw.js" ||
      response.headers.get("content-type")?.includes("text/html")
    )
      headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
