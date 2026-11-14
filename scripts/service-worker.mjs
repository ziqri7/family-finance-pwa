import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { serviceWorkerSource } from "./service-worker-source.mjs";
async function walk(dir) {
  const paths = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + entry.name;
    if (entry.isDirectory()) paths.push(...(await walk(path)));
    else if (
      /\.(js|css|woff2|png|svg|html|webmanifest)$/.test(path) &&
      !path.endsWith("/sw.js") &&
      !path.endsWith("/_worker.js")
    )
      paths.push(path);
  }
  return paths;
}
const paths = (await walk("dist")).sort(),
  version = createHash("sha256");
for (const path of paths) version.update(path).update(await readFile(path));
const name = "ff-shell-" + version.digest("hex").slice(0, 16),
  urls = paths.map((p) => p.slice(4));
await writeFile("dist/sw.js", serviceWorkerSource(name, urls));
console.log(
  "Service worker dibuat: hanya aset antarmuka, tanpa API atau bukti.",
);
