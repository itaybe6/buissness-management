import type { SalaryIssue, SalaryIssueStatus } from "@/types/database";

/**
 * Predefined issue categories employees pick from when reporting.
 * `short` labels the picker tile / filter chip, `hint` is the coaching line
 * shown once a category is chosen, `tone` is the card's identity colour.
 */
export const SALARY_ISSUE_CATEGORIES = [
  {
    value: "wrong_hours",
    label: "חישוב שגוי של שעות",
    short: "שעות",
    icon: "schedule",
    tone: "#6366f1",
    hint: "כתבו את התאריך, שעת הכניסה והיציאה בפועל, ומה מופיע במערכת.",
  },
  {
    value: "missing_tips",
    label: "טיפים חסרים או לא נכונים",
    short: "טיפים",
    icon: "savings",
    tone: "#10b981",
    hint: "איזו משמרת, כמה קיבלתם וכמה ציפיתם לקבל לפי החלוקה.",
  },
  {
    value: "wrong_rate",
    label: "תעריף שעתי שגוי",
    short: "תעריף",
    icon: "payments",
    tone: "#8b5cf6",
    hint: "מה התעריף שסוכם, ומה התעריף שלפיו חושב השכר בפועל.",
  },
  {
    value: "wrong_minimum",
    label: "השלמת מינימום לא נכונה",
    short: "מינימום",
    icon: "trending_up",
    tone: "#0ea5e9",
    hint: "איזו משמרת קצרה, כמה שעות עבדתם ומה קיבלתם בסוף.",
  },
  {
    value: "missing_bonus",
    label: "תוספת קופה / בונוס חסר",
    short: "בונוס",
    icon: "redeem",
    tone: "#f59e0b",
    hint: "על איזו משמרת מדובר ואיזה סכום היה אמור להתווסף.",
  },
  {
    value: "wrong_deduction",
    label: "מפרעה או ניכוי שגוי",
    short: "ניכוי",
    icon: "remove_circle",
    tone: "#f43f5e",
    hint: "איזה ניכוי הופיע, באיזה סכום, ולמה הוא לא אמור להיות שם.",
  },
  {
    value: "other",
    label: "בעיה אחרת",
    short: "אחר",
    icon: "help",
    tone: "#64748b",
    hint: "ספרו בדיוק מה קרה — חודש, משמרת וסכומים עוזרים לטפל מהר.",
  },
] as const;

export type SalaryIssueCategory = (typeof SALARY_ISSUE_CATEGORIES)[number]["value"];
export type SalaryIssueCategoryMeta = (typeof SALARY_ISSUE_CATEGORIES)[number];

const FALLBACK_CATEGORY = SALARY_ISSUE_CATEGORIES[SALARY_ISSUE_CATEGORIES.length - 1];

export function salaryIssueCategoryMeta(value: string): SalaryIssueCategoryMeta {
  return SALARY_ISSUE_CATEGORIES.find((c) => c.value === value) ?? FALLBACK_CATEGORY;
}

export function salaryIssueCategoryLabel(value: string): string {
  return SALARY_ISSUE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** The lifecycle, in order — drives the status stepper and the timeline. */
export const SALARY_ISSUE_STATUS_FLOW: SalaryIssueStatus[] = ["open", "in_treatment", "closed"];

export const SALARY_ISSUE_STATUS_META: Record<
  SalaryIssueStatus,
  { label: string; short: string; icon: string; tone: string; step: number }
> = {
  open: { label: "פתוח", short: "פתוחות", icon: "error", tone: "#f59e0b", step: 0 },
  in_treatment: { label: "בטיפול", short: "בטיפול", icon: "autorenew", tone: "#3b82f6", step: 1 },
  closed: { label: "טופל", short: "טופלו", icon: "check_circle", tone: "#10b981", step: 2 },
};

export const SALARY_ISSUE_STATUS_LABELS: Record<SalaryIssueStatus, string> = {
  open: SALARY_ISSUE_STATUS_META.open.label,
  in_treatment: SALARY_ISSUE_STATUS_META.in_treatment.label,
  closed: SALARY_ISSUE_STATUS_META.closed.label,
};

const STORAGE_PREFIX = "salary_issues_seen";
export const SALARY_ISSUES_SEEN_EVENT = "salary-issues-seen";

function storageKey(userId: string, businessId: string) {
  return `${STORAGE_PREFIX}:${userId}:${businessId}`;
}

export function getSalaryIssuesSeenAt(userId: string, businessId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId, businessId));
  } catch {
    return null;
  }
}

export function markSalaryIssuesSeen(userId: string, businessId: string, at = new Date().toISOString()) {
  try {
    localStorage.setItem(storageKey(userId, businessId), at);
    window.dispatchEvent(new CustomEvent(SALARY_ISSUES_SEEN_EVENT, { detail: { userId, businessId, at } }));
  } catch {
    // ignore quota / private mode
  }
}

/** Count open salary issues the payroll manager has not seen yet. */
export function countUnseenSalaryIssues(issues: SalaryIssue[], seenAt: string | null): number {
  const openIssues = issues.filter((i) => i.status === "open");
  if (!seenAt) return openIssues.length;
  return openIssues.filter((i) => i.created_at > seenAt).length;
}

export function isPayrollManagerRole(role: string | null | undefined): boolean {
  return role === "manager" || role === "office_manager";
}
