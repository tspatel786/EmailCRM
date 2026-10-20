import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const forbidden = [
  /service_role/i,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /SMTP_PASS/,
  /zoho.*password/i,
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
];

const roots = ["apps/web/dist", "apps/web/src"];

async function walk(dir, acc = []) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) await walk(p, acc);
    else if (/\.(js|css|html|map|tsx|ts)$/.test(name)) acc.push(p);
  }
  return acc;
}

let failed = false;
for (const root of roots) {
  const files = await walk(root);
  for (const file of files) {
    if (file.includes("check-frontend-secrets")) continue;
    const text = await readFile(file, "utf8");
    for (const re of forbidden) {
      if (re.test(text) && !file.endsWith(".env.example")) {
        console.error(`Possible secret pattern ${re} in ${file}`);
        failed = true;
      }
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log("No privileged secret patterns found in scanned frontend files.");
