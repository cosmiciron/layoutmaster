import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const engineRoot = path.join(repoRoot, "engine");
const tsupCli = path.join(repoRoot, "node_modules", "tsup", "dist", "cli-default.js");

const result = spawnSync(process.execPath, [tsupCli], {
  cwd: engineRoot,
  stdio: "inherit"
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
