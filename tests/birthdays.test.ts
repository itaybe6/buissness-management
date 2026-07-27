import { describe, expect, it } from "vitest";
import {
  birthdayAge,
  isBirthdayToday,
  profilesWithBirthdayToday,
} from "@/lib/birthdays";
import type { Profile } from "@/types/database";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    business_id: "biz",
    department_id: null,
    full_name: "Test User",
    avatar_url: null,
    email: "t@example.com",
    phone: null,
    role: "employee",
    hourly_rate: 35,
    wage_type: "hourly",
    bonus_pct: 0,
    pension_active: false,
    birth_date: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("birthdays", () => {
  const today = new Date(2026, 6, 27); // Jul 27, 2026

  it("matches month/day regardless of birth year", () => {
    expect(isBirthdayToday("1998-07-27", today)).toBe(true);
    expect(isBirthdayToday("2001-07-26", today)).toBe(false);
  });

  it("computes age on birthday", () => {
    expect(birthdayAge("1998-07-27", today)).toBe(28);
  });

  it("returns active employees with birthday today", () => {
    const list = profilesWithBirthdayToday(
      [
        profile({ id: "a", birth_date: "1990-07-27" }),
        profile({ id: "b", birth_date: "1995-08-01", active: false }),
        profile({ id: "c", birth_date: null }),
      ],
      today,
    );
    expect(list.map((p) => p.id)).toEqual(["a"]);
  });
});
