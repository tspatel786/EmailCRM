import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { canWrite, projectFormSchema } from "@crm/shared";
import type { z } from "zod";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from "../components/ui";
import { MemberSelect } from "./Companies";

type Form = z.infer<typeof projectFormSchema>;

interface Milestone {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ProjectMember {
  project_id: string;
  user_id: string;
  profiles?: { full_name?: string } | null;
}

interface ProjectRow {
  id: string;
  name: string;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  deadline: string | null;
  notes: string | null;
  created_at: string;
  contact_id: string | null;
  contacts?: { full_name?: string } | null;
}

export function ProjectsPage() {
  const { org, user } = useSession();
  const writable = canWrite(org?.role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDue, setNewMilestoneDue] = useState("");
  const [selectedMemberToAdd, setSelectedMemberToAdd] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const form = useForm<Form>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: "", status: "planning" },
  });

  const editForm = useForm<{
    name: string;
    status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
    deadline?: string;
    notes?: string;
  }>();

  const list = useQuery({
    queryKey: ["projects", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, contacts(full_name)")
        .eq("organization_id", org!.organization_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectRow[];
    },
  });

  // Query milestones for the currently selected project
  const milestones = useQuery({
    queryKey: ["project-milestones", selectedProject?.id],
    enabled: Boolean(selectedProject?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_milestones")
        .select("*")
        .eq("project_id", selectedProject!.id)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Milestone[];
    },
  });

  // Query members for the currently selected project
  const projectMembers = useQuery({
    queryKey: ["project-members", selectedProject?.id],
    enabled: Boolean(selectedProject?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_members")
        .select("project_id, user_id, profiles(full_name)")
        .eq("project_id", selectedProject!.id);
      if (error) throw error;
      type Row = { project_id: string; user_id: string; profiles: { full_name: string } | { full_name: string }[] | null };
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        project_id: r.project_id,
        user_id: r.user_id,
        profiles: Array.isArray(r.profiles) ? r.profiles[0] ?? null : r.profiles,
      })) as ProjectMember[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: Form) => {
      const { error } = await supabase.from("projects").insert({
        ...values,
        organization_id: org!.organization_id,
        created_by: user!.id,
        deadline: values.deadline && values.deadline.trim() ? values.deadline.trim() : null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setPage(1);
      setSearch("");
      setStatusFilter("");
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.refetchQueries({ queryKey: ["projects"] });
      setOpen(false);
      form.reset();
    },
  });

  const updateProject = useMutation({
    mutationFn: async (values: {
      name: string;
      status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
      deadline?: string;
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("projects")
        .update({
          name: values.name,
          status: values.status,
          deadline: values.deadline && values.deadline.trim() ? values.deadline.trim() : null,
          notes: values.notes || null,
        })
        .eq("id", selectedProject!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.refetchQueries({ queryKey: ["projects"] });
      setSelectedProject(null);
    },
  });

  const addMilestone = useMutation({
    mutationFn: async () => {
      if (!newMilestoneTitle.trim() || !selectedProject) return;
      const { error } = await supabase.from("project_milestones").insert({
        organization_id: org!.organization_id,
        project_id: selectedProject.id,
        title: newMilestoneTitle.trim(),
        due_date: newMilestoneDue || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewMilestoneTitle("");
      setNewMilestoneDue("");
      void qc.invalidateQueries({ queryKey: ["project-milestones", selectedProject?.id] });
    },
  });

  const toggleMilestone = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("project_milestones")
        .update({ completed_at: completed ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project-milestones", selectedProject?.id] });
    },
  });

  const addMember = useMutation({
    mutationFn: async () => {
      if (!selectedMemberToAdd || !selectedProject) return;
      const { error } = await supabase.from("project_members").insert({
        organization_id: org!.organization_id,
        project_id: selectedProject.id,
        user_id: selectedMemberToAdd,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedMemberToAdd(null);
      void qc.invalidateQueries({ queryKey: ["project-members", selectedProject?.id] });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      if (!selectedProject) return;
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", selectedProject.id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project-members", selectedProject?.id] });
    },
  });

  const openProjectDetail = (p: ProjectRow) => {
    setSelectedProject(p);
    editForm.reset({
      name: p.name,
      status: p.status,
      deadline: p.deadline ?? "",
      notes: p.notes ?? "",
    });
  };

  const filtered = (list.data ?? []).filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      const matchName = p.name.toLowerCase().includes(s);
      const matchClient = p.contacts?.full_name?.toLowerCase().includes(s);
      return matchName || matchClient;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const statusTone = (st: string): "slate" | "green" | "amber" | "rose" | "teal" => {
    if (st === "completed") return "green";
    if (st === "active") return "teal";
    if (st === "planning") return "slate";
    if (st === "on_hold") return "amber";
    if (st === "cancelled") return "rose";
    return "slate";
  };

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Track delivery projects, team assignment, and milestones."
        actions={
          writable ? (
            <Button
              type="button"
              onClick={() => {
                create.reset();
                form.reset({ name: "", status: "planning" });
                setOpen(true);
              }}
            >
              New project
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {["planning", "active", "on_hold", "completed", "cancelled"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Input
          placeholder="Search by project name or client..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
      </div>

      {!pageItems.length ? (
        <Empty title="No projects found" hint={search ? "Try adjusting your filters" : "Create a project to start tracking milestones."} />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Name</th>
                <th>Client</th>
                <th>Status</th>
                <th>Deadline</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2 font-medium">{p.name}</td>
                  <td>{p.contacts?.full_name ?? "—"}</td>
                  <td>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </td>
                  <td>{p.deadline ?? "—"}</td>
                  <td>
                    <Button variant="ghost" onClick={() => openProjectDetail(p)}>
                      View & Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
              <span className="text-slate-500">
                Page {page} of {totalPages} ({filtered.length} projects)
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

      {/* New Project Modal */}
      <Modal open={open} title="New project" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          {create.error ? (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
              {(create.error as Error).message || "Failed to create project"}
            </div>
          ) : null}
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} />
          </Field>
          <Field label="Status">
            <Select {...form.register("status")}>
              {["planning", "active", "on_hold", "completed", "cancelled"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Deadline">
            <Input type="date" {...form.register("deadline")} />
          </Field>
          <Field label="Notes">
            <Textarea {...form.register("notes")} />
          </Field>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating..." : "Save"}
          </Button>
        </form>
      </Modal>

      {/* Project Detail & Milestones Modal (H8) */}
      <Modal open={Boolean(selectedProject)} title={`Project: ${selectedProject?.name}`} onClose={() => setSelectedProject(null)}>
        {selectedProject && (
          <div className="space-y-6">
            {/* Edit Details */}
            <form className="space-y-3 border-b border-slate-200 pb-4" onSubmit={editForm.handleSubmit((v) => updateProject.mutate(v))}>
              {updateProject.error ? (
                <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
                  {(updateProject.error as Error).message || "Failed to update project"}
                </div>
              ) : null}
              <h3 className="font-semibold text-slate-800">Project Details</h3>
              <Field label="Project Name">
                <Input {...editForm.register("name")} required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status">
                  <Select {...editForm.register("status")}>
                    {["planning", "active", "on_hold", "completed", "cancelled"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Deadline">
                  <Input type="date" {...editForm.register("deadline")} />
                </Field>
              </div>
              <Field label="Notes">
                <Textarea {...editForm.register("notes")} />
              </Field>
              {writable && (
                <Button type="submit" disabled={updateProject.isPending}>
                  {updateProject.isPending ? "Saving..." : "Update details"}
                </Button>
              )}
            </form>

            {/* Milestones Management */}
            <div className="space-y-3 border-b border-slate-200 pb-4">
              <h3 className="font-semibold text-slate-800">Milestones</h3>
              {milestones.data?.length === 0 ? (
                <p className="text-sm text-slate-500">No milestones yet for this project.</p>
              ) : (
                <ul className="space-y-2">
                  {milestones.data?.map((m) => (
                    <li key={m.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(m.completed_at)}
                          disabled={!writable || toggleMilestone.isPending}
                          onChange={(e) => toggleMilestone.mutate({ id: m.id, completed: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-brand-700"
                        />
                        <span className={m.completed_at ? "line-through text-slate-400" : "font-medium text-slate-800"}>
                          {m.title}
                        </span>
                        {m.due_date && <span className="text-xs text-slate-500">(Due: {m.due_date})</span>}
                      </div>
                      <Badge tone={m.completed_at ? "green" : "slate"}>
                        {m.completed_at ? "Done" : "Pending"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}

              {writable && (
                <div className="flex gap-2 pt-2">
                  <Input
                    placeholder="New milestone title"
                    value={newMilestoneTitle}
                    onChange={(e) => setNewMilestoneTitle(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="date"
                    value={newMilestoneDue}
                    onChange={(e) => setNewMilestoneDue(e.target.value)}
                    className="w-36"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!newMilestoneTitle.trim() || addMilestone.isPending}
                    onClick={() => addMilestone.mutate()}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>

            {/* Team Members Management */}
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-800">Team Members</h3>
              {projectMembers.data?.length === 0 ? (
                <p className="text-sm text-slate-500">No assigned team members.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {projectMembers.data?.map((mem) => (
                    <span key={mem.user_id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {mem.profiles?.full_name || mem.user_id}
                      {writable && (
                        <button
                          type="button"
                          className="text-slate-400 hover:text-rose-600"
                          onClick={() => removeMember.mutate(mem.user_id)}
                        >
                          &times;
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {writable && (
                <div className="flex gap-2 pt-1">
                  <div className="flex-1">
                    <MemberSelect value={selectedMemberToAdd} onChange={(val) => setSelectedMemberToAdd(val)} allowEmpty />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!selectedMemberToAdd || addMember.isPending}
                    onClick={() => addMember.mutate()}
                  >
                    Assign Member
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
