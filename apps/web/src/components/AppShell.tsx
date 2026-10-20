import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileSpreadsheet,
  Phone,
  ListTodo,
  Mail,
  FileText,
  Kanban,
  Receipt,
  Calendar,
  FolderKanban,
  BarChart3,
  Shield,
  Settings,
  ScrollText,
  Bell,
  LogOut,
  Menu,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { Button } from "./ui";

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/companies", label: "Companies", icon: Building2 },
  { to: "/app/contacts", label: "Contacts", icon: Users },
  { to: "/app/import", label: "Import Excel", icon: FileSpreadsheet },
  { to: "/app/calls", label: "Calls", icon: Phone },
  { to: "/app/follow-ups", label: "Follow-ups", icon: ListTodo },
  { to: "/app/campaigns", label: "Campaigns", icon: Mail },
  { to: "/app/templates", label: "Email Templates", icon: FileText },
  { to: "/app/deals", label: "Deals", icon: Kanban },
  { to: "/app/quotations", label: "Quotations", icon: Receipt },
  { to: "/app/meetings", label: "Meetings", icon: Calendar },
  { to: "/app/projects", label: "Projects", icon: FolderKanban },
  { to: "/app/reports", label: "Reports", icon: BarChart3 },
  { to: "/app/team", label: "Team", icon: Shield },
  { to: "/app/settings", label: "Settings", icon: Settings },
  { to: "/app/audit", label: "Audit Logs", icon: ScrollText },
];

export function AppShell() {
  const { user, org, memberships, setOrgId } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient(); // M3: needed to invalidate after mark-read
  const [open, setOpen] = useState(false);

  const [notesOpen, setNotesOpen] = useState(false);
  const { data: unread } = useQuery({
    queryKey: ["unread", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .is("read_at", null);
      return count ?? 0;
    },
  });
  const notes = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: Boolean(user?.id && notesOpen),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, created_at, read_at, link_path")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[260px_1fr]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-slate-900 text-slate-100 transition lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center px-5 text-lg font-semibold tracking-tight">Acme IT CRM</div>
        <nav className="space-y-0.5 px-3 pb-6">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? "bg-brand-700 text-white" : "text-slate-300 hover:bg-slate-800"}`
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="flex flex-1 items-center gap-3">
            {memberships.length > 1 ? (
              <select
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={org?.organization_id}
                onChange={(e) => setOrgId(e.target.value)}
              >
                {memberships.map((m) => (
                  <option key={m.organization_id} value={m.organization_id}>
                    {m.organizations.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-medium text-slate-600">{org?.organizations.name}</span>
            )}
            <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 sm:inline">{org?.role}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                className="relative text-slate-600"
                aria-label="Notifications"
                onClick={async () => {
                  setNotesOpen((v) => !v);
                  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user!.id).is("read_at", null);
                  // M3 fix: invalidate cached unread count and notification list
                  void qc.invalidateQueries({ queryKey: ["unread"] });
                  void qc.invalidateQueries({ queryKey: ["notifications"] });
                }}
              >
                <Bell size={18} />
                {unread ? (
                  <span className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1 text-[10px] text-white">{unread}</span>
                ) : null}
              </button>
              {notesOpen ? (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border bg-white p-2 text-sm shadow-lg">
                  {!notes.data?.length ? (
                    <p className="p-2 text-slate-500">No notifications</p>
                  ) : (
                    notes.data.map((n) => (
                      <button
                        key={n.id}
                        className="block w-full rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                        onClick={() => {
                          setNotesOpen(false);
                          if (n.link_path) navigate(n.link_path);
                        }}
                      >
                        <span className="font-medium">{n.title}</span>
                        <span className="block text-xs text-slate-500">{n.body}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <span className="hidden text-sm text-slate-600 sm:inline">{user?.email}</span>
            <Button
              variant="ghost"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/login");
              }}
            >
              <LogOut size={16} /> Logout
            </Button>
          </div>
        </header>
        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
