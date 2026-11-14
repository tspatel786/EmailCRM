// Live, role-based RLS isolation test for the "private" employee data-sharing policy.
// Requires the worker seed data (worker/src/seed.ts) to have been run against the target
// Supabase project: SKIPs cleanly if the seeded orgs/users aren't present rather than failing.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "DemoPass123!";

if (!url || !anonKey || !serviceRoleKey || anonKey.startsWith("replace-with") || serviceRoleKey.startsWith("replace-with")) {
  console.log("SKIP [rls-isolation]: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are not configured.");
  process.exit(0);
}

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class NoopWebSocket {};
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

function asUser() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email) {
  const client = asUser();
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { client, userId: data.user.id };
}

let failed = false;
function check(label, ok) {
  if (ok) {
    console.log(`PASS [rls-isolation]: ${label}`);
  } else {
    console.error(`FAIL [rls-isolation]: ${label}`);
    failed = true;
  }
}

async function main() {
  const { data: orgA } = await admin.from("organizations").select("id").eq("slug", "smpatel-it-hub").maybeSingle();
  const { data: orgB } = await admin.from("organizations").select("id").eq("slug", "other-co").maybeSingle();
  if (!orgA || !orgB) {
    console.log("SKIP [rls-isolation]: seeded orgs not found — run `node worker/dist/seed.js` (or ts equivalent) against this DB first.");
    process.exit(0);
  }

  const { data: userList, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const byEmail = (email) => userList.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  const ownerUser = byEmail("owner@demo.local");
  const execUser = byEmail("exec@demo.local");
  const otherOwnerUser = byEmail("other@demo.local");
  if (!ownerUser || !execUser || !otherOwnerUser) {
    console.log("SKIP [rls-isolation]: seeded demo users not found — run the worker seed script first.");
    process.exit(0);
  }

  const owner = await signIn("owner@demo.local");
  const exec = await signIn("exec@demo.local");
  const otherOrgOwner = await signIn("other@demo.local");

  // Fixture: an org-A contact owned by the owner (not by exec).
  const { data: ownerContact, error: fixtureErr } = await admin
    .from("contacts")
    .insert({
      organization_id: orgA.id,
      full_name: "RLS Test — Owner Owned",
      primary_email: `rls-owner-owned-${Date.now()}@example.com`,
      lead_status: "new",
      consent_status: "unknown",
      created_by: ownerUser.id,
      owner_user_id: ownerUser.id,
    })
    .select()
    .single();
  if (fixtureErr) throw fixtureErr;

  const cleanupIds = [ownerContact.id];

  try {
    // 1. Exec inserts own contact, setting owner_user_id to self — must succeed.
    const { data: execInsert, error: execInsertErr } = await exec.client
      .from("contacts")
      .insert({
        organization_id: orgA.id,
        full_name: "RLS Test — Exec Owned",
        primary_email: `rls-exec-owned-${Date.now()}@example.com`,
        lead_status: "new",
        consent_status: "unknown",
        owner_user_id: execUser.id,
      })
      .select()
      .single();
    check("exec can insert a contact owned by self", !execInsertErr && !!execInsert);
    if (execInsert) cleanupIds.push(execInsert.id);

    // 2. Exec tries to insert a contact owned by someone else — must be rejected by WITH CHECK.
    const { error: spoofInsertErr } = await exec.client.from("contacts").insert({
      organization_id: orgA.id,
      full_name: "RLS Test — Spoofed Owner",
      primary_email: `rls-spoof-${Date.now()}@example.com`,
      lead_status: "new",
      consent_status: "unknown",
      owner_user_id: ownerUser.id,
    });
    check("exec cannot insert a contact owned by another employee", !!spoofInsertErr);

    // 3. Exec reads the owner-owned contact by known ID — must return 0 rows (not an error, just filtered).
    const { data: execReadOwner } = await exec.client.from("contacts").select("id").eq("id", ownerContact.id);
    check("exec cannot read a contact owned by another employee", (execReadOwner ?? []).length === 0);

    // 4. Exec updates the owner-owned contact by known ID — must affect 0 rows.
    const { data: execUpdateOwner } = await exec.client.from("contacts").update({ notes: "tampered" }).eq("id", ownerContact.id).select();
    check("exec cannot update a contact owned by another employee", (execUpdateOwner ?? []).length === 0);

    // 5. Exec tries to reassign their own contact to someone else — must be rejected by WITH CHECK.
    if (execInsert) {
      const { data: tamperResult } = await exec.client
        .from("contacts")
        .update({ owner_user_id: ownerUser.id })
        .eq("id", execInsert.id)
        .select();
      check("exec cannot reassign owner_user_id on their own record", (tamperResult ?? []).length === 0);
    }

    // 6. Owner (admin) reads both contacts — must see both.
    const { data: ownerReadAll } = await owner.client
      .from("contacts")
      .select("id")
      .in("id", [ownerContact.id, ...(execInsert ? [execInsert.id] : [])]);
    check("admin can read both employees' contacts within their org", (ownerReadAll ?? []).length === (execInsert ? 2 : 1));

    // 7. Owner (admin) reassigns the exec's contact — must succeed.
    if (execInsert) {
      const { data: reassign } = await owner.client
        .from("contacts")
        .update({ owner_user_id: ownerUser.id })
        .eq("id", execInsert.id)
        .select();
      check("admin can reassign an employee's record", (reassign ?? []).length === 1);
    }

    // 8. Cross-org: Org B's owner must see zero rows from Org A, even as an admin in their own org.
    const { data: crossOrgRead } = await otherOrgOwner.client.from("contacts").select("id").eq("id", ownerContact.id);
    check("cross-org admin cannot read another organization's record", (crossOrgRead ?? []).length === 0);

    // 9. accept_invite RPC exists and rejects when there is no pending invite for the caller/org.
    const { error: acceptErr } = await exec.client.rpc("accept_invite", { p_organization_id: orgA.id });
    check("accept_invite rejects when no pending invite exists", !!acceptErr);
  } finally {
    await admin.from("contacts").delete().in("id", cleanupIds);
  }

  if (failed) process.exit(1);
  console.log("PASS [rls-isolation]: all checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
