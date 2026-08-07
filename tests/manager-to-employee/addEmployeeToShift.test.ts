import { describe, expect, it } from "vitest";
import {
  employeesAvailableToAddToShift,
  filterEmployeesBySearch,
} from "@/lib/addEmployeeToShift";
import { canForceEmployeeClockIn, canForceEmployeeClockOut } from "@/lib/constants";
import { USER } from "../helpers/factories";
import type { Profile, UserRole } from "@/types/database";

function stubProfile(
  id: string,
  overrides: Partial<Pick<Profile, "full_name" | "role" | "active" | "department_id">> = {},
): Pick<Profile, "id" | "full_name" | "role" | "active" | "department_id" | "avatar_url"> {
  return {
    id,
    full_name: overrides.full_name ?? id,
    role: overrides.role ?? "employee",
    active: overrides.active ?? true,
    department_id: overrides.department_id ?? null,
    avatar_url: null,
  };
}

describe("הרשאת אחמ״ש להוספת עובד למשמרת חיה", () => {
  it("מנהל ואחמ״ש יכולים להחתים כניסה לעובד אחר", () => {
    expect(canForceEmployeeClockIn("manager")).toBe(true);
    expect(canForceEmployeeClockIn("shift_manager")).toBe(true);
  });

  it("עובד / מנהלת משרד / אחזקה לא יכולים", () => {
    for (const role of ["employee", "office_manager", "maintenance", "event_manager"] as UserRole[]) {
      expect(canForceEmployeeClockIn(role)).toBe(false);
    }
    expect(canForceEmployeeClockIn(null)).toBe(false);
  });

  it("זהה להרשאת הוצאה כפויה ממשמרת", () => {
    for (const role of [
      "manager",
      "shift_manager",
      "employee",
      "office_manager",
      null,
    ] as const) {
      expect(canForceEmployeeClockIn(role)).toBe(canForceEmployeeClockOut(role));
    }
  });
});

describe("רשימת עובדים שזמינים להוספה למשמרת", () => {
  const team = [
    stubProfile(USER.employee, { full_name: "דני" }),
    stubProfile(USER.employee2, { full_name: "יוסי" }),
    stubProfile(USER.shiftManager, { full_name: "מאיה", role: "shift_manager" }),
    stubProfile("inactive", { full_name: "לא פעיל", active: false }),
    stubProfile("admin", { full_name: "סופר", role: "super_admin" }),
  ];

  it("מסתירה מי שכבר במשמרת, לא פעילים וסופר־אדמין", () => {
    const available = employeesAvailableToAddToShift(team, [USER.employee]);
    // Sorted he-IL by name: יוסי → מאיה
    expect(available.map((u) => u.id)).toEqual([USER.employee2, USER.shiftManager]);
  });

  it("כשכולם במשמרת — הרשימה ריקה", () => {
    const available = employeesAvailableToAddToShift(team, [
      USER.employee,
      USER.employee2,
      USER.shiftManager,
    ]);
    expect(available).toEqual([]);
  });

  it("מסננת לפי שם בחיפוש", () => {
    const available = employeesAvailableToAddToShift(team, []);
    expect(filterEmployeesBySearch(available, "מא").map((u) => u.id)).toEqual([USER.shiftManager]);
    expect(filterEmployeesBySearch(available, "zzz")).toEqual([]);
  });
});
