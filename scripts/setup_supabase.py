#!/usr/bin/env python3
"""
Publish Supabase changes for the existing CRM project -- safe to re-run.

What it does:
  1. Resolves the project ref from SUPABASE_URL in .env (never creates a project).
  2. Optionally applies SQL migrations from supabase/migrations via the Supabase
     Management API -- only the ones you name with --migrate (e.g. --migrate 0023
     or --migrate 0023-0025). Already-applied migrations are NOT re-run blindly.
  3. Deploys the Edge Functions in supabase/functions with the Supabase CLI.

It no longer touches Render. Environment variables on Render are managed by
scripts/deploy_render.py, which only adds/updates individual keys.

Usage:
  python scripts/setup_supabase.py                    # deploy all edge functions
  python scripts/setup_supabase.py --functions resend-webhook send-demo-email
  python scripts/setup_supabase.py --migrate 0023     # apply one migration, then deploy functions
  python scripts/setup_supabase.py --dry-run

Requires SUPABASE_ACCESS_TOKEN (environment or .env), a personal access token
from https://supabase.com/dashboard/account/tokens
"""

import argparse
import os
import re
import subprocess
import sys

import requests

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

API = "https://api.supabase.com/v1"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MIGRATIONS_DIR = os.path.join(ROOT, "supabase", "migrations")
FUNCTIONS_DIR = os.path.join(ROOT, "supabase", "functions")


def load_dotenv(path):
    """Minimal .env parser that keeps '#' inside values (dotenv would truncate them)."""
    values = {}
    if not os.path.exists(path):
        return values
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[key.strip()] = value
    return values


def project_ref_from_url(url):
    m = re.match(r"https://([a-z0-9]+)\.supabase\.co", url or "")
    return m.group(1) if m else None


def list_functions():
    return sorted(
        d for d in os.listdir(FUNCTIONS_DIR)
        if not d.startswith("_") and os.path.isfile(os.path.join(FUNCTIONS_DIR, d, "index.ts"))
    )


def parse_migrate(spec):
    """'0023' -> ['0023']; '0023-0025' -> ['0023','0024','0025']."""
    if "-" in spec:
        a, b = spec.split("-", 1)
        return [f"{n:04d}" for n in range(int(a), int(b) + 1)]
    return [f"{int(spec):04d}"]


def migration_files(numbers):
    files = sorted(os.listdir(MIGRATIONS_DIR))
    out = []
    for n in numbers:
        match = [f for f in files if f.startswith(n + "_") and f.endswith(".sql")]
        if not match:
            sys.exit(f"Migration {n} not found in supabase/migrations")
        out.append(match[0])
    return out


def run_sql(token, ref, sql):
    r = requests.post(
        f"{API}/projects/{ref}/database/query",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"query": sql},
        timeout=120,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:400]}")
    return r.json() if r.text else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--functions", nargs="*", help="edge functions to deploy (default: all)")
    ap.add_argument("--no-functions", action="store_true", help="skip edge function deployment")
    ap.add_argument("--migrate", help="migration number or range to apply, e.g. 0023 or 0023-0025")
    ap.add_argument("--dry-run", action="store_true", help="show what would happen, change nothing")
    args = ap.parse_args()

    local = load_dotenv(os.path.join(ROOT, ".env"))
    token = os.environ.get("SUPABASE_ACCESS_TOKEN") or local.get("SUPABASE_ACCESS_TOKEN")
    ref = project_ref_from_url(os.environ.get("SUPABASE_URL") or local.get("SUPABASE_URL"))
    if not ref:
        sys.exit("Could not read the project ref from SUPABASE_URL in .env")
    if not token:
        sys.exit("SUPABASE_ACCESS_TOKEN is not set (environment or .env). "
                 "Create one at https://supabase.com/dashboard/account/tokens")

    print(f"[1/3] Project: {ref}")
    r = requests.get(f"{API}/projects/{ref}", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    if r.status_code != 200:
        sys.exit(f"Cannot access project {ref}: HTTP {r.status_code} {r.text[:200]}")
    print(f"  [ok] {r.json().get('name')} ({r.json().get('status')})")

    print("\n[2/3] Migrations")
    if not args.migrate:
        print("  [skip] none requested (use --migrate NNNN to apply one)")
    else:
        for name in migration_files(parse_migrate(args.migrate)):
            if args.dry_run:
                print(f"  [dry-run] would apply {name}")
                continue
            with open(os.path.join(MIGRATIONS_DIR, name), encoding="utf-8") as f:
                sql = f.read()
            # Run each migration atomically: any error rolls the whole file back.
            run_sql(token, ref, f"begin;\n{sql}\ncommit;")
            print(f"  [applied] {name}")

    print("\n[3/3] Edge functions")
    if args.no_functions:
        print("  [skip] --no-functions")
        return
    names = args.functions or list_functions()
    unknown = [n for n in names if n not in list_functions()]
    if unknown:
        sys.exit(f"Unknown edge functions: {', '.join(unknown)}")
    cmd = ["npx", "--yes", "supabase", "functions", "deploy", *names, "--project-ref", ref, "--use-api"]
    print("  " + " ".join(cmd))
    if args.dry_run:
        print("  [dry-run] not executed")
        return
    env = dict(os.environ, SUPABASE_ACCESS_TOKEN=token)
    result = subprocess.run(cmd, cwd=ROOT, env=env, shell=(os.name == "nt"))
    if result.returncode != 0:
        sys.exit(f"Edge function deploy failed (exit {result.returncode})")
    print("\nSUPABASE PUBLISH OK")


if __name__ == "__main__":
    main()
