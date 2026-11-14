import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
// Generate after the shell manifest so server code is never cached by the PWA.
await build({
  entryPoints: ["worker/index.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "dist/_worker.js",
  minify: true,
});
await writeFile(
  "dist/_routes.json",
  JSON.stringify({ version: 1, include: ["/*"], exclude: [] }, null, 2) + "\n",
);
console.log(
  "Pages advanced-mode backend built; every route retains security headers.",
);
