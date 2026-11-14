import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv, AuthUser } from "./types";
import { fail, json } from "./http";
const enc = new TextEncoder();
export const hex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
const unhex = (s: string) =>
  Uint8Array.from(s.match(/../g) || [], (x) => parseInt(x, 16));
export const hash = async (s: string | Uint8Array) =>
  hex(
    await crypto.subtle.digest(
      "SHA-256",
      typeof s === "string" ? enc.encode(s) : (s as Uint8Array<ArrayBuffer>),
    ),
  );
export async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}
export async function passwordHash(
  password: string,
  salt: string,
  iterations = 100000,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations },
      key,
      256,
    ),
  );
}
export function equal(a: string, b: string) {
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}
const configSchema = z
  .array(
    z
      .object({
        id: z.enum(["partner-a", "partner-b"]),
        name: z.string().min(1).max(80),
        email: z.string().email().max(254),
        salt: z.string().regex(/^[a-f0-9]{32}$/),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        iterations: z.literal(100000),
      })
      .strict(),
  )
  .length(2);
export function local(c: Context<AppEnv>) {
  return (
    c.env.LOCAL_DEV === "1" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(c.req.url).hostname) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(c.env.APP_ORIGIN).hostname,
    )
  );
}
const cookieName = (c: Context<AppEnv>) =>
  local(c) ? "ff_local_session" : "__Host-ff_session";
export const configure: MiddlewareHandler<AppEnv> = async (c, next) => {
  let users: AuthUser[];
  try {
    users = configSchema.parse(JSON.parse(c.env.AUTH_USERS_JSON));
    if (
      new Set(users.map((u) => u.id)).size !== 2 ||
      new Set(users.map((u) => u.email.toLowerCase())).size !== 2 ||
      c.env.SESSION_SECRET.length < 32
    )
      throw Error();
    new URL(c.env.APP_ORIGIN);
  } catch {
    fail(503, "NOT_CONFIGURED", "Akun belum disiapkan oleh pemilik aplikasi.");
  }
  if (!local(c) && new URL(c.env.APP_ORIGIN).protocol !== "https:")
    fail(
      503,
      "HTTPS_REQUIRED",
      "Konfigurasi alamat aplikasi memerlukan HTTPS.",
    );
  c.set("users", users);
  c.set("fingerprint", await hmac(c.env.SESSION_SECRET, c.env.AUTH_USERS_JSON));
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    c.req.header("Origin") !== c.env.APP_ORIGIN
  )
    fail(403, "ORIGIN_DENIED", "Alamat permintaan tidak diizinkan.");
  await next();
};
export const authenticated: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, cookieName(c));
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    fail(401, "LOGIN_REQUIRED", "Silakan masuk untuk melanjutkan.");
  const tokenHash = await hash(token),
    session = await c.env.DB.prepare(
      "SELECT * FROM sessions WHERE token_hash=$1 AND expires_at>$2 AND auth_fingerprint=$3",
    )
      .bind(tokenHash, Date.now(), c.get("fingerprint"))
      .first<{ account_id: string }>();
  const user = c.get("users").find((u) => u.id === session?.account_id);
  if (!user)
    fail(
      401,
      "SESSION_EXPIRED",
      "Sesi Anda sudah berakhir. Silakan masuk kembali.",
    );
  c.set("user", { id: user.id, name: user.name });
  c.set("tokenHash", tokenHash);
  await next();
};
export async function login(c: Context<AppEnv>) {
  const input = await json(
    c,
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(254),
        password: z.string().min(1).max(256),
      })
      .strict(),
  );
  const now = Date.now(),
    windowStart = Math.floor(now / 900000) * 900000,
    ip = c.req.header("CF-Connecting-IP") || "local",
    secret = c.env.SESSION_SECRET;
  const keys = [
    await hmac(secret, "ip:" + ip + ":" + windowStart),
    await hmac(secret, "login:" + ip + ":" + input.email + ":" + windowStart),
  ];
  const attempts = await c.env.DB.batch<{ attempts: number }>(
    keys.map((key) =>
      c.env.DB.prepare(
        "INSERT INTO login_attempts(key,attempts,window_start,blocked_until) VALUES($1,1,$2,$3) ON CONFLICT(key) DO UPDATE SET attempts=login_attempts.attempts+1 RETURNING attempts",
      ).bind(key, windowStart, windowStart + 900000),
    ),
  );
  if (
    Number(attempts[0].results[0]?.attempts) > 30 ||
    Number(attempts[1].results[0]?.attempts) > 5
  )
    fail(
      429,
      "LOGIN_LIMIT",
      "Terlalu banyak percobaan. Coba kembali setelah 15 menit.",
    );
  const user = c
      .get("users")
      .find((u) => u.email.toLowerCase() === input.email),
    dummy = c.get("users")[0];
  const calculated = await passwordHash(
    input.password,
    (user || dummy).salt,
    (user || dummy).iterations,
  );
  if (!equal(calculated, (user || dummy).hash) || !user)
    fail(401, "INVALID_LOGIN", "Identitas atau sandi tidak sesuai.");
  const token = hex(crypto.getRandomValues(new Uint8Array(32))),
    tokenHash = await hash(token);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO sessions VALUES($1,$2,$3,$4,$5)").bind(
      tokenHash,
      user.id,
      c.get("fingerprint"),
      now,
      now + 604800000,
    ),
    c.env.DB.prepare(
      "DELETE FROM login_attempts WHERE key=$1 OR key IN (SELECT key FROM login_attempts WHERE blocked_until<$2 LIMIT 100)",
    ).bind(keys[1], now),
    c.env.DB.prepare(
      "DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at<$1 LIMIT 100)",
    ).bind(now),
  ]);
  setCookie(c, cookieName(c), token, {
    httpOnly: true,
    secure: !local(c),
    sameSite: "Strict",
    path: "/",
    maxAge: 604800,
  });
  return c.json({ user: { id: user.id, name: user.name } });
}
export async function logout(c: Context<AppEnv>) {
  await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=$1")
    .bind(c.get("tokenHash"))
    .run();
  deleteCookie(c, cookieName(c), {
    path: "/",
    secure: !local(c),
    httpOnly: true,
    sameSite: "Strict",
  });
  return c.json({ ok: true });
}
