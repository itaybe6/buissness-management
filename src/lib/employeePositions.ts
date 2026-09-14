import { ROLE_LABELS, WAGE_TYPE_LABELS } from "@/lib/constants";
import type { EmployeePosition, Profile, UserRole, WageType } from "@/types/database";

/**
 * Permission precedence — mirrors `public.position_role_rank` in the schema.
 * The lowest rank across an employee's positions is the "primary" position:
 * it decides `profiles.role` (system access) and is the fallback for legacy
 * rows that were recorded before positions existed.
 */
export const POSITION_ROLE_RANK: Record<UserRole, number> = {
  super_admin: 0,
  manager: 1,
  office_manager: 2,
  shift_manager: 3,
  event_manager: 4,
  employee: 5,
  maintenance: 6,
};

const LEGACY_PREFIX = "legacy:";

/** Synthetic position id used when a profile has no employee_positions rows yet. */
export function legacyPositionId(employeeId: string): string {
  return `${LEGACY_PREFIX}${employeeId}`;
}

export function isLegacyPositionId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(LEGACY_PREFIX);
}

type ProfileLike = Pick<
  Profile,
  "id" | "business_id" | "role" | "department_id" | "wage_type" | "hourly_rate" | "bonus_pct"
> & Partial<Pick<Profile, "created_at">>;

/**
 * Build a position from the profile's own wage fields — what every employee
 * effectively had before multi-position support. Keeps older accounts (and any
 * profile whose positions failed to save) computing exactly as before.
 */
export function legacyPositionFromProfile(profile: ProfileLike): EmployeePosition {
  const created = profile.created_at ?? "1970-01-01T00:00:00.000Z";
  return {
    id: legacyPositionId(profile.id),
    business_id: profile.business_id ?? "",
    employee_id: profile.id,
    role: profile.role,
    department_id: profile.department_id ?? null,
    wage_type: profile.wage_type ?? "hourly",
    hourly_rate: Number(profile.hourly_rate ?? 0),
    bonus_pct: Number(profile.bonus_pct ?? 0),
    sort_order: 0,
    created_at: created,
    updated_at: created,
  };
}

/** Primary first: lowest permission rank, then manual order, then creation time. */
export function sortPositions(positions: EmployeePosition[]): EmployeePosition[] {
  return [...positions].sort((a, b) => {
    const rank = (POSITION_ROLE_RANK[a.role] ?? 9) - (POSITION_ROLE_RANK[b.role] ?? 9);
    if (rank !== 0) return rank;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at.localeCompare(b.created_at);
  });
}

/**
 * The positions one employee can clock in as, primary first. Falls back to a
 * single synthetic position built from the profile when none are stored.
 */
export function positionsForEmployee(
  profile: ProfileLike,
  allPositions: EmployeePosition[] | null | undefined,
): EmployeePosition[] {
  const mine = (allPositions ?? []).filter((p) => p.employee_id === profile.id);
  if (mine.length === 0) return [legacyPositionFromProfile(profile)];
  return sortPositions(mine);
}

export function primaryPosition(positions: EmployeePosition[]): EmployeePosition | null {
  return sortPositions(positions)[0] ?? null;
}

/** System access level = the highest-privilege role among the positions. */
export function accessRoleForPositions(positions: { role: UserRole }[], fallback: UserRole = "employee"): UserRole {
  let best: UserRole | null = null;
  for (const p of positions) {
    if (best === null || (POSITION_ROLE_RANK[p.role] ?? 9) < (POSITION_ROLE_RANK[best] ?? 9)) best = p.role;
  }
  return best ?? fallback;
}

export function hasTipsPosition(positions: { wage_type: WageType }[]): boolean {
  return positions.some((p) => p.wage_type === "tips");
}

/**
 * Human label for a position. A plain employee is named by department
 * ("מלצרות"), everyone else by role, with the department appended when set.
 */
export function positionLabel(
  position: Pick<EmployeePosition, "role" | "department_id">,
  deptName?: (id: string) => string | null | undefined,
): string {
  const dept = position.department_id ? deptName?.(position.department_id) ?? null : null;
  const roleLabel = ROLE_LABELS[position.role] ?? position.role;
  if (position.role === "employee") return dept || roleLabel;
  return dept ? `${roleLabel} · ${dept}` : roleLabel;
}

/** "שעתי · ‎45 ₪/שע׳" / "טיפים · מינ׳ 35 ₪" style summary for lists. */
export function positionWageSummary(
  position: Pick<EmployeePosition, "wage_type" | "hourly_rate" | "bonus_pct">,
  formatCurrency: (n: number) => string,
): string {
  const type = WAGE_TYPE_LABELS[position.wage_type ?? "hourly"];
  const rate = Number(position.hourly_rate ?? 0);
  const bonus = Number(position.bonus_pct) > 0 ? ` · ${position.bonus_pct}% קופה` : "";
  if (position.wage_type === "tips") return `${type} · מינ׳ ${formatCurrency(rate)}${bonus}`;
  return `${type} · ${formatCurrency(rate)}/שע׳${bonus}`;
}

export interface ResolvePositionOptions {
  /** When the row has no position, prefer the first position with this wage model. */
  preferWageType?: WageType;
  /** When the row has no position, prefer the first position that carries a kupah bonus. */
  preferBonus?: boolean;
}

/**
 * Map a recorded `position_id` (attendance / tips / shift_bonuses) back to one
 * of the employee's positions. Rows saved before positions existed (or whose
 * position was since deleted) fall back by wage model, then to the primary.
 */
export function resolvePosition(
  positionId: string | null | undefined,
  positions: EmployeePosition[],
  options: ResolvePositionOptions = {},
): EmployeePosition {
  if (positions.length === 0) {
    throw new Error("resolvePosition: employee has no positions");
  }
  if (positionId) {
    const exact = positions.find((p) => p.id === positionId);
    if (exact) return exact;
  }
  const sorted = sortPositions(positions);
  if (options.preferWageType) {
    const byWage = sorted.find((p) => p.wage_type === options.preferWageType);
    if (byWage) return byWage;
  }
  if (options.preferBonus) {
    const withBonus = sorted.find((p) => Number(p.bonus_pct) > 0);
    if (withBonus) return withBonus;
  }
  return sorted[0];
}

/** Position an attendance punch belongs to. */
export function attendancePosition(
  row: { position_id?: string | null },
  positions: EmployeePosition[],
): EmployeePosition {
  return resolvePosition(row.position_id, positions);
}

/** Position a tip row belongs to — legacy tips go to the tips position. */
export function tipPosition(row: { position_id?: string | null }, positions: EmployeePosition[]): EmployeePosition {
  return resolvePosition(row.position_id, positions, { preferWageType: "tips" });
}

/** Position a kupah bonus belongs to — legacy bonuses go to the bonus-bearing position. */
export function bonusPosition(row: { position_id?: string | null }, positions: EmployeePosition[]): EmployeePosition {
  return resolvePosition(row.position_id, positions, { preferBonus: true });
}

/** Group rows by the position they resolve to (id → rows). */
export function groupByPosition<T>(
  rows: T[],
  positions: EmployeePosition[],
  resolve: (row: T, positions: EmployeePosition[]) => EmployeePosition,
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const pos = resolve(row, positions);
    const list = out.get(pos.id);
    if (list) list.push(row);
    else out.set(pos.id, [row]);
  }
  return out;
}

/** Editable draft used by the add/edit user forms before rows are persisted. */
export interface PositionDraft {
  /** Existing row id, or a temporary client key for new rows. */
  key: string;
  role: UserRole;
  department_id: string | null;
  wage_type: WageType;
  hourly_rate: string;
  bonus_pct: string;
}

export function draftFromPosition(p: EmployeePosition): PositionDraft {
  return {
    key: p.id,
    role: p.role,
    department_id: p.department_id,
    wage_type: p.wage_type,
    hourly_rate: String(p.hourly_rate ?? 0),
    bonus_pct: String(p.bonus_pct ?? 0),
  };
}

export function newPositionDraft(over: Partial<PositionDraft> = {}): PositionDraft {
  return {
    key: `new-${Math.random().toString(36).slice(2, 10)}`,
    role: "employee",
    department_id: null,
    wage_type: "hourly",
    hourly_rate: "",
    bonus_pct: "0",
    ...over,
  };
}

/** Two positions are duplicates when they share a role and department. */
export function findDuplicatePositionDraft(drafts: PositionDraft[]): PositionDraft | null {
  const seen = new Set<string>();
  for (const d of drafts) {
    const key = `${d.role}|${d.role === "employee" ? d.department_id ?? "" : ""}`;
    if (seen.has(key)) return d;
    seen.add(key);
  }
  return null;
}
