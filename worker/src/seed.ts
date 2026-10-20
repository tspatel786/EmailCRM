import { admin } from "./db.js";
import { env } from "./env.js";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "DemoPass123!";

async function upsertUser(email: string, fullName: string) {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  if (env.serviceRoleKey.startsWith("replace-with")) {
    throw new Error("Set SUPABASE_SERVICE_ROLE_KEY before seeding");
  }

  const smPatelOwner = await upsertUser("sales@smpatelithub.in", "S.M. Patel Sales");
  const ownerId = await upsertUser("owner@demo.local", "Demo Owner");
  const managerId = await upsertUser("manager@demo.local", "Sales Manager");
  const execId = await upsertUser("exec@demo.local", "Sales Executive");
  const viewerId = await upsertUser("viewer@demo.local", "Read Only");
  const otherOwner = await upsertUser("other@demo.local", "Other Org Owner");

  const { data: orgA, error: orgErr } = await admin
    .from("organizations")
    .upsert({ slug: "smpatel-it-hub", name: "S.M.PATEL IT HUB", timezone: "Asia/Kolkata", daily_email_limit: 100, website: "https://smpatelithub.in" }, { onConflict: "slug" })
    .select()
    .single();
  if (orgErr) throw orgErr;

  const { data: orgB } = await admin
    .from("organizations")
    .upsert({ slug: "other-co", name: "Other Co", timezone: "UTC", daily_email_limit: 50 }, { onConflict: "slug" })
    .select()
    .single();

  const members = [
    { organization_id: orgA.id, user_id: smPatelOwner, role: "owner", status: "active", accepted_at: new Date().toISOString() },
    { organization_id: orgA.id, user_id: ownerId, role: "owner", status: "active", accepted_at: new Date().toISOString() },
    { organization_id: orgA.id, user_id: managerId, role: "sales_manager", status: "active", accepted_at: new Date().toISOString() },
    { organization_id: orgA.id, user_id: execId, role: "sales_executive", status: "active", accepted_at: new Date().toISOString() },
    { organization_id: orgA.id, user_id: viewerId, role: "viewer", status: "active", accepted_at: new Date().toISOString() },
    { organization_id: orgB!.id, user_id: otherOwner, role: "owner", status: "active", accepted_at: new Date().toISOString() },
  ];
  for (const m of members) {
    await admin.from("memberships").upsert(m, { onConflict: "organization_id,user_id" });
  }

  const { data: company } = await admin
    .from("companies")
    .insert({
      organization_id: orgA.id,
      name: "Northwind Retail",
      city: "Bengaluru",
      country: "India",
      created_by: ownerId,
    })
    .select()
    .single();

  async function insertContactIfMissing(row: Record<string, unknown> & { organization_id: string; primary_email: string }) {
    const { data: existing } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", row.organization_id)
      .ilike("primary_email", row.primary_email)
      .is("archived_at", null)
      .maybeSingle();
    if (existing) return;
    const { error } = await admin.from("contacts").insert(row as never);
    if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
  }

  await insertContactIfMissing({
    organization_id: orgA.id,
    company_id: company?.id,
    full_name: "Priya Shah",
    company_name: "Northwind Retail",
    primary_email: "priya@northwind.example",
    primary_phone: "+919800000001",
    city: "Bengaluru",
    country: "India",
    service_interest: "Managed IT",
    lead_source: "Website",
    lead_status: "qualified",
    lifecycle: "lead",
    consent_status: "granted",
    email_opt_in: true,
    assigned_to: execId,
    created_by: ownerId,
  });
  await insertContactIfMissing({
    organization_id: orgA.id,
    full_name: "Unknown Consent Lead",
    primary_email: "unknown@example.com",
    lead_source: "Event",
    lead_status: "new",
    consent_status: "unknown",
    created_by: ownerId,
  });

  const { data: otherExisting } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", orgB!.id)
    .ilike("primary_email", "pat@other.example")
    .maybeSingle();
  if (!otherExisting) {
    await admin.from("contacts").insert({
      organization_id: orgB!.id,
      full_name: "Pat Other",
      primary_email: "pat@other.example",
      lead_status: "new",
      consent_status: "granted",
      created_by: otherOwner,
    });
  }

  console.info("Seed complete. Demo users:");
  console.info("  owner@demo.local /", DEMO_PASSWORD);
  console.info("  manager@demo.local /", DEMO_PASSWORD);
  console.info("  exec@demo.local /", DEMO_PASSWORD);
  console.info("  viewer@demo.local /", DEMO_PASSWORD);
  console.info("  other@demo.local /", DEMO_PASSWORD, "(isolated org)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
