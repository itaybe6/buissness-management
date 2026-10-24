import { useMemo, useState, type CSSProperties } from "react";
import { Badge, Card, EmptyState, Icon } from "@/components/ui";
import { globalForm101Template, signatureOf } from "@/api/agreements";
import type { AgreementSignature, AgreementTemplate, EmployeeIdCard, Profile } from "@/types/database";
import { colorFor, initialsOf } from "@/lib/db";
import { IdCardStatusCell, openIdCard } from "./EmployeeIdCardPanel";
import { ReadSignModal } from "./AgreementModals";
import { docKey, employeeDocs } from "./statusDocs";
import { TAX_YEAR } from "./types";

function StatusIcon({
  done,
  optional,
  onViewSigned,
}: {
  done: boolean;
  optional?: boolean;
  /** When set and the document is signed, the checkmark opens the signed document. */
  onViewSigned?: () => void;
}) {
  if (optional && !done) return <span className="agx-status" data-state="optional">—</span>;
  const state = done ? "done" : "missing";
  if (done && onViewSigned) {
    return (
      <button
        type="button"
        className="agx-status agx-status--btn"
        data-state={state}
        aria-label="צפייה במסמך החתום"
        title="צפייה במסמך החתום"
        onClick={onViewSigned}
      >
        <Icon name="check" size={17} />
      </button>
    );
  }
  return (
    <span className="agx-status" data-state={state} aria-label={done ? "הושלם" : "חסר"}>
      <Icon name={done ? "check" : "close"} size={17} />
    </span>
  );
}

export function DocumentStatusTable({
  staff,
  signatures,
  globalFixed,
  globalWork,
  agreements,
  idCards,
  taxYear = TAX_YEAR,
}: {
  staff: Profile[];
  signatures: AgreementSignature[];
  globalFixed: AgreementTemplate[];
  globalWork: AgreementTemplate | undefined;
  agreements: AgreementTemplate[];
  idCards: EmployeeIdCard[];
  taxYear?: number;
}) {
  const [viewing, setViewing] = useState<{ agreement: AgreementTemplate; employeeId: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const docsOf = (employeeId: string) =>
    employeeDocs({ agreements, globalFixed, globalWork, signatures, idCards, employeeId, taxYear });

  if (staff.length === 0) {
    return <EmptyState icon="group" title="אין עובדים" description="הוסיפו עובדים בעמוד המשתמשים." />;
  }

  return (
    <>
      {/* Mobile — compact expandable roster */}
      <div className="doc-status-roster md:hidden">
        {staff.map((emp, i) => {
          const docs = docsOf(emp.id).all;
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
                    {docs.map((d, di) => {
                      const clickable = !!d.template || !!d.idCard;
                      const state = d.done ? "done" : d.optional ? "optional" : "missing";
                      const icon = d.done ? "check" : d.optional ? "remove" : "close";
                      if (!clickable) {
                        return (
                          <div key={docKey(d, di)} className="doc-status-doc-row" data-state={state}>
                            <span className="doc-status-doc-icon">
                              <Icon name={icon} size={14} />
                            </span>
                            <span className="doc-status-doc-label">{d.label}</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={docKey(d, di)}
                          type="button"
                          className="doc-status-doc-row"
                          data-state={state}
                          aria-label={`צפייה ב${d.label}`}
                          onClick={() =>
                            d.idCard ? openIdCard(d.idCard) : setViewing({ agreement: d.template!, employeeId: emp.id })
                          }
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

      {/* Desktop — readiness matrix */}
      <Card className="agx-matrix hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13.5px]">
            <thead>
              <tr>
                <th>עובד/ת</th>
                <th className="text-center">תעודת זהות</th>
                <th className="text-center">טופס 101 ({taxYear})</th>
                <th className="text-center">הסכמי עבודה</th>
                {globalFixed.map((a) => (
                  <th key={a.id} className="text-center">{a.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((emp, i) => {
                const docs = docsOf(emp.id);
                const { idCardDoc, form101Doc, workDocs, fixedDocs } = docs;
                const idCard = idCardDoc.idCard;
                const counted = docs.all.filter((d) => !(d.optional && !d.done));
                const doneCount = counted.filter((d) => d.done).length;
                const pct = counted.length > 0 ? Math.round((doneCount / counted.length) * 100) : 0;
                const openSigned = (template: AgreementTemplate | undefined) =>
                  template ? () => setViewing({ agreement: template, employeeId: emp.id }) : undefined;
                return (
                  <tr
                    key={emp.id}
                    data-complete={(counted.length > 0 && doneCount === counted.length) || undefined}
                    style={{ "--i": Math.min(i, 16) } as CSSProperties}
                  >
                    <td>
                      <span className="agx-person">
                        <span className="agx-person-chip" style={{ background: colorFor(emp.id) }}>
                          {initialsOf(emp.full_name)}
                        </span>
                        <span className="agx-person-copy">
                          <span className="agx-person-name">{emp.full_name ?? "—"}</span>
                          <span className="agx-person-meter" aria-label={`${doneCount} מתוך ${counted.length} הושלמו`}>
                            <i style={{ "--w": `${pct}%` } as CSSProperties} />
                            <b>
                              {doneCount}/{counted.length}
                            </b>
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="text-center">
                      <IdCardStatusCell
                        card={idCard}
                        onView={idCard ? () => openIdCard(idCard) : undefined}
                      />
                    </td>
                    <td className="text-center">
                      <StatusIcon
                        done={form101Doc.done}
                        optional={form101Doc.optional}
                        onViewSigned={form101Doc.done ? openSigned(form101Doc.template) : undefined}
                      />
                    </td>
                    <td className="text-center">
                      {workDocs.length === 1 ? (
                        <StatusIcon
                          done={workDocs[0].done}
                          optional={workDocs[0].optional}
                          onViewSigned={workDocs[0].done ? openSigned(workDocs[0].template) : undefined}
                        />
                      ) : (
                        <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
                          {workDocs.map((d, di) => (
                            <span key={docKey(d, di)} title={d.label} className="inline-flex">
                              <StatusIcon
                                done={d.done}
                                optional={d.optional}
                                onViewSigned={d.done ? openSigned(d.template) : undefined}
                              />
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {fixedDocs.map((d, di) => (
                      <td key={docKey(d, di)} className="text-center">
                        <StatusIcon
                          done={d.done}
                          optional={d.optional}
                          onViewSigned={d.done ? openSigned(d.template) : undefined}
                        />
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
  const globalTemplate = useMemo(() => globalForm101Template(agreements), [agreements]);

  const note = `שנת מס ${taxYear} · העובדים מורידים את הטופס, ממלאים וחותמים ידנית, ומעלים סריקה`;

  function rowOf(empId: string) {
    const template = globalTemplate;
    const sig = template ? signatureOf(signatures, template.id, empId) : undefined;
    const done = !!sig?.agreed;
    const link =
      done && sig?.signed_file_url
        ? { href: sig.signed_file_url, icon: "visibility" as const, label: "צפייה ב-PDF" }
        : null;
    return { template, done, link };
  }

  function statusBadge(template: AgreementTemplate | undefined, done: boolean) {
    if (!template) return <Badge tone="neutral">לא הוגדר</Badge>;
    if (done) return <Badge tone="success">הועלה</Badge>;
    return <Badge tone="violet">ממתין להעלאה</Badge>;
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
      <Card className="agx-matrix hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr>
                <th>עובד/ת</th>
                <th className="text-center">סטטוס</th>
                <th className="text-center">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((emp, i) => {
                const { template, done, link } = rowOf(emp.id);
                return (
                  <tr key={emp.id} data-complete={done || undefined} style={{ "--i": Math.min(i, 16) } as CSSProperties}>
                    <td>
                      <span className="agx-person">
                        <span className="agx-person-chip" style={{ background: colorFor(emp.id) }}>
                          {initialsOf(emp.full_name)}
                        </span>
                        <span className="agx-person-name">{emp.full_name ?? "—"}</span>
                      </span>
                    </td>
                    <td className="text-center">{statusBadge(template, done)}</td>
                    <td className="text-center">
                      {link ? (
                        <a href={link.href} target="_blank" rel="noreferrer" className="agx-link">
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
        <p className="agx-matrix-note">
          <Icon name="info" size={15} />
          {note}
        </p>
      </Card>
    </>
  );
}
