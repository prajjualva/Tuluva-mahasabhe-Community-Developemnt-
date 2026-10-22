import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import console from "node:console";

const root = process.cwd();
const stage = path.join(root, ".stakeholder-export");
const templates = path.join(root, "scripts/demo-export-templates");
// An allowlist, never a copy of the live repository. No .env, Prisma, API, or server files.
const copies = [
  [path.join(templates, "package.json"), "package.json"],
  [path.join(templates, "tsconfig.json"), "tsconfig.json"],
  [path.join(templates, "next.config.mjs"), "next.config.mjs"],
  [path.join(templates, "layout.tsx"), "src/app/layout.tsx"],
  [path.join(templates, "home.tsx"), "src/app/page.tsx"],
  [path.join(templates, "demo-page.tsx"), "src/app/demo/page.tsx"],
  [path.join(root, "src/app/demo/stakeholder-demo.tsx"), "src/app/demo/stakeholder-demo.tsx"],
  [path.join(root, "src/demo/stakeholder-state.ts"), "src/demo/stakeholder-state.ts"],
  [path.join(root, "src/app/globals.css"), "src/app/globals.css"],
  ...["fictional-member.png", "fictional-member-woman.png", "fictional-member-suresh.png"].map(
    (file) => [path.join(root, "public/demo", file), `public/demo/${file}`],
  ),
];
for (const [source, relative] of copies) {
  const target = path.join(stage, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target);
}
// Build with only the existing runtime's minimal process environment. Never inherit
// the main application's DATABASE_URL, AUTH_SECRET, payment keys or bank keys.
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|LOCALAPPDATA|APPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i.test(
      key,
    ),
  ),
);
const build = spawnSync(
  process.execPath,
  [path.join(root, "node_modules/next/dist/bin/next"), "build", stage],
  {
    cwd: stage,
    stdio: "inherit",
    env: { ...environment, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
  },
);
if (build.status !== 0) process.exit(build.status ?? 1);
const output = path.join(stage, "out");
cpSync(path.join(templates, "vercel.json"), path.join(output, "vercel.json"));
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(target);
    else {
      if (/^\.env|prisma|^route\.(ts|js)$|\.map$/i.test(entry.name))
        throw new Error("Unexpected private or server file in demo export");
      if (
        /\.(js|json|html|txt|css)$/.test(entry.name) &&
        /postgres(?:ql)?:\/\/|npg_[A-Za-z0-9]+|rzp_live_|BEGIN (?:RSA )?PRIVATE KEY/.test(
          readFileSync(target, "utf8"),
        )
      )
        throw new Error("Sensitive material detected; deployment refused");
    }
  }
}
inspect(output);
if (!existsSync(path.join(output, "index.html"))) throw new Error("Missing static entry point");
console.info(`Shareable static demo prepared: ${output}`);
console.info(
  "Only upload this out directory. It contains no database, API routes, credentials or real records.",
);
