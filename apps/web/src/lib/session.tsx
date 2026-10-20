import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { AppRole } from "@crm/shared";

export type Membership = {
  id: string;
  organization_id: string;
  role: AppRole;
  status: string;
  organizations: { id: string; name: string; slug: string; timezone: string; daily_email_limit: number };
};

type Ctx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  memberships: Membership[];
  org: Membership | null;
  setOrgId: (id: string) => void;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [orgId, setOrgId] = useState<string | null>(localStorage.getItem("crm.org"));

  async function loadMemberships(userId: string) {
    const { data, error } = await supabase
      .from("memberships")
      .select("id, organization_id, role, status, organizations(id, name, slug, timezone, daily_email_limit)")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw error;
    const rows = (data ?? []).map((row) => {
      const raw = row as unknown as Membership & { organizations: Membership["organizations"] | Membership["organizations"][] };
      const organizations = Array.isArray(raw.organizations) ? raw.organizations[0] : raw.organizations;
      return { ...raw, organizations } as Membership;
    });
    setMemberships(rows.filter((r) => r.organizations));
    if (rows.length && (!orgId || !rows.some((m) => m.organization_id === orgId))) {
      setOrgId(rows[0]!.organization_id);
      localStorage.setItem("crm.org", rows[0]!.organization_id);
    }
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session?.user) await loadMemberships(data.session.user.id);
    else setMemberships([]);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) void loadMemberships(next.user.id);
      else setMemberships([]);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const org = useMemo(
    () => memberships.find((m) => m.organization_id === orgId) ?? memberships[0] ?? null,
    [memberships, orgId],
  );

  const value: Ctx = {
    session,
    user: session?.user ?? null,
    loading,
    memberships,
    org,
    setOrgId: (id) => {
      setOrgId(id);
      localStorage.setItem("crm.org", id);
    },
    refresh,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside provider");
  return ctx;
}
