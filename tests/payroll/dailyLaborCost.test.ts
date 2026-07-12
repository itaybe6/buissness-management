import { describe, expect, it } from "vitest";
import { aggregateDailyLaborCosts, employerCostFromRow } from "@/lib/payrollDailyCost";
import type { Profile, Tip } from "@/types/database";

const hourlyEmployee: Profile = {
  id: "e1",
  business_id: "b1",
  department_id: null,
  full_name: "Hourly",
  role: "employee",
  active: true,
  wage_type: "hourly",
  hourly_rate: 50,
  bonus_pct: 0,
  email: null,
  phone: null,
  avatar_url: null,
  created_at: "",
  updated_at: "",
};

const tipsEmployee: Profile = {
  ...hourlyEmployee,
  id: "e2",
  full_name: "Tips",
  wage_type: "tips",
  hourly_rate: 40,
};

describe("employerCostFromRow", () => {
  it("counts hourly salary for hourly employees", () => {
    const cost = employerCostFromRow({
      id: "1",
      date: new Date("2026-07-10T12:00:00"),
      title: "משמרת",
      timeLabel: null,
      hours: 5,
      hourly: 50,
      earned: 250,
      isTips: false,
    });
    expect(cost).toEqual({ hours: 5, hourly: 250, topup: 0, bonus: 0 });
  });

  it("counts only top-up for tips employees, not customer tips", () => {
    const cost = employerCostFromRow({
      id: "2",
      date: new Date("2026-07-10T12:00:00"),
      title: "משמרת",
      timeLabel: null,
      hours: 5,
      hourly: 40,
      earned: 200,
      isTips: true,
      tipAmount: 100,
      topup: 100,
    });
    expect(cost).toEqual({ hours: 5, hourly: 0, topup: 100, bonus: 0 });
  });
});

describe("aggregateDailyLaborCosts", () => {
  it("aggregates hourly and top-up costs by date", () => {
    const tips: Tip[] = [
      {
        id: "t1",
        business_id: "b1",
        employee_id: "e2",
        shift_date: "2026-07-10",
        shift_template_id: null,
        shift_report_id: null,
        amount: 100,
        hours: 5,
        hourly_from_tips: 20,
        created_at: "",
      },
    ];

    const days = aggregateDailyLaborCosts({
      profiles: [hourlyEmployee, tipsEmployee],
      attendance: [
        {
          id: "a1",
          business_id: "b1",
          employee_id: "e1",
          clock_in: "2026-07-10T10:00:00",
          clock_out: "2026-07-10T15:00:00",
          created_at: "",
        },
      ],
      tips,
      bonuses: [],
      templates: [],
    });

    const day = days.find((d) => d.date === "2026-07-10");
    expect(day?.hours).toBe(10);
    expect(day?.hourly).toBe(250);
    expect(day?.topup).toBe(100);
    expect(day?.total).toBe(350);
  });
});
