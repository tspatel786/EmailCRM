import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CONTACT_FIELDS, guessColumnMap, rowToContact, type ContactField } from "@crm/shared";
import { canWrite } from "@crm/shared";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { parseCsv, parseWorkbook } from "../lib/export";
import { Button, Card, Empty, PageHeader, Select } from "../components/ui";

export function ImportExcelPage() {
  const { org, user } = useSession();
  const writable = canWrite(org?.role);
  const qc = useQueryClient();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [map, setMap] = useState<Record<string, ContactField | "skip">>({});
  const [fileName, setFileName] = useState("");
  const [sourceKind, setSourceKind] = useState<"xlsx" | "csv">("xlsx");
  const [preview, setPreview] = useState<Array<{ row: number; ok: boolean; error?: string; email?: string }>>([]);

  const history = useQuery({
    queryKey: ["imports", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .eq("organization_id", org!.organization_id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  async function onFile(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      throw new Error("File exceeds 20 MB limit");
    }
    setFileName(file.name);
    if (file.name.toLowerCase().endsWith(".csv")) {
      setSourceKind("csv");
      const text = await file.text();
      const parsed = parseCsv(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMap(guessColumnMap(parsed.headers));
    } else {
      setSourceKind("xlsx");
      const buf = await file.arrayBuffer();
      const parsed = parseWorkbook(buf);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMap(guessColumnMap(parsed.headers));
    }
  }

  function runPreview() {
    setPreview(
      rows.map((row, i) => {
        const result = rowToContact(row, map);
        return result.ok
          ? { row: i + 2, ok: true, email: result.data.primary_email ?? undefined }
          : { row: i + 2, ok: false, error: result.error };
      }),
    );
  }

  const importMut = useMutation({
    mutationFn: async () => {
      if (!org || !user) throw new Error("Not signed in");
      const { data: batch, error: bErr } = await supabase
        .from("import_batches")
        .insert({
          organization_id: org.organization_id,
          file_name: fileName,
          source_kind: sourceKind,
          status: "importing",
          column_map: map,
          total_rows: rows.length,
          created_by: user.id,
        })
        .select()
        .single();
      if (bErr) throw bErr;

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      for (let i = 0; i < rows.length; i++) {
        const result = rowToContact(rows[i]!, map);
        if (!result.ok) {
          errors += 1;
          await supabase.from("import_errors").insert({
            organization_id: org.organization_id,
            batch_id: batch.id,
            row_number: i + 2,
            raw: rows[i],
            message: result.error,
          });
          continue;
        }
        const payload = result.data;
        if (payload.primary_email) {
          const { data: existing } = await supabase
            .from("contacts")
            .select("id")
            .eq("organization_id", org.organization_id)
            .ilike("primary_email", payload.primary_email)
            .is("archived_at", null)
            .maybeSingle();
          if (existing) {
            const { error } = await supabase
              .from("contacts")
              .update({
                full_name: payload.full_name,
                company_name: payload.company_name,
                primary_phone: payload.primary_phone,
                city: payload.city,
                state: payload.state,
                country: payload.country,
                service_interest: payload.service_interest,
                lead_source: payload.lead_source,
              })
              .eq("id", existing.id);
            if (error) {
              errors += 1;
              await supabase.from("import_errors").insert({
                organization_id: org.organization_id,
                batch_id: batch.id,
                row_number: i + 2,
                raw: rows[i],
                message: error.message,
              });
            } else updated += 1;
            continue;
          }
        }
        const { error } = await supabase.from("contacts").insert({
          organization_id: org.organization_id,
          created_by: user.id,
          email_opt_in: payload.consent_status === "granted",
          ...payload,
        });
        if (error) {
          errors += 1;
          skipped += 1;
          await supabase.from("import_errors").insert({
            organization_id: org.organization_id,
            batch_id: batch.id,
            row_number: i + 2,
            raw: rows[i],
            message: error.message,
          });
        } else created += 1;
      }

      await supabase
        .from("import_batches")
        .update({
          status: "completed",
          created_count: created,
          updated_count: updated,
          skipped_count: skipped,
          error_rows: errors,
          valid_rows: created + updated,
          completed_at: new Date().toISOString(),
        })
        .eq("id", batch.id);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["imports"] }),
  });

  if (!writable) return <Empty title="Viewers cannot import contacts" />;

  return (
    <div>
      <PageHeader title="Import Excel / CSV" subtitle="Map columns, preview validation, then upsert by email within this organization." />
      <Card className="space-y-4">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f).catch((err: Error) => alert(err.message));
          }}
        />
        {headers.length ? (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="p-2 text-left">
                      {h}
                      <Select
                        value={map[h] ?? "skip"}
                        onChange={(e) => setMap((m) => ({ ...m, [h]: e.target.value as ContactField | "skip" }))}
                      >
                        <option value="skip">skip</option>
                        {CONTACT_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </Select>
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" type="button" onClick={runPreview}>
                Preview
              </Button>
              <Button type="button" onClick={() => importMut.mutate()} disabled={importMut.isPending}>
                Import {rows.length} rows
              </Button>
            </div>
          </div>
        ) : null}
        {preview.length ? (
          <div>
            <p className="text-sm">
              Valid {preview.filter((p) => p.ok).length} / {preview.length}
            </p>
            <ul className="mt-2 max-h-40 overflow-auto text-xs text-rose-700">
              {preview
                .filter((p) => !p.ok)
                .slice(0, 50)
                .map((p) => (
                  <li key={p.row}>
                    Row {p.row}: {p.error}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {importMut.isSuccess ? <p className="text-sm text-emerald-700">Import finished. See batch history below.</p> : null}
        {importMut.error ? <p className="text-sm text-rose-700">{(importMut.error as Error).message}</p> : null}
      </Card>
      <h2 className="mt-8 mb-2 font-medium">Batch history</h2>
      {!history.data?.length ? (
        <Empty title="No imports yet" />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">File</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="py-2">{b.file_name}</td>
                  <td>{b.status}</td>
                  <td>{b.created_count}</td>
                  <td>{b.updated_count}</td>
                  <td>{b.error_rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
