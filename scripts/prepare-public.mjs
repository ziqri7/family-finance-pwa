// Prepares a local review copy only. Never creates a repository or uploads files.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { publicFiles } from "./public-files.mjs";

const check = spawnSync(process.execPath, ["scripts/check-public.mjs"], {
  stdio: "inherit",
});
if (check.status !== 0)
  throw Error("Pemeriksaan berkas belum lulus; paket tidak dibuat.");
const folder = resolve(
  "private",
  "release-" +
    new Date().toISOString().replace(/[:.]/g, "-") +
    "-" +
    randomBytes(3).toString("hex"),
);
const destination = resolve(folder, "family-finance-pwa");
const manifest = [];
for (const path of await publicFiles()) {
  const content = await readFile(path);
  const target = resolve(destination, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, { flag: "wx" });
  const copied = await readFile(target);
  const sha256 = createHash("sha256").update(content).digest("hex");
  if (createHash("sha256").update(copied).digest("hex") !== sha256)
    throw Error("Salinan berbeda: " + path);
  manifest.push({ path, bytes: content.length, sha256 });
}
await writeFile(
  resolve(folder, "manifest.json"),
  JSON.stringify(
    { version: 1, sourceFiles: manifest.length, files: manifest },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log("Paket sumber lokal siap:", destination);
console.log("Manifest SHA-256:", resolve(folder, "manifest.json"));
console.log("Belum ada publikasi GitHub atau deployment.");
