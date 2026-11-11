/// <reference path="../deno.d.ts" />
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import {
  findDuplicateContact,
  indianMobileVariants,
  INQUIRY_CONSENT_TEXT,
  parseCaptchaAnswer,
  publicInquirySchema,
  type InquiryContactCandidate,
} from "../../../packages/shared/src/inquiry.ts";

const ORG_SLUG_RE = /^[a-z0-9-]{1,80}$/;
const MAX_PER_HOUR_IP = 5;
const MAX_PER_HOUR_MOBILE = 5;
const WINDOW_SECONDS = 3600;

function parseAllowedOrigins(): string[] {
  const configured = Deno.env.get("APP_PUBLIC_URL") ?? "http://localhost:5173";
  return configured
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => s.length > 0 && s !== "*");
}

function resolveCorsOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin")?.trim().replace(/\/+$/, "");
  const allowed = parseAllowedOrigins();
  if (!origin) {
    return allowed[0] ?? null;
  }
  return allowed.includes(origin) ? origin : null;
}

function buildCorsHeaders(allowedOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }
  return headers;
}

const CAPTCHA_TTL_MS = 10 * 60 * 1000;

async function hmacSignHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function createCaptchaChallenge(secret: string): Promise<{ question: string; token: string }> {
  const rand = new Uint32Array(2);
  crypto.getRandomValues(rand);
  const a = (rand[0]! % 18) + 2; // 2..19
  const b = (rand[1]! % 9) + 1;  // 1..9
  const nonce = crypto.randomUUID();
  const exp = Date.now() + CAPTCHA_TTL_MS;
  const sig = await hmacSignHex(secret, `${nonce}.${exp}.${a + b}`);
  return {
    question: `${a} + ${b} = ?`,
    token: `${nonce}.${exp}.${sig}`,
  };
}

async function verifySignedCaptcha(
  admin: SupabaseClient,
  secret: string,
  token: string,
  answerRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const answer = parseCaptchaAnswer(answerRaw);
  if (answer === null) return { ok: false, error: "verification_failed" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "verification_failed" };
  const [nonce, expStr, sig] = parts as [string, string, string];
  const exp = Number(expStr);
  if (!nonce || !Number.isFinite(exp) || Date.now() > exp) {
    return { ok: false, error: "verification_expired" };
  }

  const expectedSig = await hmacSignHex(secret, `${nonce}.${exp}.${answer}`);
  if (!constantTimeEqual(sig, expectedSig)) {
    return { ok: false, error: "verification_failed" };
  }

  // Enforce single-use nonce so bots cannot replay the same solved CAPTCHA token.
  const unused = await consumeInquiryLimit(admin, `captcha:${nonce}`, 1);
  if (!unused) {
    return { ok: false, error: "verification_expired" };
  }
  return { ok: true };
}

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 64);
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}

async function verifyTurnstileIfEnabled(token: string, clientIp: string): Promise<{ ok: boolean; error?: string }> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")?.trim();
  if (!secret) return { ok: true };
  if (!token) return { ok: false, error: "verification_required" };

  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (clientIp !== "unknown") form.set("remoteip", clientIp);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    if (!res.ok) return { ok: false, error: "verification_failed" };
    const data = await res.json().catch(() => null);
    if (!data?.success) return { ok: false, error: "verification_failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "verification_failed" };
  }
}

async function consumeInquiryLimit(
  admin: SupabaseClient,
  bucket: string,
  max: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("consume_inquiry_rate_limit", {
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: WINDOW_SECONDS,
  });
  if (error) {
    console.error(JSON.stringify({ msg: "inquiry_rate_limit_error", error: error.message }));
    return false;
  }
  return Boolean(data);
}

Deno.serve(async (req: Request) => {
  const allowedOrigin = resolveCorsOrigin(req);
  const corsHeaders = buildCorsHeaders(allowedOrigin);

  if (req.method === "OPTIONS") {
    if (!allowedOrigin) return new Response("forbidden", { status: 403, headers: corsHeaders });
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (!allowedOrigin) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return jsonResponse({ error: "service_unavailable" }, 500, corsHeaders);
  }
  const captchaSecret = Deno.env.get("CAPTCHA_SECRET")?.trim() || serviceKey;

  if (req.method === "GET") {
    const challenge = await createCaptchaChallenge(captchaSecret);
    return new Response(JSON.stringify(challenge), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "invalid_request" }, 400, corsHeaders);
  }

  const orgSlug = String((body as Record<string, unknown>).orgSlug ?? "")
    .trim()
    .toLowerCase();
  if (!ORG_SLUG_RE.test(orgSlug)) {
    return jsonResponse({ error: "invalid_request" }, 400, corsHeaders);
  }

  // Honeypot check: silently accept without creating any CRM records.
  const honeypot = String((body as Record<string, unknown>).website_url ?? "").trim();
  if (honeypot.length > 0) {
    return jsonResponse({ ok: true }, 200, corsHeaders);
  }

  const parsedResult = publicInquirySchema.safeParse(body);
  if (!parsedResult.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsedResult.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return jsonResponse({ error: "validation_failed", fields: fieldErrors }, 400, corsHeaders);
  }
  const parsed = parsedResult.data;

  const clientIp = getClientIp(req);
  const turnstileCheck = await verifyTurnstileIfEnabled(parsed.turnstile_token ?? "", clientIp);
  if (!turnstileCheck.ok) {
    return jsonResponse({ error: turnstileCheck.error ?? "verification_failed" }, 403, corsHeaders);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const captchaCheck = await verifySignedCaptcha(
    admin,
    captchaSecret,
    parsed.captcha_token ?? "",
    parsed.captcha_answer,
  );
  if (!captchaCheck.ok) {
    return jsonResponse({ error: captchaCheck.error ?? "verification_failed" }, 403, corsHeaders);
  }

  // Enforce per-IP and per-mobile rate limits (max 5/hour each).
  const ipAllowed = await consumeInquiryLimit(admin, `ip:${clientIp}`, MAX_PER_HOUR_IP);
  if (!ipAllowed) {
    return jsonResponse({ error: "rate_limited" }, 429, corsHeaders);
  }
  const mobileAllowed = await consumeInquiryLimit(admin, `mobile:${parsed.mobile}`, MAX_PER_HOUR_MOBILE);
  if (!mobileAllowed) {
    return jsonResponse({ error: "rate_limited" }, 429, corsHeaders);
  }

  // Resolve organization via public slug. Never leak whether org exists beyond generic failure.
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgErr || !org) {
    return jsonResponse({ error: "unable_to_submit" }, 404, corsHeaders);
  }

  const nowIso = new Date().toISOString();
  const dueIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Check duplicate by normalized email or normalized mobile within the organization.
  const mobileVariants = indianMobileVariants(parsed.mobile);
  const orFilters: string[] = [];
  if (parsed.email) {
    orFilters.push(`primary_email_normalized.eq.${parsed.email}`);
  }
  for (const variant of mobileVariants) {
    orFilters.push(`primary_phone.eq.${variant}`);
  }

  let existingContact: InquiryContactCandidate | null = null;
  if (orFilters.length > 0) {
    const { data: candidates, error: dupErr } = await admin
      .from("contacts")
      .select("id, company_id, full_name, primary_email, primary_phone, archived_at")
      .eq("organization_id", org.id)
      .is("archived_at", null)
      .or(orFilters.join(","))
      .limit(20);

    if (dupErr) {
      console.error(JSON.stringify({ msg: "inquiry_dup_lookup_failed", error: dupErr.message }));
      return jsonResponse({ error: "unable_to_submit" }, 500, corsHeaders);
    }
    existingContact = findDuplicateContact(
      (candidates ?? []) as InquiryContactCandidate[],
      parsed.email,
      parsed.mobile,
    );
  }

  let contactId = existingContact?.id ?? null;
  let companyId = existingContact?.company_id ?? null;
  const isDuplicate = Boolean(existingContact);

  if (!contactId) {
    // Resolve or create optional company record.
    if (parsed.company) {
      const { data: existingCompany } = await admin
        .from("companies")
        .select("id")
        .eq("organization_id", org.id)
        .is("archived_at", null)
        .ilike("name", parsed.company)
        .maybeSingle();

      if (existingCompany?.id) {
        companyId = existingCompany.id;
      } else {
        const { data: createdCompany, error: compErr } = await admin
          .from("companies")
          .insert({
            organization_id: org.id,
            name: parsed.company,
          })
          .select("id")
          .single();
        if (!compErr && createdCompany?.id) {
          companyId = createdCompany.id;
        }
      }
    }

    const { data: createdContact, error: insertErr } = await admin
      .from("contacts")
      .insert({
        organization_id: org.id,
        company_id: companyId,
        full_name: parsed.name,
        company_name: parsed.company || null,
        primary_email: parsed.email || null,
        primary_phone: parsed.mobile,
        service_interest: parsed.service,
        lead_source: "Public Form",
        lead_status: "new",
        lifecycle: "lead",
        priority: "medium",
        consent_status: "granted",
        consent_captured_at: nowIso,
        consent_text: INQUIRY_CONSENT_TEXT,
        email_opt_in: true,
        notes: parsed.message || null,
      })
      .select("id, company_id")
      .single();

    if (insertErr || !createdContact) {
      // Handle race on email uniqueness constraint gracefully as duplicate.
      if (insertErr?.code === "23505" && parsed.email) {
        const { data: raceContact } = await admin
          .from("contacts")
          .select("id, company_id")
          .eq("organization_id", org.id)
          .eq("primary_email_normalized", parsed.email)
          .is("archived_at", null)
          .maybeSingle();
        if (raceContact?.id) {
          contactId = raceContact.id;
          companyId = raceContact.company_id ?? null;
        }
      }
      if (!contactId) {
        console.error(JSON.stringify({ msg: "inquiry_contact_insert_failed", error: insertErr?.message }));
        return jsonResponse({ error: "unable_to_submit" }, 500, corsHeaders);
      }
    } else {
      contactId = createdContact.id;
      companyId = createdContact.company_id ?? companyId;
    }
  }

  const summaryParts = [
    isDuplicate ? `Repeat public inquiry (${parsed.service})` : `New public inquiry (${parsed.service})`,
    parsed.company ? `Company: ${parsed.company}` : null,
    parsed.message ? `Message: ${parsed.message}` : null,
    `Consent: "${INQUIRY_CONSENT_TEXT}" at ${nowIso}`,
  ].filter(Boolean);

  const { error: actErr } = await admin.from("activities").insert({
    organization_id: org.id,
    contact_id: contactId,
    company_id: companyId,
    actor_user_id: null,
    activity_type: isDuplicate ? "note" : "system",
    summary: summaryParts.join(" · "),
    outcome: isDuplicate ? "duplicate_inquiry" : "new_inquiry",
    source_table: "contacts",
    source_id: contactId,
    next_follow_up_at: dueIso,
  });
  if (actErr) {
    console.error(JSON.stringify({ msg: "inquiry_activity_insert_failed", error: actErr.message }));
  }

  const taskDescParts = [
    `Service needed: ${parsed.service}`,
    `Mobile: ${parsed.mobile}`,
    parsed.email ? `Email: ${parsed.email}` : null,
    parsed.company ? `Company: ${parsed.company}` : null,
    parsed.message ? `Message: ${parsed.message}` : null,
  ].filter(Boolean);

  const { error: taskErr } = await admin.from("tasks").insert({
    organization_id: org.id,
    contact_id: contactId,
    title: "Call new inquiry",
    description: taskDescParts.join("\n"),
    kind: "follow_up",
    due_at: dueIso,
    priority: "high",
    status: "pending",
    reminder_email: true,
  });
  if (taskErr) {
    console.error(JSON.stringify({ msg: "inquiry_task_insert_failed", error: taskErr.message }));
  }

  const { error: auditErr } = await admin.from("audit_logs").insert({
    organization_id: org.id,
    actor_user_id: null,
    action: isDuplicate ? "inquiry.duplicate_submitted" : "inquiry.submitted",
    entity_table: "contacts",
    entity_id: contactId,
    metadata: {
      lead_source: "Public Form",
      service: parsed.service,
      duplicate: isDuplicate,
      consent_captured_at: nowIso,
    },
    ip: clientIp === "unknown" ? null : clientIp,
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (auditErr) {
    console.error(JSON.stringify({ msg: "inquiry_audit_insert_failed", error: auditErr.message }));
  }

  return jsonResponse({ ok: true }, 200, corsHeaders);
});
