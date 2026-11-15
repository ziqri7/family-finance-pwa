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
const app = new Hono<AppEnv>();
app.use("/api/*", configure);
app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/login" && c.req.method === "POST") return next();
  return authenticated(c, next);
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
app.post("/api/periods", finance.createPeriod);
app.get("/api/periods/:id", finance.snapshot);
app.post("/api/periods/:id/items", finance.createItem);
app.patch("/api/items/:id", finance.editItem);
app.delete("/api/items/:id", finance.deleteItem);
app.post("/api/expenses", finance.createExpense);
app.patch("/api/expenses/:id", finance.editExpense);
app.delete("/api/expenses/:id", finance.deleteExpense);
app.post("/api/transfers", finance.createTransfer);
app.delete("/api/transfers/:id", finance.deleteTransfer);
app.post("/api/expenses/:id/attachments", files.reserve);
app.put("/api/attachments/:id/content", files.upload);
app.get("/api/attachments/:id/content", files.download);
app.delete("/api/attachments/:id", files.remove);
app.notFound((c) =>
  c.json(
    { error: { code: "NOT_FOUND", message: "Alamat tidak ditemukan." } },
    404,
  ),
);
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  if (err instanceof ZodError)
    return c.json(
      {
        error: { code: "INVALID_INPUT", message: "ID atau isian tidak valid." },
      },
      400,
    );
  const message = String(err);
  if (
    /ITEM_LIMIT|EXPENSE_LIMIT|TRANSFER_LIMIT|ATTACHMENT_LIMIT|ITEM_REFERENCED|unique constraint/i.test(
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
    /INVALID_EXPENSE_ITEM|INVALID_TRANSFER_ITEM|INVALID_ATTACHMENT_OWNER|CHECK constraint|FOREIGN KEY/i.test(
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
