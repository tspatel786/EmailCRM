import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const forbidden = [
  /service_role/i,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /SMTP_PASS/,
  /zoho.*password/i,
];

// Supabase anon keys are JWTs and are expected to ship in the frontend bundle;
// only flag a JWT if it decodes to a non-anon role (e.g. service_role).
const jwtPattern = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function findPrivilegedJwts(text) {
  const hits = [];
  for (const match of text.matchAll(jwtPattern)) {
    const payload = match[0].split(".")[1];
    try {
      const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
      const decoded = JSON.parse(Buffer.from(padded, "base64url").toString("utf8"));
      if (decoded.role && decoded.role !== "anon") {
        hits.push(decoded.role);
      }
    } catch {
      // Not a decodable JWT payload; ignore rather than false-flag.
    }
  }
  return hits;
}

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
    if (file.endsWith(".env.example")) continue;
    for (const re of forbidden) {
      if (re.test(text)) {
        console.error(`Possible secret pattern ${re} in ${file}`);
        failed = true;
      }
    }
    for (const role of findPrivilegedJwts(text)) {
      console.error(`Privileged JWT (role=${role}) embedded in ${file}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log("No privileged secret patterns found in scanned frontend files.");
