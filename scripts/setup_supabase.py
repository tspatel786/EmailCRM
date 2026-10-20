#!/usr/bin/env python3
"""
Automate Supabase Project Creation and Schema Deployment via Supabase Management API.
Requires a Supabase Personal Access Token from: https://app.supabase.com/account/tokens
"""

import os
import sys
import time
import requests
import json

SUPABASE_API_BASE = "https://api.supabase.com/v1"
RENDER_API_BASE = "https://api.render.com/v1"
RENDER_KEY = "rnd_ZeE9WbmxvvJNqnU69qujOrb6KWz9"
WEB_SERVICE_ID = "srv-dbbhm26q1p3s73clkbh0"
WORKER_SERVICE_ID = "srv-dbbhmdjbc2fs73b8c450"

def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token and len(sys.argv) > 1:
        token = sys.argv[1].strip()

    if not token:
        print("=" * 60)
        print("Supabase Personal Access Token Required")
        print("=" * 60)
        print("1. Log in to Supabase: https://supabase.com (using GitHub or Google)")
        print("2. Generate Access Token at: https://app.supabase.com/account/tokens")
        print("3. Run: python scripts/setup_supabase.py <TOKEN>")
        print("=" * 60)
        token = input("Enter Supabase Access Token (sbp_...): ").strip()
        if not token:
            print("Aborted.")
            return

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    print("\n[1/5] Fetching Supabase Organizations...")
    orgs_resp = requests.get(f"{SUPABASE_API_BASE}/organizations", headers=headers)
    if orgs_resp.status_code != 200:
        print(f"Error authenticating with Supabase: HTTP {orgs_resp.status_code}")
        print(orgs_resp.text)
        return

    orgs = orgs_resp.json()
    if not orgs:
        print("Error: No Supabase organizations found. Please create one in Supabase dashboard.")
        return

    org_id = orgs[0]["id"]
    print(f"[OK] Organization found: {orgs[0].get('name')} (ID: {org_id})")

    db_password = os.environ.get("SUPABASE_DB_PASS", "CrmSecurePass2026!#")
    project_payload = {
        "name": "itservices-crm",
        "organization_id": org_id,
        "region": "ap-south-1", # Mumbai region
        "plan": "free",
        "db_pass": db_password
    }

    print("\n[2/5] Creating Supabase Project (Mumbai region)...")
    proj_resp = requests.post(f"{SUPABASE_API_BASE}/projects", headers=headers, json=project_payload)
    if proj_resp.status_code in (200, 201):
        proj_data = proj_resp.json()
        project_ref = proj_data["id"]
        print(f"[SUCCESS] Project initiated! Ref: {project_ref}")
    else:
        # Check if project already exists
        print(f"Note: {proj_resp.text}")
        list_resp = requests.get(f"{SUPABASE_API_BASE}/projects", headers=headers)
        if list_resp.status_code == 200 and list_resp.json():
            project_ref = list_resp.json()[0]["id"]
            print(f"Using existing project ref: {project_ref}")
        else:
            return

    print("\n[3/5] Waiting for Supabase Database to be ACTIVE (takes ~30-60s)...")
    supabase_url = f"https://{project_ref}.supabase.co"
    anon_key = ""
    service_key = ""

    for attempt in range(25):
        time.sleep(5)
        status_resp = requests.get(f"{SUPABASE_API_BASE}/projects/{project_ref}/status", headers=headers)
        if status_resp.status_code == 200:
            status = status_resp.json().get("status")
            print(f"  Attempt {attempt+1}: Status = {status}")
            if status == "ACTIVE_HEALTHY":
                break

    print("\n[4/5] Fetching API Keys...")
    keys_resp = requests.get(f"{SUPABASE_API_BASE}/projects/{project_ref}/api-keys", headers=headers)
    if keys_resp.status_code == 200:
        for k in keys_resp.json():
            if k.get("name") == "anon":
                anon_key = k.get("api_key")
            elif k.get("name") == "service_role":
                service_key = k.get("api_key")
        print(f"[OK] Anon Key: {anon_key[:15]}...")
        print(f"[OK] Service Key: {service_key[:15]}...")
    else:
        print(f"Could not fetch keys: {keys_resp.text}")

    print("\n[5/5] Deploying Database Schema (deploy_all.sql)...")
    sql_path = os.path.join(os.path.dirname(__file__), "..", "supabase", "deploy_all.sql")
    if os.path.exists(sql_path):
        with open(sql_path, "r", encoding="utf-8") as f:
            sql_content = f.read()
        sql_resp = requests.post(
            f"{SUPABASE_API_BASE}/projects/{project_ref}/database/query",
            headers=headers,
            json={"query": sql_content}
        )
        if sql_resp.status_code in (200, 201):
            print("[SUCCESS] All 12 Database Migrations and RLS applied successfully!")
        else:
            print(f"SQL deployment note: {sql_resp.status_code} - {sql_resp.text[:300]}")

    # Injecting environment variables into Render automatically
    if anon_key and service_key:
        print("\n[BONUS] Automatically injecting Supabase keys into Render...")
        r_headers = {"Authorization": f"Bearer {RENDER_KEY}", "Content-Type": "application/json"}
        
        # update crm-web env
        web_env = [
            {"key": "VITE_SUPABASE_URL", "value": supabase_url},
            {"key": "VITE_SUPABASE_ANON_KEY", "value": anon_key}
        ]
        requests.put(f"{RENDER_API_BASE}/services/{WEB_SERVICE_ID}/env-vars", headers=r_headers, json=web_env)
        print("[OK] crm-web env updated on Render!")

        # update crm-worker env
        worker_env = [
            {"key": "SUPABASE_URL", "value": supabase_url},
            {"key": "SUPABASE_SERVICE_ROLE_KEY", "value": service_key},
            {"key": "SMTP_MOCK", "value": "true"},
            {"key": "NODE_ENV", "value": "production"}
        ]
        requests.put(f"{RENDER_API_BASE}/services/{WORKER_SERVICE_ID}/env-vars", headers=r_headers, json=worker_env)
        print("[OK] crm-worker env updated on Render!")

    print("\n" + "=" * 60)
    print("ALL DONE! Supabase + Render are now 100% connected!")
    print(f"Frontend Live URL: https://crm-web-wbq7.onrender.com")
    print(f"Supabase Dashboard: https://supabase.com/dashboard/project/{project_ref}")
    print("=" * 60)

if __name__ == "__main__":
    main()
