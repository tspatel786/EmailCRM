// "Save to CRM" for Lead Finder: copies a discovered company (and optionally one decision maker)
// into the EXISTING companies / contacts / deals tables. Existing records are reused (matched by
// email, then by company name) so nothing is duplicated. Saved contacts get consent "unknown",
// so consent-required campaigns will not email them automatically.
import { supabase } from "./supabase";

export type LeadCompany = {
  id: string;
  organization_id: string;
  cin: string;
  company_name: string;
  website: string | null;
  website_status: string;
  state: string | null;
  city: string | null;
  industry: string;
  opportunities: string[];
  registration_date: string | null;
  source_url: string | null;
  crm_company_id: string | null;
  crm_contact_id: string | null;
  crm_deal_id: string | null;
  crm_status: "new" | "saved" | "in_pipeline";
};

export type LeadPerson = { id: string; full_name: string; original_designation: string | null; crm_contact_id: string | null; source_url: string | null };

type Contact = { contact_type: "email" | "phone"; contact_value: string; contact_kind: string; decision_maker_id: string | null; source_url: string | null };

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
}

export async function saveLeadToCrm(opts: {
  company: LeadCompany;
  person?: LeadPerson | null;
  addToPipeline: boolean;
  userId: string;
}): Promise<{ companyId: string; contactId: string; dealId: string | null; reused: string[] }> {
  const { company: c, person, addToPipeline, userId } = opts;
  const org = c.organization_id;
  const reused: string[] = [];

  const { data: contactRows, error: cErr } = await supabase
    .from("lead_contacts")
    .select("contact_type, contact_value, contact_kind, decision_maker_id, source_url")
    .eq("company_id", c.id);
  if (cErr) throw new Error(errMsg(cErr));
  const contacts = (contactRows ?? []) as Contact[];
  const personEmail = person ? contacts.find((x) => x.contact_type === "email" && x.decision_maker_id === person.id)?.contact_value : undefined;
  const generalEmail = contacts.find((x) => x.contact_type === "email" && x.contact_kind === "company_general")?.contact_value
    ?? contacts.find((x) => x.contact_type === "email" && !x.decision_maker_id)?.contact_value;
  const email = (personEmail ?? (person ? undefined : generalEmail))?.toLowerCase() ?? null;
  const phone = contacts.find((x) => x.contact_type === "phone")?.contact_value ?? null;

  // 1. Company: reuse the linked one, else an existing company with the same name.
  let companyId = c.crm_company_id;
  if (!companyId) {
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("organization_id", org)
      .ilike("name", c.company_name.replace(/[%_]/g, ""))
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (existing) {
      companyId = existing.id as string;
      reused.push("company");
    } else {
      const { data, error } = await supabase
        .from("companies")
        .insert({
          organization_id: org,
          name: c.company_name,
          website: c.website && c.website_status !== "rejected" ? c.website : null,
          city: c.city,
          state: c.state,
          country: "India",
          notes: `From Lead Finder. CIN ${c.cin}.${c.source_url ? ` Source: ${c.source_url}` : ""}`,
          owner_user_id: userId,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Company: ${errMsg(error)}`);
      companyId = data.id as string;
    }
  }

  // 2. Contact: reuse the person's/company's linked contact, else one with the same email.
  let contactId = person?.crm_contact_id ?? (!person ? c.crm_contact_id : null);
  if (!contactId && email) {
    const { data: byEmail } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", org)
      .ilike("primary_email", email)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (byEmail) {
      contactId = byEmail.id as string;
      reused.push("contact");
    }
  }
  if (!contactId) {
    const sources = [...new Set([person?.source_url, ...contacts.map((x) => x.source_url), c.source_url].filter(Boolean))];
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        organization_id: org,
        full_name: person?.full_name ?? c.company_name,
        company_id: companyId,
        company_name: c.company_name,
        primary_email: email,
        primary_phone: phone,
        website: c.website && c.website_status !== "rejected" ? c.website : null,
        city: c.city,
        state: c.state,
        country: "India",
        service_interest: c.opportunities[0] ?? null,
        lead_source: "Lead Finder",
        lead_status: "new",
        lifecycle: "lead",
        consent_status: "unknown",
        notes: [
          person ? `${person.original_designation ?? "Decision maker"} at ${c.company_name}.` : `Company general contact.`,
          `CIN ${c.cin}.`,
          c.opportunities.length ? `Suggested opportunities (not confirmed): ${c.opportunities.join(", ")}.` : "",
          sources.length ? `Public sources: ${sources.join(" , ")}` : "",
        ].filter(Boolean).join(" "),
        owner_user_id: userId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Contact: ${errMsg(error)}`);
    contactId = data.id as string;
  }

  // 3. Optional pipeline deal (one per discovered company).
  let dealId = c.crm_deal_id;
  if (addToPipeline && !dealId) {
    const { data, error } = await supabase
      .from("deals")
      .insert({
        organization_id: org,
        title: `${c.company_name}${c.opportunities[0] ? ` – ${c.opportunities[0]}` : ""}`.slice(0, 300),
        stage: "new_lead",
        contact_id: contactId,
        company_id: companyId,
        currency: "INR",
        owner_user_id: userId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Pipeline: ${errMsg(error)}`);
    dealId = data.id as string;
  }

  // 4. Link back and record on the timeline.
  const { error: upErr } = await supabase
    .from("discovered_companies")
    .update({
      crm_company_id: companyId,
      crm_contact_id: person ? c.crm_contact_id : contactId,
      crm_deal_id: dealId,
      crm_status: dealId ? "in_pipeline" : "saved",
      saved_by: userId,
      saved_at: new Date().toISOString(),
    })
    .eq("id", c.id);
  if (upErr) throw new Error(errMsg(upErr));
  if (person) await supabase.from("decision_makers").update({ crm_contact_id: contactId }).eq("id", person.id);
  await supabase.from("activities").insert({
    organization_id: org,
    contact_id: contactId,
    actor_user_id: userId,
    activity_type: "note",
    summary: `Saved from Lead Finder: ${c.company_name}`,
    outcome: `CIN ${c.cin}${dealId ? " · added to pipeline" : ""}`,
    occurred_at: new Date().toISOString(),
  });
  return { companyId: companyId!, contactId, dealId, reused };
}

export function isMissingTableError(e: unknown): boolean {
  const m = errMsg(e);
  return /does not exist|Could not find the table|schema cache/i.test(m);
}
