import { useMemo, useState, type CSSProperties } from "react";
import { Badge, Card, EmptyState, Icon } from "@/components/ui";
import { isSigned, signatureOf } from "@/api/agreements";
import { colorFor, initialsOf } from "@/lib/db";
import type { AgreementSignature, AgreementTemplate, Profile } from "@/types/database";
import { ReadSignModal } from "./AgreementModals";
import { TAX_YEAR } from "./types";

function StatusIcon({ done, optional }: { done: boolean; optional?: boolean }) {
  if (optional && !done) return <span className="text-[12px] text-text-3">—</span>;
  return (
    <span className={`inline-grid h-7 w-7 place-items-center rounded-full ${done ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
      <Icon name={done ? "check" : "close"} size={18} />
    </span>
  );
}

type DocStatus = { label: string; done: boolean; optional: boolean; template?: AgreementTemplate };

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
  const [viewing, setViewing] = useState<{ agreement: AgreementTemplate; employeeId: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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

  function docsOf(empId: string): DocStatus[] {
    const form101 = form101Status(empId);
    const form101Template = agreements.find((a) => a.type === "form_101" && a.employee_id === empId);
    const personalWork = agreements.find((a) => a.type === "work" && a.employee_id === empId);
    const workTemplate = personalWork ?? globalWork;
    const workOptional = !globalWork && !personalWork;
    return [
      { label: `טופס 101 (${taxYear})`, done: form101.done, optional: form101.optional, template: form101Template },
      { label: "הסכם עבודה", done: workStatus(empId), optional: workOptional, template: workTemplate },
      ...globalFixed.map((a) => ({
        label: a.title,
        done: isSigned(signatures, a.id, empId),
        optional: false,
        template: a,
      })),
    ];
  }

  if (staff.length === 0) {
    return <EmptyState icon="group" title="אין עובדים" description="הוסיפו עובדים בעמוד המשתמשים." />;
  }

  return (
    <>
      {/* Mobile — compact expandable roster */}
      <div className="doc-status-roster md:hidden">
        {staff.map((emp, i) => {
          const docs = docsOf(emp.id);
          const counted = docs.filter((d) => !(d.optional && !d.done));
          const done = counted.filter((d) => d.done).length;
          const complete = counted.length > 0 && done === counted.length;
          const missing = counted.filter((d) => !d.done).length;
          const open = expanded === emp.id;
          return (
            <div
              key={emp.id}
              className="doc-status-cell"
              data-open={open}
              style={{ "--doc-delay": `${Math.min(i, 12) * 30}ms` } as CSSProperties}
            >
              <button
                type="button"
                className="doc-status-cell-row"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : emp.id)}
              >
                <span className="doc-status-cell-avatar person-chip" style={{ background: colorFor(emp.id) }}>
                  {initialsOf(emp.full_name)}
                </span>
                <span className="doc-status-cell-info">
                  <span className="doc-status-cell-name">{emp.full_name ?? "—"}</span>
                  <span className="doc-status-cell-sub">
                    {complete
                      ? "כל המסמכים הושלמו"
                      : missing > 0
                        ? `${missing} מסמכים חסרים`
                        : `${done}/${counted.length} הושלמו`}
                  </span>
                </span>
                <span className="doc-status-cell-badge" data-complete={complete}>
                  {done}/{counted.length}
                </span>
                <Icon name="expand_more" size={20} className="doc-status-cell-chevron" />
              </button>
              <div className="doc-status-cell-details">
                <div className="doc-status-cell-details-clip">
                  <div className="doc-status-cell-docs">
                    {docs.map((d) => {
                      const clickable = !!d.template;
                      const state = d.done ? "done" : d.optional ? "optional" : "missing";
                      const icon = d.done ? "check" : d.optional ? "remove" : "close";
                      if (!clickable) {
                        return (
                          <div key={d.label} className="doc-status-doc-row" data-state={state}>
                            <span className="doc-status-doc-icon">
                              <Icon name={icon} size={14} />
                            </span>
                            <span className="doc-status-doc-label">{d.label}</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={d.label}
                          type="button"
                          className="doc-status-doc-row"
                          data-state={state}
                          aria-label={`צפייה ב${d.label}`}
                          onClick={() => setViewing({ agreement: d.template!, employeeId: emp.id })}
                        >
                          <span className="doc-status-doc-icon">
                            <Icon name={icon} size={14} />
                          </span>
                          <span className="doc-status-doc-label">{d.label}</span>
                          <Icon name="chevron_left" size={18} className="doc-status-doc-chevron" aria-hidden />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop — full table */}
      <Card className="hidden overflow-hidden md:block">
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

      {viewing && (
        <ReadSignModal
          agreement={viewing.agreement}
          employeeId={viewing.employeeId}
          signature={signatureOf(signatures, viewing.agreement.id, viewing.employeeId)}
          onClose={() => setViewing(null)}
        />
      )}
    </>
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

  const note = `שנת מס ${taxYear} · העלו טופס 101 ייחודי לכל עובד תחת «הסכמים»`;

  function rowOf(empId: string) {
    const template = formMap.get(empId);
    const sig = template ? signatureOf(signatures, template.id, empId) : undefined;
    const done = !!sig?.agreed;
    const link = done && sig?.signed_file_url
      ? { href: sig.signed_file_url, icon: "visibility", label: "צפייה ב-PDF" }
      : template?.file_url && !done
        ? { href: template.file_url, icon: "description", label: "טיוטה" }
        : null;
    return { template, done, link };
  }

  function statusBadge(template: AgreementTemplate | undefined, done: boolean) {
    if (!template) return <Badge tone="neutral">לא הועלה</Badge>;
    if (done) return <Badge tone="success">נחתם</Badge>;
    return <Badge tone="warning">ממתין לחתימה</Badge>;
  }

  return (
    <>
      {/* Mobile — card per employee */}
      <div className="form101-cards md:hidden">
        {staff.map((emp, i) => {
          const { template, done, link } = rowOf(emp.id);
          return (
            <div
              key={emp.id}
              className="form101-card doc-card--enter"
              style={{ "--doc-delay": `${Math.min(i, 12) * 35}ms` } as CSSProperties}
            >
              <div className="form101-card__main">
                <span className="form101-card__name">{emp.full_name ?? "—"}</span>
                {statusBadge(template, done)}
              </div>
              {link && (
                <a href={link.href} target="_blank" rel="noreferrer" className="form101-card__link">
                  <Icon name={link.icon} size={16} />
                  {link.label}
                </a>
              )}
            </div>
          );
        })}
        <p className="form101-cards__note">{note}</p>
      </div>

      {/* Desktop — full table */}
      <Card className="hidden overflow-hidden md:block">
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
                const { template, done, link } = rowOf(emp.id);
                return (
                  <tr key={emp.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold">{emp.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{statusBadge(template, done)}</td>
                    <td className="px-4 py-3 text-center">
                      {link ? (
                        <a href={link.href} target="_blank" rel="noreferrer" className="text-link inline-flex items-center gap-1 text-[13px] font-semibold">
                          <Icon name={link.icon} size={18} />
                          {link.label}
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
        <p className="border-t border-border px-4 py-2.5 text-[12px] text-text-3">{note}</p>
      </Card>
    </>
  );
}
