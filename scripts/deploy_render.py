#!/usr/bin/env python3
"""
Deploy IT Services CRM to Render using the official Render REST API.
Repository: https://github.com/tspatel786/EmailCRM
Project ID: prj-dbbhf4e7bikc738j76a0
"""

import os
import sys
import requests
import json

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

RENDER_API_BASE = "https://api.render.com/v1"
PROJECT_ID = "prj-dbbhf4e7bikc738j76a0"
REPO_URL = "https://github.com/tspatel786/EmailCRM"
BRANCH = "main"

def main():
    api_key = os.environ.get("RENDER_API_KEY")
    if not api_key and len(sys.argv) > 1:
        api_key = sys.argv[1].strip()

    if not api_key:
        print("=" * 60)
        print("Render API Key Required")
        print("=" * 60)
        print("Get your API Key from: https://dashboard.render.com/u/settings#api-keys")
        print("Then run:")
        print(f"  python scripts/deploy_render.py <YOUR_RENDER_API_KEY>")
        print("=" * 60)
        api_key = input("Enter Render API Key (or press Enter to exit): ").strip()
        if not api_key:
            print("Aborted. No API key provided.")
            return

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

    print("\n[1/3] Verifying Render API Key...")
    me_resp = requests.get(f"{RENDER_API_BASE}/owners", headers=headers)
    if me_resp.status_code != 200:
        print(f"Error authenticating with Render: HTTP {me_resp.status_code}")
        print(me_resp.text)
        return

    owners = me_resp.json()
    if not owners:
        print("Error: No Render owners/accounts found for this key.")
        return
    
    owner_id = owners[0].get("owner", {}).get("id") or owners[0].get("id")
    print(f"[OK] Authenticated as: {owners[0].get('owner', {}).get('name', 'Owner')} (ID: {owner_id})")

    print("\n[2/3] Checking Project prj-dbbhf4e7bikc738j76a0...")
    proj_resp = requests.get(f"{RENDER_API_BASE}/projects/{PROJECT_ID}", headers=headers)
    if proj_resp.status_code == 200:
        proj_data = proj_resp.json()
        print(f"[OK] Project Found: {proj_data.get('name', 'CRM')}")
    else:
        print(f"Note: Could not inspect project {PROJECT_ID} directly (HTTP {proj_resp.status_code}). Proceeding with Blueprint...")

    print("\n[3/3] Creating Services on Render via API...")

    # 1. Create Static Site (crm-web)
    web_payload = {
        "type": "static_site",
        "name": "crm-web",
        "ownerId": owner_id,
        "repo": REPO_URL,
        "branch": BRANCH,
        "autoDeploy": "yes",
        "serviceDetails": {
            "buildCommand": "npm run build -w @crm/shared && npm run build -w @crm/web",
            "publishPath": "apps/web/dist",
            "pullRequestPreviewsEnabled": "no",
            "routes": [
                {"type": "rewrite", "source": "/*", "destination": "/index.html"}
            ]
        }
    }

    print("Creating crm-web (Static Site)...")
    web_resp = requests.post(f"{RENDER_API_BASE}/services", headers=headers, json=web_payload)
    if web_resp.status_code in (200, 201):
        web_data = web_resp.json()
        service_id = web_data.get("service", {}).get("id") or web_data.get("id")
        service_url = web_data.get("service", {}).get("serviceDetails", {}).get("url") or web_data.get("url")
        print(f"[SUCCESS] crm-web created! ID: {service_id}")
        if service_url:
            print(f"Live URL: {service_url}")
    else:
        print(f"crm-web response: HTTP {web_resp.status_code} - {web_resp.text}")

    # 2. Create Web Service (crm-worker)
    worker_payload = {
        "type": "web_service",
        "name": "crm-worker",
        "ownerId": owner_id,
        "repo": REPO_URL,
        "branch": BRANCH,
        "autoDeploy": "yes",
        "serviceDetails": {
            "env": "node",
            "plan": "free",
            "healthCheckPath": "/healthz",
            "pullRequestPreviewsEnabled": "no",
            "envSpecificDetails": {
                "buildCommand": "npm install && npm run build -w @crm/shared && npm run build -w @crm/worker",
                "startCommand": "npm run start -w @crm/worker"
            }
        }
    }

    print("\nCreating crm-worker (Node.js Background Worker)...")
    worker_resp = requests.post(f"{RENDER_API_BASE}/services", headers=headers, json=worker_payload)
    if worker_resp.status_code in (200, 201):
        worker_data = worker_resp.json()
        w_service_id = worker_data.get("service", {}).get("id") or worker_data.get("id")
        w_service_url = worker_data.get("service", {}).get("serviceDetails", {}).get("url") or worker_data.get("url")
        print(f"[SUCCESS] crm-worker created! ID: {w_service_id}")
        if w_service_url:
            print(f"Worker URL: {w_service_url}")
    else:
        print(f"crm-worker response: HTTP {worker_resp.status_code} - {worker_resp.text}")

    print("\n" + "=" * 60)
    print(f"Check your dashboard: https://dashboard.render.com/project/{PROJECT_ID}")
    print("=" * 60)

if __name__ == "__main__":
    main()
