import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
// Next regenerates this declaration for its output directory. Restore the
// development reference so a verification build does not retarget the open demo.
const declaration = path.resolve("next-env.d.ts");
const priorDeclaration = existsSync(declaration) ? readFileSync(declaration) : null;
let result;
try {
  result = spawnSync(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "build"], {
    stdio: "inherit",
    env: { ...process.env, NEXT_BUILD_DIRECTORY: ".next-validation" },
  });
} finally {
  if (priorDeclaration) writeFileSync(declaration, priorDeclaration);
}
process.exit(result.status ?? 1);
