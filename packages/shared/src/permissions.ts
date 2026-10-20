export const ROLES = [
  "owner",
  "admin",
  "sales_manager",
  "sales_executive",
  "viewer",
] as const;

export type AppRole = (typeof ROLES)[number];

export function canWrite(role: AppRole | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "sales_manager" || role === "sales_executive";
}

export function canManageCampaigns(role: AppRole | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "sales_manager";
}

export function canAdmin(role: AppRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canInviteRole(actor: AppRole, target: AppRole): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner";
  return false;
}

export function canViewAudit(role: AppRole | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "sales_manager";
}
