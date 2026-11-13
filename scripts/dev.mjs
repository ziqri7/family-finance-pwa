import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
if (!existsSync(".dev.vars"))
  throw Error("Jalankan npm run setup:local terlebih dahulu.");
const children = [
  spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      "8787",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  ),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
  }),
];
const stop = () => {
  for (const child of children) child.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children)
  child.on("exit", (code) => {
    stop();
    process.exitCode = code || 0;
  });
