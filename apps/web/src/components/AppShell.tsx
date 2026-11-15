import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileSpreadsheet,
  Phone,
  ListTodo,
  Mail,
  Megaphone,
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
  X,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { cn } from "./ui";

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

// Same routes and labels as before, grouped for scannability.
const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/app/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    title: "CRM",
    items: [
      { to: "/app/companies", label: "Companies", icon: Building2 },
      { to: "/app/contacts", label: "Contacts", icon: Users },
      { to: "/app/import", label: "Import Excel", icon: FileSpreadsheet },
      { to: "/app/deals", label: "Deals", icon: Kanban },
      { to: "/app/quotations", label: "Quotations", icon: Receipt },
      { to: "/app/projects", label: "Projects", icon: FolderKanban },
    ],
  },
  {
    title: "Activity",
    items: [
      { to: "/app/calls", label: "Calls", icon: Phone },
      { to: "/app/follow-ups", label: "Follow-ups", icon: ListTodo },
      { to: "/app/meetings", label: "Meetings", icon: Calendar },
    ],
  },
  {
    title: "Email",
    items: [
      { to: "/app/mails", label: "Mails", icon: Mail },
      { to: "/app/campaigns", label: "Campaigns", icon: Megaphone },
      { to: "/app/templates", label: "Email Templates", icon: FileText },
    ],
  },
  {
    title: "Administration",
    items: [
      { to: "/app/team", label: "Team", icon: Shield },
      { to: "/app/settings", label: "Settings", icon: Settings },
      { to: "/app/audit", label: "Audit Logs", icon: ScrollText },
    ],
  },
];

const allNav = navGroups.flatMap((g) => g.items);

function useBreadcrumbs(pathname: string) {
  if (pathname === "/app" || pathname === "/app/") return [{ label: "Dashboard" }];
  const match = [...allNav].filter((n) => n.to !== "/app").sort((a, b) => b.to.length - a.to.length).find((n) => pathname.startsWith(n.to));
  if (!match) return [{ label: "Dashboard", to: "/app" }];
  const crumbs: { label: string; to?: string }[] = [{ label: "Dashboard", to: "/app" }, { label: match.label, to: match.to }];
  if (pathname.length > match.to.length + 1) crumbs.push({ label: "Details" });
  crumbs[crumbs.length - 1] = { label: crumbs[crumbs.length - 1]!.label };
  return crumbs;
}

/** Closes a popover when clicking outside it or pressing Escape. */
function useDismiss(ref: RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, onClose]);
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem("crm.sidebarCollapsed") === "1";
  } catch {
    return false;
  }
}

export function AppShell() {
  const { user, org, memberships, setOrgId } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient(); // M3: needed to invalidate after mark-read
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(readCollapsed); // desktop sidebar
  const [notesOpen, setNotesOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const crumbs = useBreadcrumbs(location.pathname);

  useDismiss(notesRef, notesOpen, () => setNotesOpen(false));
  useDismiss(userRef, userOpen, () => setUserOpen(false));

  // Close the mobile drawer on navigation and on Escape; lock body scroll while open.
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      try {
        localStorage.setItem("crm.sidebarCollapsed", v ? "0" : "1");
      } catch {
        /* storage unavailable: keep in-memory state only */
      }
      return !v;
    });
  }

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

  async function logout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const isCollapsed = collapsed; // desktop only; the mobile drawer is always expanded

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Mobile backdrop */}
      {open ? <div className="fixed inset-0 z-40 animate-fade-in bg-ink-950/50 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}

      {/* ------------------------------ Sidebar ------------------------------ */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] flex-col bg-ink-950 text-ink-200 shadow-pop transition-[transform,width] duration-200 ease-out lg:z-30 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isCollapsed && "lg:w-[var(--sidebar-collapsed)]",
        )}
        aria-label="Main navigation"
      >
        {/* Brand */}
        <div className={cn("flex h-[var(--topbar-height)] shrink-0 items-center gap-3 border-b border-white/[0.06] px-4", isCollapsed && "lg:justify-center lg:px-0")}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-md ring-1 ring-white/10">
            <img
              src="/logo.png"
              alt="S.M.PATEL IT HUB"
              className="h-8 w-8 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/favicon.png";
              }}
            />
          </div>
          <div className={cn("min-w-0 flex-1", isCollapsed && "lg:hidden")}>
            <div className="truncate font-display text-sm font-bold tracking-tight text-white">S.M.PATEL IT HUB</div>
            <div className="flex items-center gap-1.5 text-2xs font-medium text-primary-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Enterprise CRM
            </div>
          </div>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.title}>
              <p className={cn("mb-1.5 px-3 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-500", isCollapsed && "lg:hidden")}>
                {group.title}
              </p>
              {isCollapsed ? <div className="mx-auto mb-2 hidden h-px w-8 bg-white/[0.06] lg:block" /> : null}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={isCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150",
                        isCollapsed && "lg:justify-center lg:px-0",
                        isActive
                          ? "bg-primary-500/[0.12] font-semibold text-primary-300"
                          : "text-ink-300 hover:bg-white/[0.06] hover:text-white",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary-400" aria-hidden /> : null}
                        <item.icon size={18} className={cn("shrink-0", isActive ? "text-primary-400" : "text-ink-400 group-hover:text-ink-200")} />
                        <span className={cn("truncate", isCollapsed && "lg:sr-only")}>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer: company contact (expanded) + collapse toggle (desktop) */}
        <div className="shrink-0 border-t border-white/[0.06] p-3">
          <div className={cn("mb-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-xs", isCollapsed && "lg:hidden")}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink-200">S.M.PATEL IT HUB</span>
              <span className="rounded bg-primary-400/10 px-1.5 py-0.5 text-[10px] font-bold text-primary-400">MH-IN</span>
            </div>
            <p className="mt-1 text-2xs text-ink-400">Solapur, Maharashtra • +91 90964 27821</p>
            <a
              href="https://smpatelithub.in"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-primary-400/25 bg-primary-400/10 text-2xs font-semibold text-primary-300 transition hover:bg-primary-400/20"
            >
              <ExternalLink size={12} /> Visit smpatelithub.in
            </a>
          </div>
          <button
            onClick={toggleCollapsed}
            className="hidden min-h-9 w-full items-center justify-center gap-2 rounded-lg text-xs font-medium text-ink-400 transition hover:bg-white/[0.06] hover:text-white lg:flex"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* ------------------------------ Main column ------------------------------ */}
      <div className={cn("flex min-h-screen min-w-0 flex-col transition-[padding] duration-200 lg:pl-[var(--sidebar-width)]", isCollapsed && "lg:pl-[var(--sidebar-collapsed)]")}>
        <header className="sticky top-0 z-20 flex h-[var(--topbar-height)] shrink-0 items-center gap-2 border-b border-ink-200/80 bg-white/90 px-3 backdrop-blur-md sm:gap-3 sm:px-6">
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          {/* Breadcrumbs (desktop) / current page (mobile) */}
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="hidden items-center gap-1.5 text-sm md:flex">
              {crumbs.map((c, i) => (
                <li key={i} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 ? <ChevronRight size={14} className="shrink-0 text-ink-300" /> : null}
                  {c.to ? (
                    <Link to={c.to} className="truncate text-ink-500 transition hover:text-ink-900">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="truncate font-semibold text-ink-900">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
            <span className="block truncate text-sm font-semibold text-ink-900 md:hidden">{crumbs[crumbs.length - 1]?.label}</span>
          </nav>

          {/* Organization switcher */}
          {memberships.length > 1 ? (
            <select
              className="select-chevron hidden min-h-9 max-w-[200px] cursor-pointer appearance-none truncate rounded-lg border border-ink-200 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-ink-800 hover:border-ink-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 sm:block"
              value={org?.organization_id}
              onChange={(e) => setOrgId(e.target.value)}
              aria-label="Switch organization"
            >
              {memberships.map((m) => (
                <option key={m.organization_id} value={m.organization_id}>
                  {m.organizations.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="hidden items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-1.5 xl:flex">
              <Building2 size={14} className="text-ink-400" />
              <span className="max-w-[180px] truncate text-sm font-medium text-ink-800">{org?.organizations.name}</span>
            </div>
          )}

          <a
            href="https://smpatelithub.in"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 2xl:inline-flex"
          >
            <ExternalLink size={13} className="text-primary-600" /> smpatelithub.in
          </a>

          {/* Notifications */}
          <div className="relative" ref={notesRef}>
            <button
              className={cn("relative flex h-10 w-10 items-center justify-center rounded-lg text-ink-600 transition hover:bg-ink-100 hover:text-ink-900", notesOpen && "bg-ink-100 text-ink-900")}
              aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
              aria-expanded={notesOpen}
              onClick={async () => {
                setNotesOpen((v) => !v);
                setUserOpen(false);
                await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user!.id).is("read_at", null);
                // M3 fix: invalidate cached unread count and notification list
                void qc.invalidateQueries({ queryKey: ["unread"] });
                void qc.invalidateQueries({ queryKey: ["notifications"] });
              }}
            >
              <Bell size={19} />
              {unread ? (
                <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </button>
            {notesOpen ? (
              <div className="fixed inset-x-3 top-[calc(var(--topbar-height)+0.5rem)] z-50 animate-scale-in overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80">
                <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                  <p className="text-sm font-semibold text-ink-900">Notifications</p>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-1.5">
                  {!notes.data?.length ? (
                    <div className="flex flex-col items-center px-3 py-8 text-center">
                      <Bell size={20} className="mb-2 text-ink-300" />
                      <p className="text-xs text-ink-500">No new notifications</p>
                    </div>
                  ) : (
                    notes.data.map((n) => (
                      <button
                        key={n.id}
                        className="block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-ink-50"
                        onClick={() => {
                          setNotesOpen(false);
                          if (n.link_path) navigate(n.link_path);
                        }}
                      >
                        <span className="block text-sm font-medium text-ink-900">{n.title}</span>
                        <span className="mt-0.5 block text-xs text-ink-500">{n.body}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* User menu */}
          <div className="relative" ref={userRef}>
            <button
              className={cn("flex min-h-10 items-center gap-2 rounded-lg py-1 pl-1 pr-1 transition hover:bg-ink-100 sm:pr-2", userOpen && "bg-ink-100")}
              onClick={() => {
                setUserOpen((v) => !v);
                setNotesOpen(false);
              }}
              aria-expanded={userOpen}
              aria-label="Account menu"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-xs font-bold text-ink-950 ring-2 ring-white">
                {initials}
              </span>
              <span className="hidden max-w-[160px] text-left lg:block">
                <span className="block truncate text-xs font-semibold text-ink-900">{user?.email}</span>
                <span className="block text-2xs capitalize text-ink-500">{org?.role?.replace(/_/g, " ")}</span>
              </span>
              <ChevronDown size={14} className="hidden text-ink-400 lg:block" />
            </button>
            {userOpen ? (
              <div className="absolute right-0 z-50 mt-2 w-64 animate-scale-in overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop">
                <div className="border-b border-ink-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-ink-900">{user?.email}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">{org?.organizations.name}</p>
                  {org?.role ? (
                    <span className="mt-2 inline-flex rounded-full bg-primary-50 px-2 py-0.5 text-2xs font-semibold capitalize text-primary-800 ring-1 ring-inset ring-primary-200">
                      {org.role.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </div>
                {memberships.length > 1 ? (
                  <div className="border-b border-ink-100 p-3 sm:hidden">
                    <label className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-ink-500">Organization</label>
                    <select
                      className="select-chevron min-h-10 w-full appearance-none rounded-lg border border-ink-200 bg-white py-2 pl-3 pr-8 text-sm text-ink-800"
                      value={org?.organization_id}
                      onChange={(e) => setOrgId(e.target.value)}
                    >
                      {memberships.map((m) => (
                        <option key={m.organization_id} value={m.organization_id}>
                          {m.organizations.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="p-1.5">
                  <Link
                    to="/app/settings"
                    onClick={() => setUserOpen(false)}
                    className="flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm text-ink-700 transition hover:bg-ink-50"
                  >
                    <Settings size={16} className="text-ink-400" /> Settings
                  </Link>
                  <button
                    onClick={logout}
                    className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    <LogOut size={16} /> Logout
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        <main className="relative mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
