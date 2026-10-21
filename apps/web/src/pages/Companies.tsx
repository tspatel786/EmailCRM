import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { companyFormSchema, canWrite } from "@crm/shared";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { downloadWorkbook } from "../lib/export";
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from "../components/ui";
import { z } from "zod";

type Form = z.infer<typeof companyFormSchema>;

export function CompaniesPage() {
  const { org } = useSession();
  const qc = useQueryClient();
  const writable = canWrite(org?.role);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const form = useForm<Form>({ resolver: zodResolver(companyFormSchema), defaultValues: { name: "" } });

  const list = useQuery({
    queryKey: ["companies", org?.organization_id, q, page],
    enabled: Boolean(org),
    queryFn: async () => {
      let query = supabase
        .from("companies")
        .select("*", { count: "exact" })
        .eq("organization_id", org!.organization_id)
        .is("archived_at", null)
        .order("name")
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const create = useMutation({
    mutationFn: async (values: Form) => {
      const { error } = await supabase.from("companies").insert({
        ...values,
        organization_id: org!.organization_id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setPage(1);
      setQ("");
      await qc.invalidateQueries({ queryKey: ["companies"] });
      await qc.refetchQueries({ queryKey: ["companies"] });
      setOpen(false);
      form.reset();
    },
  });

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      let query = supabase
        .from("companies")
        .select("*")
        .eq("organization_id", org!.organization_id)
        .is("archived_at", null)
        .order("name");
      if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []).map((c, idx) => ({
        "Sr No": idx + 1,
        "Company Name": c.name || "",
        "Industry": c.industry || "",
        "City": c.city || "",
        "State": c.state || "",
        "Country": c.country || "",
        "Website": c.website || "",
        "Phone": c.phone || "",
        "Created Date": c.created_at ? new Date(c.created_at).toLocaleDateString() : "",
      }));

      downloadWorkbook(
        `SMPatel_Companies_${new Date().toISOString().slice(0, 10)}.xlsx`,
        rows,
        "Companies"
      );
    } catch (err) {
      console.error("Companies export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize));

  return (
    <div>
      <PageHeader
        title="Companies"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? "Exporting…" : "Export Excel"}
            </Button>
            {writable ? (
              <Button
                onClick={() => {
                  create.reset();
                  form.reset();
                  setOpen(true);
                }}
                type="button"
              >
                + New Company
              </Button>
            ) : null}
          </div>
        }
      />
      <Input
        className="mb-4 max-w-sm"
        placeholder="Search companies by name..."
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      {!list.data?.rows.length ? (
        <Empty title="No companies" hint={q ? "No companies matched your search." : "Create a company or import contacts with a company name."} />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Name</th>
                <th>City</th>
                <th>Website</th>
              </tr>
            </thead>
            <tbody>
              {list.data.rows.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2 font-medium">{c.name}</td>
                  <td>{c.city ?? "—"}</td>
                  <td>
                    {c.website ? (
                      <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                        {c.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
              <span className="text-slate-500">
                Page {page} of {totalPages} ({list.data.total} companies)
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Modal open={open} title="New company" onClose={() => setOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit(
            (v) => create.mutate(v),
            (errors) => console.warn("Company validation errors:", errors)
          )}
        >
          {create.error ? (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
              {(create.error as Error).message || "Failed to save company"}
            </div>
          ) : null}

          {Object.keys(form.formState.errors).length > 0 && !create.error ? (
            <div className="rounded-lg bg-amber-50 p-2.5 text-xs font-medium text-amber-800 border border-amber-200">
              Please fix the required fields highlighted below before saving.
            </div>
          ) : null}

          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input placeholder="e.g. Acme Technologies" {...form.register("name")} />
          </Field>
          <Field label="Website" error={form.formState.errors.website?.message}>
            <Input placeholder="https://example.com" {...form.register("website")} />
          </Field>
          <Field label="City" error={form.formState.errors.city?.message}>
            <Input placeholder="e.g. Mumbai" {...form.register("city")} />
          </Field>
          <Field label="State" error={form.formState.errors.state?.message}>
            <Input placeholder="e.g. Maharashtra" {...form.register("state")} />
          </Field>
          <Field label="Country" error={form.formState.errors.country?.message}>
            <Input placeholder="e.g. India" {...form.register("country")} />
          </Field>
          <Field label="Notes" error={form.formState.errors.notes?.message}>
            <Textarea rows={3} placeholder="Company details..." {...form.register("notes")} />
          </Field>
          <Button type="submit" disabled={create.isPending} className="w-full">
            {create.isPending ? "Saving..." : "Save Company"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}

export function MemberSelect({ value, onChange, allowEmpty = true }: { value?: string | null; onChange: (v: string | null) => void; allowEmpty?: boolean }) {
  const { org } = useSession();
  const members = useQuery({
    queryKey: ["members", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id, role, profiles(full_name)")
        .eq("organization_id", org!.organization_id)
        .eq("status", "active");
      if (error) throw error;
      type MemberRow = { user_id: string; role: string; profiles: { full_name: string } | { full_name: string }[] | null };
      return ((data ?? []) as unknown as MemberRow[]).map((row) => ({
        user_id: row.user_id,
        role: row.role,
        profiles: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles,
      }));
    },
  });
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      {allowEmpty ? <option value="">Unassigned</option> : null}
      {(members.data ?? []).map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.profiles?.full_name || m.user_id} ({m.role})
        </option>
      ))}
    </Select>
  );
}
