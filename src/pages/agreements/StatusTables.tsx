import { useMemo } from "react";
import { Badge, Card, EmptyState, Icon } from "@/components/ui";
import { isSigned, signatureOf } from "@/api/agreements";
import type { AgreementSignature, AgreementTemplate, Profile } from "@/types/database";
import { TAX_YEAR } from "./types";

function StatusIcon({ done, optional }: { done: boolean; optional?: boolean }) {
  if (optional && !done) return <span className="text-[12px] text-text-3">—</span>;
  return (
    <span className={`inline-grid h-7 w-7 place-items-center rounded-full ${done ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
      <Icon name={done ? "check" : "close"} size={18} />
    </span>
  );
}

export function DocumentStatusTable({
  staff,
  signatures,
  globalFixed,
  globalWork,
  agreements,
  taxYear = TAX_YEAR,
}: {
  staff: Profile[];
  signatures: AgreementSignature[];
  globalFixed: AgreementTemplate[];
  globalWork: AgreementTemplate | undefined;
  agreements: AgreementTemplate[];
  taxYear?: number;
}) {
  function form101Status(empId: string): { done: boolean; optional: boolean } {
    const template = agreements.find((a) => a.type === "form_101" && a.employee_id === empId);
    if (!template) return { done: false, optional: true };
    return { done: isSigned(signatures, template.id, empId), optional: false };
  }

  function workStatus(empId: string): boolean {
    const personal = agreements.find((a) => a.type === "work" && a.employee_id === empId);
    const template = personal ?? globalWork;
    if (!template) return false;
    return isSigned(signatures, template.id, empId);
  }

  if (staff.length === 0) {
    return <EmptyState icon="group" title="אין עובדים" description="הוסיפו עובדים בעמוד המשתמשים." />;
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13.5px]">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-right text-[12px] font-bold text-text-2">
              <th className="px-4 py-3">עובד/ת</th>
              <th className="px-4 py-3 text-center">טופס 101 ({taxYear})</th>
              <th className="px-4 py-3 text-center">הסכם עבודה</th>
              {globalFixed.map((a) => (
                <th key={a.id} className="px-4 py-3 text-center">{a.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((emp) => {
              const form101 = form101Status(emp.id);
              return (
                <tr key={emp.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold">{emp.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusIcon done={form101.done} optional={form101.optional} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusIcon
                      done={workStatus(emp.id)}
                      optional={!globalWork && !agreements.some((a) => a.type === "work" && a.employee_id === emp.id)}
                    />
                  </td>
                  {globalFixed.map((a) => (
                    <td key={a.id} className="px-4 py-3 text-center">
                      <StatusIcon done={isSigned(signatures, a.id, emp.id)} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function Form101OverviewTable({
  staff,
  agreements,
  signatures,
  taxYear = TAX_YEAR,
}: {
  staff: Profile[];
  agreements: AgreementTemplate[];
  signatures: AgreementSignature[];
  taxYear?: number;
}) {
  const formMap = useMemo(() => {
    const map = new Map<string, AgreementTemplate>();
    for (const a of agreements) {
      if (a.type === "form_101" && a.employee_id) map.set(a.employee_id, a);
    }
    return map;
  }, [agreements]);

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-right text-[12px] font-bold text-text-2">
              <th className="px-4 py-3">עובד/ת</th>
              <th className="px-4 py-3 text-center">סטטוס</th>
              <th className="px-4 py-3 text-center">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((emp) => {
              const template = formMap.get(emp.id);
              const sig = template ? signatureOf(signatures, template.id, emp.id) : undefined;
              const done = !!sig?.agreed;
              return (
                <tr key={emp.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold">{emp.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {!template ? (
                      <Badge tone="neutral">לא הועלה</Badge>
                    ) : done ? (
                      <Badge tone="success">נחתם</Badge>
                    ) : (
                      <Badge tone="warning">ממתין לחתימה</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {done && sig?.signed_file_url ? (
                      <a href={sig.signed_file_url} target="_blank" rel="noreferrer" className="text-link inline-flex items-center gap-1 text-[13px] font-semibold">
                        <Icon name="visibility" size={18} />
                        צפייה ב-PDF
                      </a>
                    ) : template?.file_url && !done ? (
                      <a href={template.file_url} target="_blank" rel="noreferrer" className="text-link inline-flex items-center gap-1 text-[13px] font-semibold">
                        <Icon name="description" size={18} />
                        טיוטה
                      </a>
                    ) : (
                      <span className="text-[12px] text-text-3">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-[12px] text-text-3">שנת מס {taxYear} · העלו טופס 101 ייחודי לכל עובד תחת «הסכמים»</p>
    </Card>
  );
}
