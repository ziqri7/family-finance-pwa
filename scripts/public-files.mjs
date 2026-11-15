import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

// One explicit allowlist shared by inspection and source packaging.
export async function publicFiles() {
  const files = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = path + "/" + entry.name;
      if (/\.private\./.test(name)) continue;
      if (entry.isSymbolicLink())
        throw Error("Symlink tidak boleh masuk paket: " + name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files.push(name);
    }
  }
  for (const root of [
    "src",
    "shared",
    "worker",
    "migrations",
    "scripts",
    "data",
    "public",
    "tests",
    "docs",
  ])
    if (existsSync(root)) await walk(root);
  for (const file of [
    "README.md",
    "LICENSE",
    "PRODUCT.md",
    "DESIGN.md",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "tsconfig.json",
    "wrangler.jsonc",
    "index.html",
    ".env.example",
    ".gitignore",
    ".gitattributes",
  ])
    if (existsSync(file)) files.push(file);
  return files.sort();
}
