import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Icon } from "@/components/ui";
import {
  agreementsForEmployee,
  globalAgreements,
  globalForm101Template,
  signatureOf,
  useCreateAgreement,
  useDeleteAgreement,
  useSignatures,
  useUpdateAgreement,
} from "@/api/agreements";
import { useProfiles } from "@/api/users";
import { idCardByEmployee, useEmployeeIdCards } from "@/api/employeeIdCards";
import { Modal } from "@/components/ui/Modal";
import type { AgreementSignature, AgreementTemplate, Profile } from "@/types/database";
import { AgreementEditorModal, ReadSignModal, type EditorVariant } from "./AgreementModals";
import {
  DocsEmployeeEmpty,
  DocsEmptyBox,
  DocsListEmpty,
  DocsMgmtStats,
  DocsMgmtToolbar,
  DocsPageTabs,
  DocsSearchBar,
  DocsTabs,
  EmployeeDocRow,
  filterMgmtAgreements,
  mgmtCategoryCounts,
  TemplateDocRow,
} from "./DocumentsUI";
import { DocumentStatusTable, Form101OverviewTable } from "./StatusTables";
import { OfficeReceiptsPanel } from "./OfficeReceiptsPanel";
import { EmployeeIdCardUploadPanel } from "./EmployeeIdCardPanel";
import { TAX_YEAR, FORM_101_BLANK_URL, type DocsMgmtCategory, type ManagerTab } from "./types";

const ADD_LABELS: Record<DocsMgmtCategory, string> = {
  all: "הוסף",
  sexual_harassment: "העלאת הסכם",
  form_101: "טופס ריק 101",
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
    const boxes = a.signature_fields?.length ?? 0;
    if (boxes > 0) parts.push(`${boxes} תיבות מילוי`);
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
    if (category === "form_101") {
      const existing = globalForm101Template(agreements);
      setModal({ template: existing ?? null, variant: "form101" });
      return;
    }
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
        addLabel={
          category === "form_101" && globalForm101Template(agreements)
            ? "עריכת טופס 101"
            : ADD_LABELS[category]
        }
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
  const [staffSearch, setStaffSearch] = useState("");
  const { data: employees } = useProfiles(businessId);
  const { data: signatures } = useSignatures(businessId);
  const { data: idCards } = useEmployeeIdCards(businessId);

  const staff = useMemo(
    () => (employees ?? []).filter((e) => e.active && ["employee", "shift_manager", "office_manager"].includes(e.role)),
    [employees]
  );
  const visibleStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((e) => (e.full_name ?? "").toLowerCase().includes(q));
  }, [staff, staffSearch]);
  const globalFixed = useMemo(() => globalAgreements(agreements).filter((a) => a.type === "sexual_harassment"), [agreements]);
  const globalWork = useMemo(() => globalAgreements(agreements).find((a) => a.type === "work"), [agreements]);
  const createAgreement = useCreateAgreement();
  const updateAgreement = useUpdateAgreement(businessId);
  const globalForm101 = useMemo(() => globalForm101Template(agreements), [agreements]);
  const seededForm101 = useRef(false);
  const [editForm101, setEditForm101] = useState(false);
  const form101Boxes = globalForm101?.signature_fields?.length ?? 0;

  useEffect(() => {
    if (!canEdit || globalForm101 || seededForm101.current) return;
    seededForm101.current = true;
    void createAgreement
      .mutateAsync({
        business_id: businessId,
        type: "form_101",
        title: `טופס 101 (${TAX_YEAR})`,
        content: "",
        file_url: FORM_101_BLANK_URL,
        signature_fields: [],
        employee_id: null,
        created_by: profileId,
      })
      .catch(() => {
        seededForm101.current = false;
      });
  }, [businessId, canEdit, globalForm101, profileId, createAgreement]);

  const tabs: { key: ManagerTab; label: string; icon: string }[] = [
    ...(canReceipts ? [{ key: "receipts" as const, label: "חשבוניות וקבלות", icon: "receipt_long" }] : []),
    { key: "status", label: "מצב מסמכים", icon: "fact_check" },
    { key: "form101", label: "טפסי 101", icon: "description" },
    { key: "templates", label: "הסכמים", icon: "history_edu" },
  ];

  const staffTab = tab === "status" || tab === "form101";
  const searchMiss = staffTab && staff.length > 0 && visibleStaff.length === 0;

  return (
    <>
      <DocsTabs tabs={tabs} active={tab} onChange={setTab} />
      {staffTab && staff.length > 0 && (
        <div className="docs-staff-search">
          <DocsSearchBar value={staffSearch} onChange={setStaffSearch} placeholder="חיפוש עובד..." />
        </div>
      )}
      {tab === "receipts" && canReceipts && (
        <OfficeReceiptsPanel businessId={businessId} profileId={profileId} canManage={canReceipts} />
      )}
      {searchMiss ? (
        <DocsListEmpty query={staffSearch} />
      ) : (
        <>
          {tab === "status" && (
            <DocumentStatusTable
              staff={visibleStaff}
              signatures={signatures ?? []}
              globalFixed={globalFixed}
              globalWork={globalWork}
              agreements={agreements}
              idCards={idCards ?? []}
              taxYear={TAX_YEAR}
            />
          )}
          {tab === "form101" && (
            <>
              {canEdit && globalForm101 && (
                <div className="form101-setup">
                  <Icon name={form101Boxes > 0 ? "check_circle" : "edit_document"} size={20} />
                  <div className="form101-setup__text">
                    <span className="form101-setup__title">
                      {form101Boxes > 0 ? "מילוי במקלדת פעיל" : "מילוי במקלדת — עוד לא הוגדר"}
                    </span>
                    <span className="form101-setup__sub">
                      {form101Boxes > 0
                        ? `${form101Boxes} תיבות מסומנות על הטופס. העובדים מקלידים ישירות עליו וחותמים דיגיטלית.`
                        : "סמנו על הטופס איפה כל פרט נכתב, וכל העובדים ימלאו אותו במקלדת במקום להדפיס ולסרוק."}
                    </span>
                  </div>
                  <Button variant="secondary" onClick={() => setEditForm101(true)}>
                    {form101Boxes > 0 ? "עריכת התיבות" : "סימון תיבות מילוי"}
                  </Button>
                </div>
              )}
              <Form101OverviewTable staff={visibleStaff} agreements={agreements} signatures={signatures ?? []} taxYear={TAX_YEAR} />
            </>
          )}
        </>
      )}
      {tab === "templates" && <TemplatesPanel businessId={businessId} agreements={agreements} employees={staff} canEdit={canEdit} profileId={profileId} />}
      {editForm101 && globalForm101 && (
        <AgreementEditorModal
          template={globalForm101}
          employees={staff}
          variant="form101"
          saving={updateAgreement.isPending}
          onClose={() => setEditForm101(false)}
          onSave={async (input) => {
            await updateAgreement.mutateAsync({ id: globalForm101.id, ...input });
            setEditForm101(false);
          }}
        />
      )}
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
  const { data: idCards } = useEmployeeIdCards(businessId);
  const myIdCard = idCardByEmployee(idCards, employeeId);
  const myAgreements = useMemo(() => agreementsForEmployee(agreements, employeeId), [agreements, employeeId]);
  const [reading, setReading] = useState<AgreementTemplate | null>(null);
  const [fabVariant, setFabVariant] = useState<EditorVariant | null>(null);
  const [pageTab, setPageTab] = useState<"mine" | "manage">(canEditTemplates ? "manage" : "mine");
  const signedSet = new Set((signatures ?? []).filter((s) => s.agreed).map((s) => s.agreement_id));

  const pending =
    myAgreements.filter((a) => !signedSet.has(a.id)).length + (myIdCard ? 0 : 1);
  const showTabs = Boolean(canEditTemplates && profileId);

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
          <EmployeeIdCardUploadPanel businessId={businessId} employeeId={employeeId} />

          {myAgreements.length > 0 ? (
            <div className="profile-card">
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
          ) : myIdCard ? (
            <DocsEmployeeEmpty name={employeeName} />
          ) : (
            <p className="docs-id-card-only-hint text-center text-[13px] font-semibold text-text-3">
              לאחר העלאת תעודת הזהות — יופיעו כאן גם הסכמים לחתימה, אם יש.
            </p>
          )}

          {reading && (
            <ReadSignModal agreement={reading} employeeId={employeeId} signature={signatureOf(signatures ?? [], reading.id, employeeId)} onClose={() => setReading(null)} />
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
