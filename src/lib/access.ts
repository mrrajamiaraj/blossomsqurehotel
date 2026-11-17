// Staff roles and permissions, mirrored from supabase/migrations/20261117203948_rbac.sql.
// The database is the authority (every policy and admin_* function checks
// it); this copy drives menus, labels and early, friendly refusals in the UI.
// tests/db/access-parity.test.ts fails if the two ever differ.

export const ROLES = [
  { code: "owner", name: "Owner", rank: 100, requiresMfa: true },
  { code: "super_admin", name: "Super admin", rank: 90, requiresMfa: true },
  { code: "manager", name: "Manager", rank: 70, requiresMfa: true },
  { code: "finance", name: "Finance", rank: 50, requiresMfa: true },
  { code: "receptionist", name: "Receptionist", rank: 40, requiresMfa: false },
  { code: "content_editor", name: "Content editor", rank: 30, requiresMfa: false },
  { code: "housekeeping", name: "Housekeeping", rank: 20, requiresMfa: false },
] as const;

export type StaffRole = (typeof ROLES)[number]["code"];

export const PERMISSIONS = [
  "bookings.read",
  "bookings.write",
  "guests.read",
  "guests.write",
  "payments.read",
  "payments.record",
  "payments.void",
  "refunds.request",
  "refunds.approve",
  "rates.manage",
  "rooms.manage",
  "housekeeping.read",
  "housekeeping.write",
  "maintenance.manage",
  "inquiries.read",
  "inquiries.manage",
  "content.manage",
  "reviews.moderate",
  "promotions.manage",
  "settings.manage",
  "staff.read",
  "staff.manage",
  "audit.read",
  "reports.read",
  "documents.read",
  "documents.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: ALL,
  super_admin: ALL,
  manager: ALL.filter((p) => p !== "refunds.approve"),
  finance: ["bookings.read", "guests.read", "payments.read", "payments.record", "payments.void", "refunds.request", "refunds.approve", "reports.read"],
  receptionist: [
    "bookings.read", "bookings.write", "guests.read", "guests.write", "payments.read", "payments.record", "refunds.request",
    "housekeeping.read", "housekeeping.write", "inquiries.read", "inquiries.manage", "documents.read", "documents.write",
  ],
  content_editor: ["content.manage", "reviews.moderate"],
  housekeeping: ["housekeeping.read", "housekeeping.write"],
};

export function isStaffRole(v: unknown): v is StaffRole {
  return ROLES.some((r) => r.code === v);
}

export function roleInfo(role: StaffRole) {
  return ROLES.find((r) => r.code === role)!;
}

export const roleName = (role: StaffRole) => roleInfo(role).name;

export function permissionsOf(role: StaffRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/** Roles someone of `myRole` may appoint: strictly below their rank (owners may appoint owners). */
export function assignableRoles(myRole: StaffRole): StaffRole[] {
  const mine = roleInfo(myRole).rank;
  return ROLES.filter((r) => r.rank < mine || (mine === 100 && r.code === "owner")).map((r) => r.code);
}

/** Whether `myRole` may change a colleague currently holding `theirRole`. */
export function canManage(myRole: StaffRole, theirRole: StaffRole): boolean {
  const mine = roleInfo(myRole).rank;
  return mine === 100 || roleInfo(theirRole).rank < mine;
}

/** The admin's view of what the signed-in staff member may do (from my_access()). */
export type Access = {
  role: StaffRole;
  permissions: Permission[];
  requiresMfa: boolean;
  mfaOk: boolean;
};

export function can(access: Pick<Access, "permissions"> | null | undefined, permission: Permission): boolean {
  return Boolean(access?.permissions.includes(permission));
}
