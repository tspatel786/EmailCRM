import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { canWrite, contactFormSchema } from "@crm/shared";
import type { z } from "zod";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { downloadWorkbook } from "../lib/export";
import { fmtDate, telHref } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from "../components/ui";
import { MemberSelect } from "./Companies";

type Form = z.infer<typeof contactFormSchema>;
const PAGE = 25;

export function ContactsPage() {
  const { org } = useSession();
  const qc = useQueryClient();
  const writable = canWrite(org?.role);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  const form = useForm<Form>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { full_name: "", lead_status: "new", priority: "medium", consent_status: "unknown" },
  });

  const list = useQuery({
    queryKey: ["contacts", org?.organization_id, q, status, page],
    enabled: Boolean(org),
    queryFn: async () => {
      let query = supabase
        .from("contacts")
        .select("*", { count: "exact" })
        .eq("organization_id", org!.organization_id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (status) query = query.eq("lead_status", status);
      if (q) query = query.or(`full_name.ilike.%${q}%,primary_email.ilike.%${q}%,company_name.ilike.%${q}%,primary_phone.ilike.%${q}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const create = useMutation({
    mutationFn: async (values: Form) => {
      setDupWarning(null);
      if (values.primary_email) {
        const { data: existing } = await supabase
          .from("contacts")
          .select("id, full_name")
          .eq("organization_id", org!.organization_id)
          .ilike("primary_email", values.primary_email)
          .is("archived_at", null)
          .maybeSingle();
        if (existing) {
          setDupWarning(`A contact with this email already exists: ${existing.full_name}`);
          throw new Error("duplicate");
        }
      }
      const { error } = await supabase.from("contacts").insert({
        ...values,
        primary_email: values.primary_email || null,
        organization_id: org!.organization_id,
        email_opt_in: values.consent_status === "granted",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      setOpen(false);
      form.reset();
    },
  });

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle="Leads and customers. Duplicate emails are blocked per organization."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => downloadWorkbook("contacts.xlsx", (list.data?.rows ?? []) as Record<string, unknown>[])}
            >
              Export
            </Button>
            {writable ? (
              <Button type="button" onClick={() => setOpen(true)}>
                New contact
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-sm" placeholder="Search name, email, phone, company" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">All statuses</option>
          {["new", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
      {!list.data?.rows.length ? (
        <Empty title="No contacts" hint="Create a contact or import Excel/CSV." />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Consent</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {list.data.rows.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2">
                    <Link className="font-medium text-brand-800 hover:underline" to={`/app/contacts/${c.id}`}>
                      {c.full_name}
                    </Link>
                  </td>
                  <td>{c.company_name}</td>
                  <td>{c.primary_email}</td>
                  <td>
                    {telHref(c.primary_phone) ? (
                      <a className="text-brand-700" href={telHref(c.primary_phone)!}>
                        {c.primary_phone}
                      </a>
                    ) : (
                      c.primary_phone
                    )}
                  </td>
                  <td>
                    <Badge>{c.lead_status}</Badge>
                  </td>
                  <td>
                    <Badge tone={c.consent_status === "granted" ? "green" : c.consent_status === "withdrawn" ? "rose" : "amber"}>
                      {c.consent_status}
                    </Badge>
                  </td>
                  <td>{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span>{list.data.count} records</span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="secondary" disabled={(page + 1) * PAGE >= list.data.count} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
      <Modal open={open} title="New contact" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          {dupWarning ? <p className="text-sm text-rose-700">{dupWarning}</p> : null}
          <Field label="Full name" error={form.formState.errors.full_name?.message}>
            <Input {...form.register("full_name")} />
          </Field>
          <Field label="Company">
            <Input {...form.register("company_name")} />
          </Field>
          <Field label="Email">
            <Input type="email" {...form.register("primary_email")} />
          </Field>
          <Field label="Phone">
            <Input {...form.register("primary_phone")} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="City">
              <Input {...form.register("city")} />
            </Field>
            <Field label="Country">
              <Input {...form.register("country")} />
            </Field>
          </div>
          <Field label="IT service interest">
            <Input {...form.register("service_interest")} />
          </Field>
          <Field label="Lead source">
            <Input {...form.register("lead_source")} />
          </Field>
          <Field label="Status">
            <Select {...form.register("lead_status")}>
              {["new", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select {...form.register("priority")}>
              {["low", "medium", "high", "urgent"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Consent">
            <Select {...form.register("consent_status")}>
              {["unknown", "granted", "withdrawn"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Assigned to">
            <MemberSelect value={form.watch("assigned_to")} onChange={(v) => form.setValue("assigned_to", v)} />
          </Field>
          <Field label="Notes">
            <Textarea {...form.register("notes")} />
          </Field>
          <Button type="submit" disabled={create.isPending}>
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
