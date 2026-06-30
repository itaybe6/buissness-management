import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { isSigned } from "@/api/agreements";
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
  forms101,
  globalFixed,
  globalWork,
  agreements,
  taxYear = TAX_YEAR,
}: {
  staff: Profile[];
  signatures: AgreementSignature[];
  forms101: { employee_id: string; submitted: boolean }[];
  globalFixed: AgreementTemplate[];
  globalWork: AgreementTemplate | undefined;
  agreements: AgreementTemplate[];
  taxYear?: number;
}) {
  const formMap = useMemo(() => new Map(forms101.map((f) => [f.employee_id, f.submitted])), [forms101]);

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
            {staff.map((emp) => (
              <tr key={emp.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold">{emp.full_name ?? "—"}</td>
                <td className="px-4 py-3 text-center"><StatusIcon done={formMap.get(emp.id) === true} /></td>
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
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function Form101OverviewTable({
  staff,
  forms101,
  taxYear = TAX_YEAR,
}: {
  staff: Profile[];
  forms101: { employee_id: string; submitted: boolean; data: Record<string, unknown> }[];
  taxYear?: number;
}) {
  const formMap = useMemo(() => new Map(forms101.map((f) => [f.employee_id, f])), [forms101]);
  const [viewing, setViewing] = useState<{ emp: Profile; form: (typeof forms101)[0] } | null>(null);

  return (
    <>
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
                const form = formMap.get(emp.id);
                const done = form?.submitted === true;
                return (
                  <tr key={emp.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold">{emp.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      {done ? <Badge tone="success">הוגש</Badge> : <Badge tone="warning">חסר / טיוטה</Badge>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {form ? (
                        <Button variant="ghost" icon="visibility" onClick={() => setViewing({ emp, form })}>צפייה</Button>
                      ) : (
                        <span className="text-[12px] text-text-3">לא התחיל</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={`טופס 101 · ${viewing.emp.full_name}`} subtitle={`שנת מס ${taxYear}`} icon="description" footer={<Button className="flex-1" onClick={() => setViewing(null)}>סגירה</Button>}>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            {Object.entries(viewing.form.data ?? {}).map(([k, v]) => (
              <div key={k}>
                <div className="text-[11px] font-bold text-text-3">{k}</div>
                <div className="font-medium">{String(v ?? "—")}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
