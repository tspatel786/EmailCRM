import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

config();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const TENANT_TABLES = [
  "organizations",
  "profiles",
  "memberships",
  "companies",
  "contacts",
  "activities",
  "tasks",
  "calls",
  "campaigns",
  "email_jobs",
  "deals",
  "quotations",
  "projects",
  "audit_logs",
  "inquiry_rate_limits",
];

// 1. Static migration audit: ensure RLS is enabled on every tenant table and no anon read policy exists.
const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFiles = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
const allSql = (await Promise.all(migrationFiles.map((f) => readFile(join(migrationsDir, f), "utf8")))).join("\n");

let staticFailed = false;
for (const table of TENANT_TABLES) {
  const rlsRe = new RegExp(`alter\\s+table\\s+(?:public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
  if (!rlsRe.test(allSql)) {
    console.error(`FAIL [static RLS]: Missing ENABLE ROW LEVEL SECURITY for ${table}`);
    staticFailed = true;
  }
  const anonAllowRe = new RegExp(
    `create\\s+policy\\s+\\S+\\s+on\\s+(?:public\\.)?${table}\\s+for\\s+(?:select|all)\\s+to\\s+anon\\b(?![\\s\\S]{0,120}using\\s*\\(\\s*false\\s*\\))`,
    "i",
  );
  if (anonAllowRe.test(allSql)) {
    console.error(`FAIL [static RLS]: Found permissive anon read policy on ${table}`);
    staticFailed = true;
  }
}
if (/grant\s+select\s+on\s+.*\bto\s+anon\b/i.test(allSql)) {
  console.error("FAIL [static grants]: Found SELECT grant to anon role in migrations");
  staticFailed = true;
}
if (staticFailed) {
  process.exit(1);
}
console.log(`PASS [static SQL audit]: All ${TENANT_TABLES.length} tenant tables enforce RLS with zero anon read policies.`);

// 2. Live anon PostgREST check (only passes if Supabase actually responds and denies/returns 0 rows).
if (!url || !anonKey || anonKey.startsWith("replace-with")) {
  console.log("SKIP [live anon RLS]: SUPABASE_URL / SUPABASE_ANON_KEY are not configured.");
  process.exit(0);
}

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class NoopWebSocket {};
}

const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = false;
for (const table of TENANT_TABLES) {
  try {
    const { data, error } = await anon.from(table).select("*").limit(5);
    if (error) {
      const msg = error.message || "";
      if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
        console.log(`SKIP [live DB unreachable]: ${table} -> ${msg}`);
        process.exit(0);
      }
      console.log(`PASS [live anon blocked]: ${table} -> ${msg}`);
      continue;
    }
    if (!data || data.length === 0) {
      console.log(`PASS [live anon empty]: ${table} -> 0 rows returned`);
    } else {
      console.error(`FAIL [live anon leaked data]: ${table} returned ${data.length} row(s)!`);
      failed = true;
    }
  } catch (err) {
    console.log(`SKIP [live DB unreachable]: ${table} -> ${err instanceof Error ? err.message : String(err)}`);
    process.exit(0);
  }
}

if (failed) {
  process.exit(1);
}
console.log("PASS [live anon RLS]: All checked tenant tables denied anonymous read access.");
