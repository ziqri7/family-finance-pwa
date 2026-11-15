import type { Context } from "hono";
import type { AppEnv } from "./types";
import { hash, passwordHash, equal } from "./auth";
import { fail, json } from "./http";
import { z } from "zod";
type C = Context<AppEnv>;
export interface Credential {
  account_id: string;
  scheme: string;
  hash: string;
  salt: string | null;
  iterations: number | null;
  pepper_id: string | null;
  version: number;
}
export async function credential(c: C, id: string) {
  const row = await c.env.DB.prepare(
    "SELECT * FROM account_credentials WHERE account_id=$1",
  )
    .bind(id)
    .first<Credential>();
  if (!row)
    fail(
      503,
      "ACCOUNT_NOT_INITIALIZED",
      "Akun belum disiapkan oleh pemilik aplikasi.",
    );
  return row;
}
async function pepper(c: C) {
  if (!/^[a-f0-9]{64}$/.test(c.env.PASSWORD_PEPPER || ""))
    fail(
      503,
      "PASSWORD_NOT_CONFIGURED",
      "Pengaturan sandi belum siap. Hubungi pemilik aplikasi.",
    );
  return c.env.PASSWORD_PEPPER;
}
async function prehash(c: C, password: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(await pepper(c)),
    { name: "HMAC", hash: "SHA-384" },
    false,
    ["sign"],
  );
  return btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(password),
        ),
      ),
    ),
  );
}
export async function verifyPassword(c: C, row: Credential, password: string) {
  if (row.scheme === "legacy_pbkdf2")
    return equal(
      await passwordHash(password, row.salt!, row.iterations!),
      row.hash,
    );
  if (
    row.scheme !== "bcrypt_hmac_sha384" ||
    row.pepper_id !== (await hash(await pepper(c)))
  )
    fail(
      503,
      "PASSWORD_KEY_MISMATCH",
      "Kunci sandi tidak sesuai. Hubungi pemilik aplikasi.",
    );
  return Boolean(
    (
      await c.env.DB.prepare("SELECT public.crypt($1,$2)=$2 AS valid")
        .bind(await prehash(c, password), row.hash)
        .first<{ valid: boolean }>()
    )?.valid,
  );
}
export async function consumeAttempt(
  c: C,
  purpose: string,
  id: string,
  limit: number,
) {
  const { hmac } = await import("./auth");
  const now = Date.now(),
    windowStart = Math.floor(now / 900000) * 900000,
    key = await hmac(
      c.env.SESSION_SECRET,
      purpose + ":" + id + ":" + windowStart,
    );
  const row = await c.env.DB.prepare(
    "INSERT INTO login_attempts(key,attempts,window_start,blocked_until) VALUES($1,1,$2,$3) ON CONFLICT(key) DO UPDATE SET attempts=login_attempts.attempts+1 RETURNING attempts",
  )
    .bind(key, windowStart, windowStart + 900000)
    .first<{ attempts: number }>();
  if (!row || row.attempts > limit)
    fail(
      429,
      "PASSWORD_LIMIT",
      "Terlalu banyak percobaan. Coba kembali setelah 15 menit.",
    );
}
const common = new Set([
  "passwordpassword",
  "123456789012345",
  "1234567890123456",
  "qwertyuiopasdfgh",
  "password123456789",
  "abcdefghijklmnop",
  "111111111111111",
  "000000000000000",
]);
export async function changePassword(c: C) {
  const input = await json(
    c,
    z
      .object({
        currentPassword: z.string().min(1).max(256),
        newPassword: z.string().min(15).max(256),
        confirmPassword: z.string().max(256),
      })
      .strict(),
  );
  const chars = Array.from(input.newPassword);
  if (
    chars.length < 15 ||
    chars.length > 128 ||
    new TextEncoder().encode(input.newPassword).length > 512 ||
    input.newPassword !== input.confirmPassword ||
    input.newPassword === input.currentPassword ||
    common.has(input.newPassword.toLowerCase())
  )
    fail(
      400,
      "INVALID_NEW_PASSWORD",
      "Gunakan sandi baru 15–128 karakter yang tidak mudah ditebak, berbeda dari sandi lama, dan konfirmasi yang sama.",
    );
  const id = c.get("user").id;
  await consumeAttempt(c, "password-change", id, 5);
  const row = await credential(c, id);
  if (!(await verifyPassword(c, row, input.currentPassword)))
    fail(
      400,
      "WRONG_PASSWORD",
      "Sandi saat ini tidak sesuai. Periksa lalu coba lagi.",
    );
  const next = await c.env.DB.prepare(
    "SELECT public.crypt($1,public.gen_salt('bf',12)) AS hash",
  )
    .bind(await prehash(c, input.newPassword))
    .first<{ hash: string }>();
  if (!next?.hash)
    fail(503, "HASH_FAILED", "Sandi belum dapat disimpan. Silakan coba lagi.");
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE account_credentials SET scheme='bcrypt_hmac_sha384',hash=$1,salt=NULL,iterations=NULL,pepper_id=$2,version=version+1,updated_at=$3 WHERE account_id=$4 AND version=$5 AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=$6 AND account_id=$4 AND expires_at>$3) RETURNING version",
    ).bind(
      next.hash,
      await hash(await pepper(c)),
      Date.now(),
      id,
      row.version,
      c.get("tokenHash"),
    ),
    c.env.DB.prepare(
      "DELETE FROM sessions WHERE account_id=$1 AND EXISTS(SELECT 1 FROM account_credentials WHERE account_id=$1 AND version=$2 AND hash=$3)",
    ).bind(id, row.version + 1, next.hash),
  ]);
  if (!result[0].meta.changes)
    fail(
      409,
      "PASSWORD_CONFLICT",
      "Sandi atau sesi berubah. Silakan masuk kembali.",
    );
  const { clearSessionCookie } = await import("./auth");
  clearSessionCookie(c);
  return c.json({ ok: true, loginRequired: true });
}
