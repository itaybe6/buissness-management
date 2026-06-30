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
import { useAllForm101, useForm101 } from "@/api/forms";
import { useProfiles } from "@/api/users";
import type { AgreementTemplate, Profile } from "@/types/database";
import { AgreementEditorModal, ReadSignModal } from "./AgreementModals";
import { Form101Modal } from "./Form101Modal";
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
  const [modal, setModal] = useState<{ template: AgreementTemplate | null; harassment: boolean } | null>(null);

  const harassment = useMemo(() => agreements.filter((a) => a.type === "sexual_harassment"), [agreements]);
  const personal = useMemo(() => agreements.filter((a) => a.type !== "sexual_harassment"), [agreements]);

  function card(a: AgreementTemplate) {
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
          {a.file_url && <Icon name="attach_file" size={20} className="text-text-3" />}
        </div>
        {canEdit && (
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" icon="edit" className="flex-1" onClick={() => setModal({ template: a, harassment: a.type === "sexual_harassment" })}>עריכה</Button>
            <Button variant="ghost" icon="delete" className="text-danger" loading={del.isPending} onClick={() => confirm("למחוק את ההסכם?") && del.mutate(a.id)} />
          </div>
        )}
      </Card>
    );
  }

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
            <Button icon="add" variant="secondary" className="shrink-0" onClick={() => setModal({ template: null, harassment: true })}>
              העלאת הסכם
            </Button>
          )}
        </div>
        {harassment.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border bg-surface-2 px-4 py-6 text-center text-[13px] text-text-3">
            טרם הועלה הסכם מניעת הטרדה מינית.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{harassment.map(card)}</div>
        )}
      </section>

      {/* הסכמים אישיים — לעובד ספציפי */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-extrabold">הסכמים אישיים</h3>
            <p className="mt-0.5 text-[12.5px] text-text-3">הסכם פרטני לעובד ספציפי — חשוף רק לו.</p>
          </div>
          {canEdit && (
            <Button icon="add" className="shrink-0" onClick={() => setModal({ template: null, harassment: false })}>
              הסכם חדש
            </Button>
          )}
        </div>
        {personal.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border bg-surface-2 px-4 py-6 text-center text-[13px] text-text-3">
            אין עדיין הסכמים אישיים.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{personal.map(card)}</div>
        )}
      </section>

      {modal && (
        <AgreementEditorModal
          template={modal.template}
          employees={employees}
          harassment={modal.harassment}
          saving={create.isPending || update.isPending}
          onClose={() => setModal(null)}
          onSave={async (input) => {
            if (!modal.template) await create.mutateAsync({ business_id: businessId, created_by: profileId, ...input });
            else await update.mutateAsync({ id: modal.template.id, ...input });
            setModal(null);
          }}
        />
      )}
    </>
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
  const { data: form101 } = useForm101(businessId, employeeId, TAX_YEAR);
  const myAgreements = useMemo(() => agreementsForEmployee(agreements, employeeId), [agreements, employeeId]);
  const [reading, setReading] = useState<AgreementTemplate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const signedSet = new Set((signatures ?? []).filter((s) => s.agreed).map((s) => s.agreement_id));

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="flex flex-col p-5">
          <div className="flex items-start justify-between">
            <span className="grid h-11 w-11 place-items-center rounded-[12px] [background:var(--accent-tint)]"><Icon name="description" size={23} className="text-accent-2" /></span>
            {form101?.submitted ? <Badge tone="success">הוגש</Badge> : <Badge tone="warning">ממתין</Badge>}
          </div>
          <div className="mt-3 text-[15px] font-bold">טופס 101 ({TAX_YEAR})</div>
          <div className="mt-0.5 text-[12.5px] text-text-3">פרטים אישיים לצורכי מס</div>
          <Button variant="secondary" className="mt-4" icon="edit_document" onClick={() => setFormOpen(true)}>
            {form101?.submitted ? "צפייה ועריכה" : "מילוי הטופס"}
          </Button>
        </Card>
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
          <EmptyState icon="draw" title={`שלום ${employeeName ?? ""}`} description="אין הסכמים ממתינים כרגע. מלא/י את טופס 101 למעלה." />
        </div>
      )}
      {reading && (
        <ReadSignModal agreement={reading} employeeId={employeeId} signature={signatureOf(signatures ?? [], reading.id, employeeId)} onClose={() => setReading(null)} />
      )}
      {formOpen && <Form101Modal employeeId={employeeId} taxYear={TAX_YEAR} onClose={() => setFormOpen(false)} />}

      {canEditTemplates && profileId && (
        <section className="mt-10 border-t border-border pt-8">
          <h2 className="mb-4 text-[17px] font-extrabold">ניהול הסכמים</h2>
          <TemplatesPanel businessId={businessId} agreements={agreements} employees={staff} canEdit profileId={profileId} />
        </section>
      )}
    </>
  );
}
