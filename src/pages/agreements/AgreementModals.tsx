import { useState } from "react";
import { Button, Field, Icon, Input, Select } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useBusinessId } from "@/lib/db";
import { uploadAgreementBlob, uploadAgreementFile, useSignAgreement, notifyForm101Signed } from "@/api/agreements";
import type { AgreementSignature, AgreementTemplate, AgreementType, Profile, SignatureField } from "@/types/database";
import { TYPE_LABELS } from "./types";
import { buildSignedPdf, FieldEditorOverlay, FieldSignOverlay, PdfDocViewer, SignaturePadModal } from "./pdf";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export type EditorVariant = "personal" | "harassment" | "form101";

const VARIANT_DEFAULTS: Record<EditorVariant, { type: AgreementType; title: string }> = {
  personal: { type: "work", title: "" },
  harassment: { type: "sexual_harassment", title: "מניעת הטרדה מינית" },
  form101: { type: "form_101", title: "טופס 101" },
};

export function AgreementEditorModal({
  template,
  employees,
  variant = "personal",
  onClose,
  onSave,
  saving,
}: {
  template: AgreementTemplate | null;
  employees: Profile[];
  /** which kind of document is being created/edited */
  variant?: EditorVariant;
  onClose: () => void;
  onSave: (i: {
    title: string;
    type: AgreementType;
    content: string;
    file_url?: string | null;
    signature_fields?: SignatureField[];
    employee_id?: string | null;
  }) => Promise<void>;
  saving: boolean;
}) {
  const businessId = useBusinessId();
  const isGlobalType = variant === "harassment";
  const isForm101 = variant === "form101";
  const [title, setTitle] = useState(template?.title ?? VARIANT_DEFAULTS[variant].title);
  const [type, setType] = useState<AgreementType>(template?.type ?? VARIANT_DEFAULTS[variant].type);
  const [employeeId, setEmployeeId] = useState(template?.employee_id ?? "");
  const [fileUrl, setFileUrl] = useState(template?.file_url ?? "");
  const [fields, setFields] = useState<SignatureField[]>(template?.signature_fields ?? []);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !businessId) return;
    if (file.type !== "application/pdf") {
      setErr("יש להעלות קובץ מסוג PDF בלבד.");
      return;
    }
    setUploading(true);
    setErr("");
    try {
      setFileUrl(await uploadAgreementFile(businessId, file));
      setFields([]); // start fresh — old boxes belong to the previous file
    } catch {
      setErr("שגיאה בהעלאת הקובץ. ודאו שקיים Bucket בשם agreements ב-Storage.");
    } finally {
      setUploading(false);
    }
  }

  // הסכם מניעת הטרדה הוא מסמך גלובלי אחד לכל העובדים — אין בחירת עובד.
  const canSave = !!title.trim() && (isGlobalType || !!employeeId);
  const newTitle = isGlobalType ? "הסכם מניעת הטרדה מינית" : isForm101 ? "העלאת טופס 101" : "הסכם חדש";
  const editTitle = isGlobalType ? "עריכת הסכם הטרדה" : isForm101 ? "עריכת טופס 101" : "עריכת הסכם";

  return (
    <Modal
      open
      onClose={onClose}
      title={template ? editTitle : newTitle}
      subtitle="העלאת PDF וסימון מקומות החתימה"
      icon="draw"
      maxWidth={840}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button
            className="flex-1"
            loading={saving || uploading}
            disabled={!canSave}
            onClick={() =>
              canSave &&
              onSave({
                title: title.trim(),
                type,
                content: "",
                file_url: fileUrl || null,
                signature_fields: fields,
                employee_id: isGlobalType ? null : employeeId || null,
              })
            }
          >
            שמירה
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {isGlobalType ? (
          <>
            <Field label="כותרת"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="מניעת הטרדה מינית" /></Field>
            <div className="flex items-center gap-2 rounded-[11px] bg-surface-2 px-3 py-2.5 text-[12.5px] font-semibold text-text-2">
              <Icon name="groups" size={18} /> מסמך גלובלי — אותו הסכם לכל העובדים, וכל עובד חותם עליו בנפרד.
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Field label="כותרת"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="הסכם העסקה" /></Field>
            <Field label="עובד/ת">
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">בחר/י עובד</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {variant === "personal" && (
          <Field label="סוג">
            <Select value={type} onChange={(e) => setType(e.target.value as AgreementType)}>
              {(["work", "other"] as AgreementType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={isForm101 ? "טופס 101 (PDF)" : "מסמך ההסכם (PDF)"}>
          <Input type="file" accept="application/pdf" onChange={handleFile} disabled={uploading} />
        </Field>

        {fileUrl && (
          <div>
            <div className="mb-2 flex items-center gap-2 rounded-[11px] bg-accent-tint px-3 py-2.5 text-[12.5px] font-semibold text-accent-2">
              <Icon name="touch_app" size={18} />
              גררו על המסמך כדי לסמן ריבוע חתימה. תיבה קיימת ניתן לגרור כדי לשנות מיקום, או למחוק ב-×.
              {fields.length > 0 && <span className="mr-auto">· {fields.length} תיבות חתימה</span>}
            </div>
            <div className="max-h-[52vh] overflow-auto rounded-[12px] border border-border bg-surface-2 p-3">
              <PdfDocViewer
                url={fileUrl}
                renderOverlay={(pageIndex) => (
                  <FieldEditorOverlay
                    pageIndex={pageIndex}
                    fields={fields.filter((f) => f.page === pageIndex)}
                    onAdd={(f) => setFields((p) => [...p, { ...f, id: uid() }])}
                    onRemove={(id) => setFields((p) => p.filter((x) => x.id !== id))}
                    onMove={(id, x, y) => setFields((p) => p.map((f) => (f.id === id ? { ...f, x, y } : f)))}
                  />
                )}
              />
            </div>
          </div>
        )}
        {err && <p className="text-[12px] font-semibold text-danger">{err}</p>}
      </div>
    </Modal>
  );
}

export function ReadSignModal({
  agreement,
  employeeId,
  signature,
  onClose,
}: {
  agreement: AgreementTemplate;
  employeeId: string;
  signature?: AgreementSignature;
  onClose: () => void;
}) {
  const businessId = useBusinessId();
  const sign = useSignAgreement(businessId);
  const alreadySigned = !!signature?.agreed;
  const fields = agreement.signature_fields ?? [];
  const isPdfFlow = !!agreement.file_url && fields.length > 0;

  if (isPdfFlow) {
    return (
      <PdfSignModal
        agreement={agreement}
        employeeId={employeeId}
        signature={signature}
        alreadySigned={alreadySigned}
        onClose={onClose}
      />
    );
  }

  // ---- Legacy flow: text content + single signature canvas ----
  return (
    <LegacySignModal
      agreement={agreement}
      employeeId={employeeId}
      signature={signature}
      alreadySigned={alreadySigned}
      signing={sign.isPending}
      onClose={onClose}
      onSign={async (dataUrl) => {
        await sign.mutateAsync({
          business_id: businessId!,
          agreement_id: agreement.id,
          employee_id: employeeId,
          signature_data: dataUrl,
        });
        if (agreement.type === "form_101") {
          await notifyForm101Signed(agreement.id, employeeId);
        }
        onClose();
      }}
    />
  );
}

function PdfSignModal({
  agreement,
  employeeId,
  signature,
  alreadySigned,
  onClose,
}: {
  agreement: AgreementTemplate;
  employeeId: string;
  signature?: AgreementSignature;
  alreadySigned: boolean;
  onClose: () => void;
}) {
  const businessId = useBusinessId();
  const sign = useSignAgreement(businessId);
  const fields = agreement.signature_fields ?? [];
  const [sigs, setSigs] = useState<Record<string, string>>(signature?.field_signatures ?? {});
  const [padField, setPadField] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const allSigned = fields.every((f) => sigs[f.id]);
  const viewUrl = alreadySigned && signature?.signed_file_url ? signature.signed_file_url : agreement.file_url!;
  const overlaySigs = alreadySigned ? signature?.field_signatures ?? {} : sigs;

  async function submit() {
    setSubmitting(true);
    setErr("");
    try {
      const blob = await buildSignedPdf(agreement.file_url!, fields, sigs);
      const signedUrl = await uploadAgreementBlob(businessId!, blob);
      await sign.mutateAsync({
        business_id: businessId!,
        agreement_id: agreement.id,
        employee_id: employeeId,
        signature_data: sigs[fields[0].id] ?? "",
        field_signatures: sigs,
        signed_file_url: signedUrl,
      });
      if (agreement.type === "form_101") {
        await notifyForm101Signed(agreement.id, employeeId);
      }
      onClose();
    } catch {
      setErr("שגיאה בשמירת המסמך החתום. נסו שוב.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={agreement.title}
        subtitle={alreadySigned ? "המסמך נחתם" : "לחצו על כל תיבה כדי לחתום"}
        icon="draw"
        maxWidth={840}
        footer={
          alreadySigned ? (
            <Button className="flex-1" onClick={onClose}>סגירה</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>ביטול</Button>
              <Button className="flex-1" disabled={!allSigned} loading={submitting} onClick={submit}>
                שמירה וחתימה
              </Button>
            </>
          )
        }
      >
        {alreadySigned && signature?.signed_file_url && (
          <a
            href={signature.signed_file_url}
            target="_blank"
            rel="noreferrer"
            className="mb-3 flex items-center gap-2 rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-[13px] font-semibold text-link"
          >
            <Icon name="download" size={18} /> הורדת המסמך החתום
          </a>
        )}
        {!alreadySigned && (
          <div className="mb-3 flex items-center gap-2 rounded-[11px] bg-accent-tint px-3 py-2.5 text-[12.5px] font-semibold text-accent-2">
            <Icon name="info" size={18} /> נותרו {fields.length - Object.keys(sigs).filter((k) => sigs[k]).length} תיבות לחתימה
          </div>
        )}
        <div className="max-h-[58vh] overflow-auto rounded-[12px] border border-border bg-surface-2 p-3">
          <PdfDocViewer
            url={viewUrl}
            renderOverlay={(pageIndex) =>
              alreadySigned && signature?.signed_file_url ? null : (
                <FieldSignOverlay
                  pageIndex={pageIndex}
                  fields={fields}
                  signatures={overlaySigs}
                  readonly={alreadySigned}
                  onTap={(fid) => setPadField(fid)}
                />
              )
            }
          />
        </div>
        {err && <p className="mt-2 text-[12px] font-semibold text-danger">{err}</p>}
      </Modal>
      {padField && (
        <SignaturePadModal
          onClose={() => setPadField(null)}
          onSave={(dataUrl) => {
            setSigs((p) => ({ ...p, [padField]: dataUrl }));
            setPadField(null);
          }}
        />
      )}
    </>
  );
}

function LegacySignModal({
  agreement,
  signature,
  alreadySigned,
  signing,
  onClose,
  onSign,
}: {
  agreement: AgreementTemplate;
  employeeId: string;
  signature?: AgreementSignature;
  alreadySigned: boolean;
  signing: boolean;
  onClose: () => void;
  onSign: (dataUrl: string) => Promise<void>;
}) {
  const [padOpen, setPadOpen] = useState(false);

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={agreement.title}
        subtitle={TYPE_LABELS[agreement.type]}
        icon="draw"
        maxWidth={560}
        footer={
          alreadySigned ? (
            <Button className="flex-1" onClick={onClose}>סגירה</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>ביטול</Button>
              <Button className="flex-1" loading={signing} onClick={() => setPadOpen(true)}>אני מאשר/ת וחותם/ת</Button>
            </>
          )
        }
      >
        {agreement.file_url && (
          <a href={agreement.file_url} target="_blank" rel="noreferrer" className="mb-3 flex items-center gap-2 rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-[13px] font-semibold text-link">
            <Icon name="attach_file" size={18} /> צפייה במסמך המצורף
          </a>
        )}
        {agreement.content && (
          <div className="mb-4 max-h-[230px] overflow-auto whitespace-pre-wrap rounded-[12px] bg-surface-2 p-4 text-[13.5px] leading-relaxed text-text">{agreement.content}</div>
        )}
        {alreadySigned && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-success">
              <Icon name="check_circle" size={20} /> ההסכם נחתם
              {signature?.signed_at && <span className="text-[12px] font-normal text-text-3">· {new Date(signature.signed_at).toLocaleDateString("he-IL")}</span>}
            </div>
            {signature?.signature_data && (
              <img src={signature.signature_data} alt="חתימה" className="w-full rounded-[12px] border border-border bg-surface p-2" />
            )}
          </div>
        )}
      </Modal>
      {padOpen && (
        <SignaturePadModal
          onClose={() => setPadOpen(false)}
          onSave={async (dataUrl) => {
            setPadOpen(false);
            await onSign(dataUrl);
          }}
        />
      )}
    </>
  );
}
