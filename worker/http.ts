import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { ZodType } from "zod";
import type { AppEnv } from "./types";
export function fail(
  status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 503,
  code: string,
  message: string,
): never {
  throw new HTTPException(status, {
    res: Response.json({ error: { code, message } }, { status }),
  });
}
export async function bytes(request: Request, max: number) {
  if (Number(request.headers.get("content-length") || 0) > max)
    fail(413, "BODY_TOO_LARGE", "Berkas atau isian terlalu besar.");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) {
      await reader.cancel();
      fail(413, "BODY_TOO_LARGE", "Berkas atau isian terlalu besar.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function json<T>(
  c: Context<AppEnv>,
  schema: ZodType<T>,
): Promise<T> {
  if (c.req.header("content-type")?.split(";")[0].trim() !== "application/json")
    fail(415, "JSON_REQUIRED", "Gunakan isian JSON.");
  let input: unknown;
  try {
    input = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await bytes(c.req.raw, 16 * 1024),
      ),
    );
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    fail(400, "INVALID_JSON", "Isian tidak dapat dibaca.");
  }
  const result = schema.safeParse(input);
  if (!result.success)
    fail(
      400,
      "INVALID_INPUT",
      result.error.issues[0]?.message || "Periksa isian Anda.",
    );
  return result.data;
}
