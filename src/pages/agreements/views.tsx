import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Icon } from "@/components/ui";
import {
  agreementsForEmployee,
  globalAgreements,
  signatureOf,
  useCreateAgreement,
  useDeleteAgreement,
  useSignatures,
  useUpdateAgreement,
} from "@/api/agreements";
import { useAllForm101 } from "@/api/forms";
import { useProfiles } from "@/api/users";
import { Modal } from "@/components/ui/Modal";
import type { AgreementSignature, AgreementTemplate, Profile } from "@/types/database";
import { AgreementEditorModal, ReadSignModal, type EditorVariant } from "./AgreementModals";
import { DocumentStatusTable, Form101OverviewTable } from "./StatusTables";
import { OfficeReceiptsPanel } from "./OfficeReceiptsPanel";
import { TYPE_LABELS, TAX_YEAR, type ManagerTab } from "./types";

export function TemplatesPanel({
  businessId,
  agreements,
  employees,
  canEdit,
  profileId,
}: {
  businessId: string;
  agreements: AgreementTemplate[];
  employees: Profile[];
  canEdit: boolean;
  profileId: string;
}) {
  const create = useCreateAgreement();
  const update = useUpdateAgreement(businessId);
  const del = useDeleteAgreement(businessId);
  const { data: signatures } = useSignatures(businessId);
  const [modal, setModal] = useState<{ template: AgreementTemplate | null; variant: EditorVariant } | null>(null);
  const [signersFor, setSignersFor] = useState<AgreementTemplate | null>(null);

  const harassment = useMemo(() => agreements.filter((a) => a.type === "sexual_harassment"), [agreements]);
  const forms101 = useMemo(() => agreements.filter((a) => a.type === "form_101"), [agreements]);
  const personal = useMemo(() => agreements.filter((a) => a.type !== "sexual_harassment" && a.type !== "form_101"), [agreements]);

  const variantOf = (t: AgreementTemplate["type"]): EditorVariant =>
    t === "sexual_harassment" ? "harassment" : t === "form_101" ? "form101" : "personal";

  /** How many of the relevant employees signed this document. */
  function signedCount(a: AgreementTemplate) {
    const targets = a.employee_id ? 1 : employees.length;
    const signed = (signatures ?? []).filter((s) => s.agreement_id === a.id && s.agreed).length;
    return { signed, targets };
  }

  function card(a: AgreementTemplate) {
    const { signed, targets } = signedCount(a);
    return (
      <Card key={a.id} className="flex flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[15px] font-bold">{a.title}</div>
            <div className="mt-0.5 text-[12px] text-text-3">
              {TYPE_LABELS[a.type]}
              {a.employee_id
                ? ` · אישי: ${employees.find((e) => e.id === a.employee_id)?.full_name ?? "—"}`
                : " · לכל העובדים"}
              {(a.signature_fields?.length ?? 0) > 0 && ` · ${a.signature_fields.length} תיבות חתימה`}
            </div>
          </div>
          <Badge tone={signed >= targets && targets > 0 ? "success" : "warning"}>{`נחתם ${signed}/${targets}`}</Badge>
        </div>
        {canEdit && (
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" icon="visibility" className="flex-1" onClick={() => setModal({ template: a, variant: variantOf(a.type) })}>
              צפייה ועריכה
            </Button>
            <Button variant="ghost" icon="how_to_reg" title="מי חתם" onClick={() => setSignersFor(a)} />
            <Button variant="ghost" icon="delete" className="text-danger" loading={del.isPending} onClick={() => confirm("למחוק את המסמך?") && del.mutate(a.id)} />
          </div>
        )}
      </Card>
    );
  }

  const emptyBox = (text: string) => (
    <div className="rounded-[12px] border border-dashed border-border bg-surface-2 px-4 py-6 text-center text-[13px] text-text-3">{text}</div>
  );

  return (
    <>
      {/* מניעת הטרדה מינית — הסכם גלובלי אחד לכל העובדים */}
      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-extrabold">מניעת הטרדה מינית</h3>
            <p className="mt-0.5 text-[12.5px] text-text-3">הסכם אחד שמועלה פעם אחת — כל עובד חותם עליו בנפרד.</p>
          </div>
          {canEdit && (
            <Button icon="add" variant="secondary" className="shrink-0" onClick={() => setModal({ template: null, variant: "harassment" })}>
              העלאת הסכם
            </Button>
          )}
        </div>
        {harassment.length === 0
          ? emptyBox("טרם הועלה הסכם מניעת הטרדה מינית.")
          : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{harassment.map(card)}</div>}
      </section>

      {/* טופס 101 — אישי לכל עובד */}
      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-extrabold">טופס 101</h3>
            <p className="mt-0.5 text-[12.5px] text-text-3">טופס 101 ייחודי לכל עובד — חשוף רק לו, והוא חותם עליו דיגיטלית.</p>
          </div>
          {canEdit && (
            <Button icon="add" variant="secondary" className="shrink-0" onClick={() => setModal({ template: null, variant: "form101" })}>
              העלאת טופס 101
            </Button>
          )}
        </div>
        {forms101.length === 0
          ? emptyBox("טרם הועלו טפסי 101.")
          : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{forms101.map(card)}</div>}
      </section>

      {/* הסכמים אישיים — לעובד ספציפי */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-extrabold">הסכמים אישיים</h3>
            <p className="mt-0.5 text-[12.5px] text-text-3">הסכם פרטני לעובד ספציפי — חשוף רק לו.</p>
          </div>
          {canEdit && (
            <Button icon="add" className="shrink-0" onClick={() => setModal({ template: null, variant: "personal" })}>
              הסכם חדש
            </Button>
          )}
        </div>
        {personal.length === 0
          ? emptyBox("אין עדיין הסכמים אישיים.")
          : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{personal.map(card)}</div>}
      </section>

      {modal && (
        <AgreementEditorModal
          template={modal.template}
          employees={employees}
          variant={modal.variant}
          saving={create.isPending || update.isPending}
          onClose={() => setModal(null)}
          onSave={async (input) => {
            if (!modal.template) await create.mutateAsync({ business_id: businessId, created_by: profileId, ...input });
            else await update.mutateAsync({ id: modal.template.id, ...input });
            setModal(null);
          }}
        />
      )}
      {signersFor && (
        <SignersModal agreement={signersFor} staff={employees} signatures={signatures ?? []} onClose={() => setSignersFor(null)} />
      )}
    </>
  );
}

/** Manager view of who signed a given document (all staff for global, the assigned employee otherwise). */
function SignersModal({
  agreement,
  staff,
  signatures,
  onClose,
}: {
  agreement: AgreementTemplate;
  staff: Profile[];
  signatures: AgreementSignature[];
  onClose: () => void;
}) {
  const targets = agreement.employee_id ? staff.filter((s) => s.id === agreement.employee_id) : staff;
  const sigFor = (empId: string) =>
    signatures.find((s) => s.agreement_id === agreement.id && s.employee_id === empId && s.agreed);
  const signedTotal = targets.filter((e) => sigFor(e.id)).length;

  return (
    <Modal
      open
      onClose={onClose}
      title={`חתימות · ${agreement.title}`}
      subtitle={`${signedTotal}/${targets.length} חתמו`}
      icon="how_to_reg"
      footer={<Button className="flex-1" onClick={onClose}>סגירה</Button>}
    >
      {targets.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-text-3">אין עובדים להצגה.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {targets.map((emp) => {
            const sig = sigFor(emp.id);
            return (
              <div key={emp.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{emp.full_name ?? "—"}</div>
                  {sig?.signed_at && (
                    <div className="text-[11.5px] text-text-3">נחתם · {new Date(sig.signed_at).toLocaleDateString("he-IL")}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {sig?.signed_file_url && (
                    <a href={sig.signed_file_url} target="_blank" rel="noreferrer" className="text-link" title="הורדת המסמך החתום">
                      <Icon name="download" size={18} />
                    </a>
                  )}
                  {sig ? <Badge tone="success">נחתם</Badge> : <Badge tone="warning">ממתין</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export function ManagerDocumentsView({
  businessId,
  agreements,
  canEdit,
  canReceipts,
  profileId,
}: {
  businessId: string;
  agreements: AgreementTemplate[];
  canEdit: boolean;
  canReceipts: boolean;
  profileId: string;
}) {
  const [tab, setTab] = useState<ManagerTab>(canReceipts && !canEdit ? "receipts" : "status");
  const { data: employees } = useProfiles(businessId);
  const { data: signatures } = useSignatures(businessId);
  const { data: forms101 } = useAllForm101(businessId, TAX_YEAR);

  const staff = useMemo(
    () => (employees ?? []).filter((e) => e.active && ["employee", "shift_manager", "office_manager"].includes(e.role)),
    [employees]
  );
  const globalFixed = useMemo(() => globalAgreements(agreements).filter((a) => a.type === "sexual_harassment"), [agreements]);
  const globalWork = useMemo(() => globalAgreements(agreements).find((a) => a.type === "work"), [agreements]);

  const tabs: { key: ManagerTab; label: string }[] = [
    ...(canReceipts ? [{ key: "receipts" as const, label: "חשבוניות וקבלות" }] : []),
    { key: "status", label: "מצב מסמכים" },
    { key: "form101", label: "טפסי 101" },
    { key: "templates", label: "הסכמים" },
  ];

  return (
    <>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`relative shrink-0 px-4 pb-3 text-[14px] font-bold transition ${tab === key ? "text-accent-2" : "text-text-2 hover:text-text"}`}
          >
            {label}
            {tab === key && <span className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-full [background:var(--accent)]" />}
          </button>
        ))}
      </div>
      {tab === "receipts" && canReceipts && (
        <OfficeReceiptsPanel businessId={businessId} profileId={profileId} canManage={canReceipts} />
      )}
      {tab === "status" && (
        <DocumentStatusTable staff={staff} signatures={signatures ?? []} forms101={forms101 ?? []} globalFixed={globalFixed} globalWork={globalWork} agreements={agreements} taxYear={TAX_YEAR} />
      )}
      {tab === "form101" && <Form101OverviewTable staff={staff} forms101={forms101 ?? []} taxYear={TAX_YEAR} />}
      {tab === "templates" && <TemplatesPanel businessId={businessId} agreements={agreements} employees={staff} canEdit={canEdit} profileId={profileId} />}
    </>
  );
}

export function EmployeeDocumentsView({
  businessId,
  employeeId,
  employeeName,
  agreements,
  canEditTemplates,
  profileId,
}: {
  businessId: string;
  employeeId: string;
  employeeName: string | null;
  agreements: AgreementTemplate[];
  canEditTemplates?: boolean;
  profileId?: string;
}) {
  const { data: employees } = useProfiles(businessId);
  const staff = useMemo(
    () => (employees ?? []).filter((e) => e.active && ["employee", "shift_manager", "office_manager"].includes(e.role)),
    [employees]
  );
  const { data: signatures } = useSignatures(businessId, employeeId);
  const myAgreements = useMemo(() => agreementsForEmployee(agreements, employeeId), [agreements, employeeId]);
  const [reading, setReading] = useState<AgreementTemplate | null>(null);
  const signedSet = new Set((signatures ?? []).filter((s) => s.agreed).map((s) => s.agreement_id));

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {myAgreements.map((a) => {
          const signed = signedSet.has(a.id);
          return (
            <Card key={a.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-[12px] [background:var(--accent-tint)]"><Icon name="draw" size={23} className="text-accent-2" /></span>
                {signed ? <Badge tone="success">נחתם</Badge> : <Badge tone="warning">ממתין לחתימה</Badge>}
              </div>
              <div className="mt-3 text-[15px] font-bold">{a.title}</div>
              <div className="mt-0.5 text-[12.5px] text-text-3">{TYPE_LABELS[a.type]}</div>
              <Button variant="secondary" className="mt-4" icon={signed ? "visibility" : "edit_document"} onClick={() => setReading(a)}>
                {signed ? "צפייה" : "קריאה וחתימה"}
              </Button>
            </Card>
          );
        })}
      </div>
      {myAgreements.length === 0 && (
        <div className="mt-4">
          <EmptyState icon="draw" title={`שלום ${employeeName ?? ""}`} description="אין מסמכים ממתינים לחתימה כרגע." />
        </div>
      )}
      {reading && (
        <ReadSignModal agreement={reading} employeeId={employeeId} signature={signatureOf(signatures ?? [], reading.id, employeeId)} onClose={() => setReading(null)} />
      )}

      {canEditTemplates && profileId && (
        <section className="mt-10 border-t border-border pt-8">
          <h2 className="mb-4 text-[17px] font-extrabold">ניהול הסכמים</h2>
          <TemplatesPanel businessId={businessId} agreements={agreements} employees={staff} canEdit profileId={profileId} />
        </section>
      )}
    </>
  );
}
