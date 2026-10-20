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
  ExternalLink,
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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col justify-between overflow-y-auto bg-slate-900 text-slate-100 transition lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div>
          {/* S.M.PATEL IT HUB Brand Header */}
          <div className="flex items-center gap-3 border-b border-slate-800/80 px-4 py-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-md">
              <img
                src="/logo.png"
                alt="S.M.PATEL IT HUB"
                className="h-9 w-9 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/favicon.png";
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold tracking-tight text-white font-['Space_Grotesk']">
                S.M.PATEL IT HUB
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Enterprise CRM
              </div>
            </div>
          </div>

          <nav className="space-y-0.5 px-3 py-4">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-amber-500 font-semibold text-slate-950 shadow-sm"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer with Company Contact and Website */}
        <div className="border-t border-slate-800/80 p-3 text-xs text-slate-400">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">S.M.PATEL IT HUB</span>
              <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">MH-IN</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Solapur, Maharashtra • +91 90964 27821</p>
            <a
              href="https://smpatelithub.in"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-400/20 transition"
            >
              <ExternalLink size={12} /> Visit smpatelithub.in
            </a>
          </div>
        </div>
      </aside>

      <div className="flex flex-col min-w-0 min-h-screen">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 sm:px-6 backdrop-blur shadow-sm">
          <button className="lg:hidden text-slate-700" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="flex flex-1 items-center gap-3">
            {memberships.length > 1 ? (
              <select
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium text-slate-800"
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
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">{org?.organizations.name}</span>
                <span className="hidden rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800 sm:inline">
                  {org?.role}
                </span>
              </div>
            )}
            <a
              href="https://smpatelithub.in"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:inline-flex transition"
            >
              <ExternalLink size={12} className="text-amber-600" /> smpatelithub.in
            </a>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                className="relative text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
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
                  <span className="absolute -right-0.5 -top-0.5 rounded-full bg-rose-600 px-1.5 py-0.2 text-[10px] font-bold text-white shadow-sm">{unread}</span>
                ) : null}
              </button>
              {notesOpen ? (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border bg-white p-2 text-sm shadow-xl z-50">
                  {!notes.data?.length ? (
                    <p className="p-3 text-slate-500 text-center text-xs">No new notifications</p>
                  ) : (
                    notes.data.map((n) => (
                      <button
                        key={n.id}
                        className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition"
                        onClick={() => {
                          setNotesOpen(false);
                          if (n.link_path) navigate(n.link_path);
                        }}
                      >
                        <span className="font-semibold text-slate-900 block text-xs">{n.title}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">{n.body}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <span className="hidden text-xs font-medium text-slate-600 sm:inline">{user?.email}</span>
            <Button
              variant="ghost"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/login");
              }}
              className="text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut size={15} /> Logout
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
