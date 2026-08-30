import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

if (!existsSync(path.join(root, "package.json"))) {
  console.error("[data-safety] package.json not found; refuse push.");
  process.exit(1);
}

console.error("[data-safety] git push gate: pnpm test:data-safety");
const result = spawnSync("pnpm", ["test:data-safety"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

const code = result.status ?? 1;
if (code !== 0) {
  console.error("[data-safety] gate failed; push aborted.");
}
process.exit(code);
