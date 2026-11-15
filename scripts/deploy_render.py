#!/usr/bin/env python3
"""
Deploy the CRM to Render via the Render REST API -- safe to re-run against an
existing deployment.

What it does:
  1. Finds the existing `crm-web` and `crm-worker` services by name (creates a
     service only if it does not exist yet -- never duplicates).
  2. Syncs required environment variables from the local .env, one key at a time.
     Existing keys are left untouched unless --overwrite is passed; nothing is
     ever deleted.
  3. Triggers a deploy of the latest `main` commit for each service, waits for it
     to go live, and checks the worker /healthz endpoint.

Usage:
  python scripts/deploy_render.py              # sync missing env vars + deploy
  python scripts/deploy_render.py --dry-run    # show what would change, do nothing
  python scripts/deploy_render.py --overwrite  # also update keys that differ
  python scripts/deploy_render.py --only worker

The Render API key is read from RENDER_API_KEY (environment or .env).
Get one at https://dashboard.render.com/u/settings#api-keys
"""

import argparse
import os
import sys
import time

import requests

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

API = "https://api.render.com/v1"
REPO_URL = "https://github.com/tspatel786/EmailCRM"
BRANCH = "main"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Keys each service needs, read from the local .env. Values are never printed.
WEB_ENV_KEYS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]
WORKER_ENV_KEYS = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "SMTP_FROM_NAME",
    "SMTP_FROM_EMAIL",
]
# Fixed production values (never taken from the local .env, which is a dev config
# -- e.g. its APP_PUBLIC_URL points at localhost).
WORKER_FIXED_ENV = {
    "NODE_ENV": "production",
    "SMTP_MOCK": "false",
    "APP_PUBLIC_URL": "https://sales.smpatelithub.in",
}

SERVICES = {
    "web": {
        "name": "crm-web",
        "env_keys": WEB_ENV_KEYS,
        "fixed_env": {},
        "create": {
            "type": "static_site",
            "serviceDetails": {
                "buildCommand": "npm run build -w @crm/shared && npm run build -w @crm/web",
                "publishPath": "apps/web/dist",
                "pullRequestPreviewsEnabled": "no",
                "routes": [{"type": "rewrite", "source": "/*", "destination": "/index.html"}],
            },
        },
    },
    "worker": {
        "name": "crm-worker",
        "env_keys": WORKER_ENV_KEYS,
        "fixed_env": WORKER_FIXED_ENV,
        "create": {
            "type": "web_service",
            "serviceDetails": {
                "env": "node",
                "plan": "free",
                "healthCheckPath": "/healthz",
                "pullRequestPreviewsEnabled": "no",
                "envSpecificDetails": {
                    "buildCommand": "npm install && npm run build -w @crm/shared && npm run build -w @crm/worker",
                    "startCommand": "npm run start -w @crm/worker",
                },
            },
        },
    },
}


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


class Render:
    def __init__(self, api_key):
        self.s = requests.Session()
        self.s.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        })

    def call(self, method, path, **kw):
        r = self.s.request(method, f"{API}{path}", timeout=60, **kw)
        if r.status_code >= 400:
            raise RuntimeError(f"Render {method} {path} -> HTTP {r.status_code}: {r.text[:300]}")
        return r.json() if r.text else {}

    def owner_id(self):
        owners = self.call("GET", "/owners")
        if not owners:
            raise RuntimeError("No Render owners found for this API key")
        o = owners[0].get("owner", owners[0])
        return o["id"]

    def find_service(self, name):
        for item in self.call("GET", "/services", params={"name": name, "limit": 20}):
            svc = item.get("service", item)
            if svc.get("name") == name:
                return svc
        return None

    def env_vars(self, service_id):
        out = {}
        for item in self.call("GET", f"/services/{service_id}/env-vars", params={"limit": 100}):
            ev = item.get("envVar", item)
            out[ev["key"]] = ev.get("value")
        return out

    def set_env(self, service_id, key, value):
        self.call("PUT", f"/services/{service_id}/env-vars/{key}", json={"value": value})

    def deploy(self, service_id):
        return self.call("POST", f"/services/{service_id}/deploys", json={"clearCache": "do_not_clear"})

    def deploy_status(self, service_id, deploy_id):
        return self.call("GET", f"/services/{service_id}/deploys/{deploy_id}")


def ensure_service(api, key, spec, owner, dry_run):
    svc = api.find_service(spec["name"])
    if svc:
        print(f"  [found] {spec['name']} ({svc['id']}) {svc.get('serviceDetails', {}).get('url', '')}")
        return svc
    print(f"  [missing] {spec['name']} -> will be created")
    if dry_run:
        return None
    payload = {"name": spec["name"], "ownerId": owner, "repo": REPO_URL, "branch": BRANCH, "autoDeploy": "yes"}
    payload.update(spec["create"])
    created = api.call("POST", "/services", json=payload)
    svc = created.get("service", created)
    print(f"  [created] {spec['name']} ({svc['id']})")
    return svc


def sync_env(api, svc, spec, local, overwrite, dry_run):
    current = api.env_vars(svc["id"]) if svc else {}
    desired = {k: local[k] for k in spec["env_keys"] if local.get(k)}
    desired.update(spec["fixed_env"])
    missing_local = [k for k in spec["env_keys"] if not local.get(k)]
    if missing_local:
        print(f"  [warn] not in local .env, skipped: {', '.join(missing_local)}")
    changed = 0
    for k, v in desired.items():
        if k not in current:
            action = "add"
        elif current[k] != v and (overwrite or k in spec["fixed_env"]):
            action = "update"
        else:
            continue
        print(f"  [{action}{' (dry-run)' if dry_run else ''}] {k}")
        if not dry_run:
            api.set_env(svc["id"], k, v)
        changed += 1
    if not changed:
        print("  [ok] env vars already in sync")
    return changed


def wait_live(api, svc, deploy_id, timeout_s=900):
    start = time.time()
    last = None
    while time.time() - start < timeout_s:
        d = api.deploy_status(svc["id"], deploy_id)
        d = d.get("deploy", d)
        status = d.get("status")
        if status != last:
            commit = (d.get("commit") or {}).get("id", "")[:7]
            print(f"  {time.strftime('%H:%M:%S')} {svc['name']}: {status} {commit}")
            last = status
        if status == "live":
            return True
        if status in ("build_failed", "update_failed", "canceled", "deactivated", "pre_deploy_failed"):
            return False
        time.sleep(10)
    print(f"  [timeout] {svc['name']} not live after {timeout_s}s")
    return False


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="show changes without applying them")
    ap.add_argument("--overwrite", action="store_true", help="update env keys whose Render value differs from .env")
    ap.add_argument("--only", choices=["web", "worker"], help="act on one service only")
    ap.add_argument("--no-deploy", action="store_true", help="sync env vars but do not trigger a deploy")
    args = ap.parse_args()

    local = load_dotenv(os.path.join(ROOT, ".env"))
    api_key = os.environ.get("RENDER_API_KEY") or local.get("RENDER_API_KEY")
    if not api_key:
        sys.exit("RENDER_API_KEY is not set (environment or .env). "
                 "Create one at https://dashboard.render.com/u/settings#api-keys")

    api = Render(api_key)
    print("[1/3] Authenticating with Render...")
    owner = api.owner_id()
    print(f"  [ok] owner {owner}")

    targets = [args.only] if args.only else ["web", "worker"]
    found = {}
    print("\n[2/3] Services and environment variables")
    for key in targets:
        spec = SERVICES[key]
        svc = ensure_service(api, key, spec, owner, args.dry_run)
        sync_env(api, svc, spec, local, args.overwrite, args.dry_run)
        found[key] = svc

    if args.dry_run or args.no_deploy:
        print("\nNo deploy triggered (" + ("dry-run" if args.dry_run else "--no-deploy") + ").")
        return

    print("\n[3/3] Deploying latest main")
    ok = True
    for key in targets:
        svc = found[key]
        dep = api.deploy(svc["id"])
        dep = dep.get("deploy", dep)
        print(f"  [triggered] {svc['name']} deploy {dep.get('id')}")
        ok = wait_live(api, svc, dep["id"]) and ok

    worker = found.get("worker")
    if worker:
        url = worker.get("serviceDetails", {}).get("url")
        if url:
            try:
                r = requests.get(f"{url}/healthz", timeout=60)
                print(f"  [health] {url}/healthz -> HTTP {r.status_code} {r.text[:200]}")
                ok = ok and r.ok
            except requests.RequestException as e:
                print(f"  [health] {url}/healthz failed: {e}")
                ok = False

    print("\n" + ("DEPLOY OK" if ok else "DEPLOY FINISHED WITH ERRORS -- check the Render dashboard"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
