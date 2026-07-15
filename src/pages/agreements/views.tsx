import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Icon } from "@/components/ui";
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
import { Modal } from "@/components/ui/Modal";
import type { AgreementSignature, AgreementTemplate, Profile } from "@/types/database";
import { AgreementEditorModal, ReadSignModal, type EditorVariant } from "./AgreementModals";
import { Form101Modal } from "./Form101Modal";
import {
  DocsEmployeeEmpty,
  DocsEmptyBox,
  DocsListEmpty,
  DocsMgmtStats,
  DocsMgmtToolbar,
  DocsPageTabs,
  DocsTabs,
  EmployeeDocRow,
  filterMgmtAgreements,
  mgmtCategoryCounts,
  TemplateDocRow,
} from "./DocumentsUI";
import { DocumentStatusTable, Form101OverviewTable } from "./StatusTables";
import { OfficeReceiptsPanel } from "./OfficeReceiptsPanel";
import { TAX_YEAR, type DocsMgmtCategory, type ManagerTab } from "./types";

const ADD_LABELS: Record<DocsMgmtCategory, string> = {
  all: "הוסף",
  sexual_harassment: "העלאת הסכם",
  form_101: "העלאת 101",
  personal: "הסכם חדש",
};

const ADD_VARIANTS: Record<Exclude<DocsMgmtCategory, "all">, EditorVariant> = {
  sexual_harassment: "harassment",
  form_101: "form101",
  personal: "personal",
};

export function TemplatesPanel({
  businessId,
  agreements,
  employees,
  canEdit,
  profileId,
  openVariant,
  onOpenVariantConsumed,
}: {
  businessId: string;
  agreements: AgreementTemplate[];
  employees: Profile[];
  canEdit: boolean;
  profileId: string;
  onFabNew?: () => void;
  openVariant?: EditorVariant | null;
  onOpenVariantConsumed?: () => void;
}) {
  const create = useCreateAgreement();
  const update = useUpdateAgreement(businessId);
  const del = useDeleteAgreement(businessId);
  const { data: signatures } = useSignatures(businessId);
  const [modal, setModal] = useState<{ template: AgreementTemplate | null; variant: EditorVariant } | null>(null);
  const [signersFor, setSignersFor] = useState<AgreementTemplate | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<DocsMgmtCategory>("all");

  const variantOf = (t: AgreementTemplate["type"]): EditorVariant =>
    t === "sexual_harassment" ? "harassment" : t === "form_101" ? "form101" : "personal";

  function signedCount(a: AgreementTemplate) {
    const targets = a.employee_id ? 1 : employees.length;
    const signed = (signatures ?? []).filter((s) => s.agreement_id === a.id && s.agreed).length;
    return { signed, targets };
  }

  function subtitleOf(a: AgreementTemplate) {
    const parts: string[] = [];
    if (a.employee_id) {
      parts.push(employees.find((e) => e.id === a.employee_id)?.full_name ?? "אישי");
    } else {
      parts.push("לכל העובדים");
    }
    if ((a.signature_fields?.length ?? 0) > 0) {
      parts.push(`${a.signature_fields.length} חתימות`);
    }
    return parts.join(" · ");
  }

  const counts = useMemo(() => mgmtCategoryCounts(agreements), [agreements]);

  const filtered = useMemo(
    () => filterMgmtAgreements(agreements, category, search),
    [agreements, category, search],
  );

  const stats = useMemo(() => {
    let pending = 0;
    let complete = 0;
    for (const a of agreements) {
      const { signed, targets } = signedCount(a);
      if (targets > 0 && signed >= targets) complete++;
      else if (targets > 0) pending++;
    }
    return { total: agreements.length, pending, complete };
  }, [agreements, signatures, employees]);

  function openAdd() {
    if (!canEdit) return;
    if (category === "all") {
      setModal({ template: null, variant: "personal" });
      return;
    }
    setModal({ template: null, variant: ADD_VARIANTS[category] });
  }

  useEffect(() => {
    if (openVariant) {
      setModal({ template: null, variant: openVariant });
      onOpenVariantConsumed?.();
    }
  }, [openVariant, onOpenVariantConsumed]);

  return (
    <div className="docs-mgmt-panel">
      <DocsMgmtStats total={stats.total} pending={stats.pending} complete={stats.complete} />

      <DocsMgmtToolbar
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        counts={counts}
        onAdd={canEdit ? openAdd : undefined}
        addLabel={ADD_LABELS[category]}
      />

      <div className="docs-mgmt-list">
        {filtered.length === 0 ? (
          agreements.length === 0 ? (
            <DocsEmptyBox text="טרם הועלו מסמכים. לחצו על הוסף כדי להתחיל." icon="folder_open" />
          ) : (
            <DocsListEmpty query={search} category={category !== "all" ? category : undefined} />
          )
        ) : (
          filtered.map((a, i) => {
            const { signed, targets } = signedCount(a);
            return (
              <TemplateDocRow
                key={a.id}
                title={a.title}
                type={a.type}
                subtitle={subtitleOf(a)}
                signed={signed}
                targets={targets}
                canEdit={canEdit}
                index={i}
                deleting={del.isPending}
                onView={() => setModal({ template: a, variant: variantOf(a.type) })}
                onSigners={() => setSignersFor(a)}
                onDelete={() => confirm("למחוק את המסמך?") && del.mutate(a.id)}
              />
            );
          })
        )}
      </div>

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
    </div>
  );
}

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
        <div className="doc-signers-list">
          {targets.map((emp) => {
            const sig = sigFor(emp.id);
            return (
              <div key={emp.id} className="doc-signer-row">
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
                  {sig ? <Badge tone="neutral">נחתם</Badge> : <Badge tone="neutral">ממתין</Badge>}
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
      <DocsTabs tabs={tabs} active={tab} onChange={setTab} />
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
  const [form101Open, setForm101Open] = useState(false);
  const [fabVariant, setFabVariant] = useState<EditorVariant | null>(null);
  const [pageTab, setPageTab] = useState<"mine" | "manage">(canEditTemplates ? "manage" : "mine");
  const signedSet = new Set((signatures ?? []).filter((s) => s.agreed).map((s) => s.agreement_id));

  const pending = myAgreements.filter((a) => !signedSet.has(a.id)).length + (form101?.submitted ? 0 : 1);
  const showTabs = Boolean(canEditTemplates && profileId);
  const form101Done = form101?.submitted === true;

  return (
    <div className="docs-page">
      {showTabs && (
        <DocsPageTabs
          active={pageTab}
          onChange={setPageTab}
          mineCount={pending}
          mgmtCount={agreements.length}
        />
      )}

      {(!showTabs || pageTab === "mine") && (
        <>
          {(myAgreements.length > 0 || !form101Done) ? (
            <div className="profile-card">
              {!form101Done && (
                <button
                  type="button"
                  className={`profile-action-row ${myAgreements.length === 0 ? "profile-action-row--last" : ""}`}
                  onClick={() => setForm101Open(true)}
                >
                  <span className="profile-action-row-icon" data-tone="warning">
                    <Icon name="description" size={20} />
                  </span>
                  <span className="profile-action-row-text">
                    <span className="profile-action-row-title">
                      טופס 101 · {TAX_YEAR}
                      <span className="docs-pending-dot" aria-hidden />
                    </span>
                    <span className="profile-action-row-desc" data-pending>
                      {form101 ? "טיוטה — ממתין להגשה" : "ממתין למילוי"}
                    </span>
                  </span>
                  <Icon name="chevron_left" size={22} className="profile-action-row-chevron" />
                </button>
              )}
              {myAgreements.map((a, i) => {
                const signedDoc = signedSet.has(a.id);
                return (
                  <EmployeeDocRow
                    key={a.id}
                    title={a.title}
                    type={a.type}
                    signed={signedDoc}
                    last={i === myAgreements.length - 1}
                    onOpen={() => setReading(a)}
                  />
                );
              })}
            </div>
          ) : (
            <DocsEmployeeEmpty name={employeeName} />
          )}

          {reading && (
            <ReadSignModal agreement={reading} employeeId={employeeId} signature={signatureOf(signatures ?? [], reading.id, employeeId)} onClose={() => setReading(null)} />
          )}
          {form101Open && (
            <Form101Modal employeeId={employeeId} taxYear={TAX_YEAR} onClose={() => setForm101Open(false)} />
          )}
        </>
      )}

      {showTabs && pageTab === "manage" && profileId && (
        <TemplatesPanel
          businessId={businessId}
          agreements={agreements}
          employees={staff}
          canEdit
          profileId={profileId}
          openVariant={fabVariant}
          onOpenVariantConsumed={() => setFabVariant(null)}
        />
      )}
    </div>
  );
}
