/**
 * המנהל מטפל בתקלות — מהדיווח ועד התשלום.
 *
 * המסלול: אחראי משמרת פותח תקלה → המנהל משייך לאיש אחזקה → הוא מטפל ומגיש
 * מחיר → המנהל מאשר → הסכום נכנס לשכר. כל שלב שנופל בדרך משאיר תקלה פתוחה
 * או כסף שלא שולם, ולכן כולם נבדקים כאן.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countNewFaults, getFaultsSeenAt, markFaultsSeen } from "@/lib/faultNotifications";
import { buildFaultPayRows, faultPayMonthLabel, sumFaultPayAmount } from "@/lib/faultPayrollRows";
import { computeEmployeePayroll } from "@/lib/payrollCompute";
import { FAULTS_PAGE_ROLES, visibleNavItems } from "@/lib/constants";
import { ALL_FEATURE_KEYS } from "@/lib/features";
import { installFakeBrowser, type FakeBrowserEnv } from "../helpers/browserEnv";
import { BUSINESS_ID, USER, makeFault } from "../helpers/factories";
import type { FaultStatus, FeatureKey, UserRole } from "@/types/database";

const ALL_ON = (k: FeatureKey) => ALL_FEATURE_KEYS.includes(k);

let env: FakeBrowserEnv;
beforeEach(() => {
  env = installFakeBrowser();
});
afterEach(() => {
  env.restore();
});

describe("מי נכנס למודול התקלות", () => {
  it("מנהל, אחראי משמרת ואיש אחזקה", () => {
    expect(FAULTS_PAGE_ROLES.sort()).toEqual(["maintenance", "manager", "shift_manager"].sort());
  });

  it("עובד, מנהלת משרד ומנהלת אירועים חסומים", () => {
    for (const role of ["employee", "office_manager", "event_manager"] as UserRole[]) {
      expect(FAULTS_PAGE_ROLES, role).not.toContain(role);
      expect(visibleNavItems(role, ALL_ON).map((i) => i.key), role).not.toContain("faults");
    }
  });

  it("כיבוי מודול התקלות מסיר אותו גם מהמנהל וגם מאיש האחזקה", () => {
    const off = (k: FeatureKey) => k !== "faults";
    expect(visibleNavItems("manager", off).map((i) => i.key)).not.toContain("faults");
    expect(visibleNavItems("maintenance", off).map((i) => i.key)).toEqual(["my-shifts"]);
  });
});

describe("מצבי התקלה", () => {
  const statuses: FaultStatus[] = ["needs_handling", "in_progress", "handled"];

  it("שלושה מצבים בלבד", () => {
    for (const status of statuses) {
      expect(makeFault({ status }).status).toBe(status);
    }
  });

  it("תקלה חדשה נפתחת כ«ממתינה לטיפול» בלי משויך", () => {
    const fault = makeFault();
    expect(fault.status).toBe("needs_handling");
    expect(fault.assigned_to).toBeNull();
    expect(fault.status_updated_by).toBeNull();
  });

  it("המנהל משייך לאיש אחזקה ומעדכן סטטוס — נשמר מי עדכן ומתי", () => {
    const assigned = makeFault({
      status: "in_progress",
      assigned_to: USER.maintenance,
      status_updated_by: USER.manager,
      status_updated_at: "2026-07-08T11:00:00.000Z",
    });
    expect(assigned.assigned_to).toBe(USER.maintenance);
    expect(assigned.status_updated_by).toBe(USER.manager);
    expect(assigned.status_updated_at).toBeTruthy();
  });

  it("תקלה יכולה להיסגר בלי שיוך (המנהל טיפל בעצמו)", () => {
    const handled = makeFault({ status: "handled", assigned_to: null, status_updated_by: USER.manager });
    expect(handled.status).toBe("handled");
    expect(handled.assigned_to).toBeNull();
  });

  it("תקלה עם צילומים שומרת אותם כרשימה", () => {
    const withPhotos = makeFault({ photo_urls: ["a.jpg", "b.jpg"] });
    expect(withPhotos.photo_urls).toHaveLength(2);
    expect(makeFault().photo_urls).toEqual([]);
  });
});

describe("ההתראה שאיש האחזקה מקבל", () => {
  const SEEN = "2026-07-08T12:00:00.000Z";

  it("רק תקלות שממתינות לטיפול מדליקות התראה", () => {
    const faults = [
      makeFault({ status: "needs_handling", created_at: "2026-07-08T13:00:00.000Z" }),
      makeFault({ status: "in_progress", created_at: "2026-07-08T13:30:00.000Z" }),
      makeFault({ status: "handled", created_at: "2026-07-08T14:00:00.000Z" }),
    ];
    expect(countNewFaults(faults, SEEN)).toBe(1);
  });

  it("המנהל שסוגר תקלה מכבה את ההתראה עליה", () => {
    const open = [makeFault({ status: "needs_handling", created_at: "2026-07-08T13:00:00.000Z" })];
    expect(countNewFaults(open, SEEN)).toBe(1);

    const closed = open.map((f) => ({ ...f, status: "handled" as const }));
    expect(countNewFaults(closed, SEEN)).toBe(0);
  });

  it("מעקב «ראיתי» נשמר לכל משתמש ועסק בנפרד", () => {
    markFaultsSeen(USER.maintenance, BUSINESS_ID, SEEN);
    expect(getFaultsSeenAt(USER.maintenance, BUSINESS_ID)).toBe(SEEN);
    expect(getFaultsSeenAt(USER.manager, BUSINESS_ID)).toBeNull();
  });
});

describe("אישור התשלום על התקלה", () => {
  const base = {
    pay_employee_id: USER.maintenance,
    work_price: 850,
    description: "החלפת משאבת מים במקרר",
  };

  it("הוגש מחיר וממתין — עדיין לא כסף", () => {
    const submitted = makeFault({
      ...base,
      pay_approval_status: "pending",
      pay_submitted_at: "2026-07-08T14:00:00.000Z",
    });
    expect(sumFaultPayAmount([submitted], USER.maintenance)).toBe(0);
    expect(buildFaultPayRows([submitted])).toEqual([]);
  });

  it("המנהל אישר — הסכום נכנס לשכר", () => {
    const approved = makeFault({
      ...base,
      pay_approval_status: "approved",
      pay_approved_by: USER.manager,
      pay_approved_at: "2026-07-08T15:00:00.000Z",
    });
    expect(sumFaultPayAmount([approved], USER.maintenance)).toBe(850);
    const rows = buildFaultPayRows([approved]);
    expect(rows[0].earned).toBe(850);
    expect(rows[0].title).toContain("החלפת משאבת מים");
    expect(faultPayMonthLabel(approved)).toContain("ביולי");
  });

  it("המנהל הוריד את המחיר לפני האישור", () => {
    const approvedLower = makeFault({
      ...base,
      work_price: 600,
      pay_approval_status: "approved",
      pay_approved_at: "2026-07-08T15:00:00.000Z",
    });
    expect(sumFaultPayAmount([approvedLower], USER.maintenance)).toBe(600);
  });

  it("אישור בלי מועד אישור לא יוצר שורה — אין תאריך לשבץ בו", () => {
    const broken = makeFault({ ...base, pay_approval_status: "approved", pay_approved_at: null });
    expect(buildFaultPayRows([broken])).toEqual([]);
  });

  it("אישור בלי מחיר לא יוצר שורה", () => {
    const noPrice = makeFault({
      ...base,
      work_price: null,
      pay_approval_status: "approved",
      pay_approved_at: "2026-07-08T15:00:00.000Z",
    });
    expect(buildFaultPayRows([noPrice])).toEqual([]);
  });

  it("כמה תקלות מאושרות מצטברות לסכום אחד בתלוש", () => {
    const faults = [
      makeFault({ ...base, work_price: 850, pay_approval_status: "approved", pay_approved_at: "2026-07-05T10:00:00.000Z" }),
      makeFault({ ...base, work_price: 400, pay_approval_status: "approved", pay_approved_at: "2026-07-20T10:00:00.000Z" }),
    ];
    const sum = sumFaultPayAmount(faults, USER.maintenance);
    expect(sum).toBe(1250);

    const payroll = computeEmployeePayroll({
      wageType: "hourly",
      rate: 0,
      tips: [],
      bonusSum: 0,
      attendanceHours: 0,
      faultPaySum: sum,
    });
    expect(payroll.faultPay).toBe(1250);
    expect(payroll.total).toBe(1250);
  });

  it("איש אחזקה עם שכר שעתי מקבל גם שעות וגם תשלום פר תקלה", () => {
    const payroll = computeEmployeePayroll({
      wageType: "hourly",
      rate: 45,
      tips: [],
      bonusSum: 0,
      attendanceHours: 20,
      faultPaySum: 850,
    });
    expect(payroll.base).toBe(900);
    expect(payroll.faultPay).toBe(850);
    expect(payroll.total).toBe(1750);
  });

  it("תשלום ששויך לעובד אחר לא נספר", () => {
    const other = makeFault({
      ...base,
      pay_employee_id: USER.employee,
      pay_approval_status: "approved",
      pay_approved_at: "2026-07-08T15:00:00.000Z",
    });
    expect(sumFaultPayAmount([other], USER.maintenance)).toBe(0);
  });

  it("השורות ממוינות מהאישור החדש לישן", () => {
    const faults = [
      makeFault({ ...base, id: "old", pay_approval_status: "approved", pay_approved_at: "2026-07-01T10:00:00.000Z" }),
      makeFault({ ...base, id: "new", pay_approval_status: "approved", pay_approved_at: "2026-07-25T10:00:00.000Z" }),
    ];
    expect(buildFaultPayRows(faults).map((r) => r.id)).toEqual(["fault-new", "fault-old"]);
  });
});

describe("מסלול מלא של תקלה", () => {
  it("דיווח → שיוך → טיפול → הגשת מחיר → אישור → תשלום", () => {
    let fault = makeFault({
      id: "fault-flow",
      description: "מזגן לא עובד",
      reported_by: USER.shiftManager,
      status: "needs_handling",
    });
    expect(countNewFaults([fault], "2026-07-08T09:00:00.000Z")).toBe(1);
    expect(sumFaultPayAmount([fault], USER.maintenance)).toBe(0);

    // המנהל משייך
    fault = { ...fault, status: "in_progress", assigned_to: USER.maintenance, status_updated_by: USER.manager };
    expect(countNewFaults([fault], "2026-07-08T09:00:00.000Z")).toBe(0);

    // איש האחזקה סיים והגיש מחיר
    fault = {
      ...fault,
      status: "handled",
      pay_employee_id: USER.maintenance,
      work_price: 620,
      pay_approval_status: "pending",
      pay_submitted_at: "2026-07-08T16:00:00.000Z",
    };
    expect(sumFaultPayAmount([fault], USER.maintenance)).toBe(0);

    // המנהל אישר
    fault = {
      ...fault,
      pay_approval_status: "approved",
      pay_approved_by: USER.manager,
      pay_approved_at: "2026-07-08T17:00:00.000Z",
    };
    expect(sumFaultPayAmount([fault], USER.maintenance)).toBe(620);
    expect(buildFaultPayRows([fault])).toHaveLength(1);
  });
});
