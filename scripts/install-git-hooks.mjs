import { execSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(path.join(root, ".git"))) process.exit(0);

const hook = path.join(root, ".githooks", "pre-push");
try {
  chmodSync(hook, 0o755);
} catch {
  // Windows may ignore mode; Git still runs the hook.
}

execSync("git config core.hooksPath .githooks", { cwd: root, stdio: "ignore" });
