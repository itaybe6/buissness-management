import { useCallback, useEffect, useMemo, useState } from "react";
import { useSalaryIssues } from "@/api/salaryIssues";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import {
  SALARY_ISSUES_SEEN_EVENT,
  countUnseenSalaryIssues,
  getSalaryIssuesSeenAt,
  isPayrollManagerRole,
  markSalaryIssuesSeen,
} from "@/lib/salaryIssues";

export function useSalaryIssueBadgeCount() {
  const { profile } = useAuth();
  const businessId = useBusinessId();
  const userId = profile?.id;
  const isPayrollManager = isPayrollManagerRole(profile?.role);

  const { data: issues } = useSalaryIssues(isPayrollManager ? businessId : null, { poll: true });

  const [seenAt, setSeenAt] = useState<string | null>(() =>
    userId && businessId ? getSalaryIssuesSeenAt(userId, businessId) : null,
  );

  useEffect(() => {
    if (!userId || !businessId) return;

    function onSeen(event: Event) {
      const detail = (event as CustomEvent<{ userId: string; businessId: string; at: string }>).detail;
      if (detail?.userId === userId && detail.businessId === businessId) {
        setSeenAt(detail.at);
      }
    }

    window.addEventListener(SALARY_ISSUES_SEEN_EVENT, onSeen);
    return () => window.removeEventListener(SALARY_ISSUES_SEEN_EVENT, onSeen);
  }, [userId, businessId]);

  const count = useMemo(() => {
    if (!isPayrollManager || !issues) return 0;
    return countUnseenSalaryIssues(issues, seenAt);
  }, [isPayrollManager, issues, seenAt]);

  const markSeen = useCallback(() => {
    if (!userId || !businessId) return;
    markSalaryIssuesSeen(userId, businessId);
    setSeenAt(getSalaryIssuesSeenAt(userId, businessId));
  }, [userId, businessId]);

  return { count, markSeen, isPayrollManager };
}
