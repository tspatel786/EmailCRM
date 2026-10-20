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
    print(f"✓ Authenticated as: {owners[0].get('owner', {}).get('name', 'Owner')} (ID: {owner_id})")

    print("\n[2/3] Checking Project prj-dbbhf4e7bikc738j76a0...")
    proj_resp = requests.get(f"{RENDER_API_BASE}/projects/{PROJECT_ID}", headers=headers)
    if proj_resp.status_code == 200:
        proj_data = proj_resp.json()
        print(f"✓ Project Found: {proj_data.get('name', 'CRM')}")
    else:
        print(f"Note: Could not inspect project {PROJECT_ID} directly (HTTP {proj_resp.status_code}). Proceeding with Blueprint...")

    print("\n[3/3] Deploying Blueprint from GitHub Repository...")
    blueprint_payload = {
        "name": "itservices-crm-blueprint",
        "repo": REPO_URL,
        "branch": BRANCH,
        "autoSync": True,
        "ownerId": owner_id
    }

    bp_resp = requests.post(f"{RENDER_API_BASE}/blueprints", headers=headers, json=blueprint_payload)
    if bp_resp.status_code in (200, 201):
        bp_data = bp_resp.json()
        bp_id = bp_data.get("id") or bp_data.get("blueprint", {}).get("id")
        print(f"\n🎉 SUCCESS! Blueprint created on Render!")
        print(f"Blueprint ID: {bp_id}")
        print(f"Render is now provisioning your services (crm-web and crm-worker) from render.yaml.")
        print(f"Check progress here: https://dashboard.render.com/project/{PROJECT_ID}")
    elif bp_resp.status_code == 409 or "already exists" in bp_resp.text.lower():
        print("Blueprint already exists for this repository. Triggering sync...")
        # find blueprints
        bps = requests.get(f"{RENDER_API_BASE}/blueprints", headers=headers)
        if bps.status_code == 200:
            for b in bps.json():
                b_info = b.get("blueprint", {})
                if b_info.get("repo") == REPO_URL:
                    sync_resp = requests.post(f"{RENDER_API_BASE}/blueprints/{b_info.get('id')}/sync", headers=headers)
                    print(f"Sync triggered: HTTP {sync_resp.status_code}")
                    print("✓ Sync in progress!")
                    return
        print(bp_resp.text)
    else:
        print(f"API Response: HTTP {bp_resp.status_code}")
        print(bp_resp.text)

if __name__ == "__main__":
    main()
