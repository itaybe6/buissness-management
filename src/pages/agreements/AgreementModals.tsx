import { useState } from "react";
import { Button, Field, Icon, Input, Select } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useBusinessId } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { uploadAgreementBlob, uploadAgreementFile, useSignAgreement, notifyForm101Signed } from "@/api/agreements";
import type { AgreementSignature, AgreementTemplate, AgreementType, Profile, SignatureField } from "@/types/database";
import { TYPE_LABELS, FORM_101_BLANK_URL } from "./types";
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
  const isGlobalDoc = isGlobalType || isForm101;
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

  // הסכם מניעת הטרדה / טופס 101 — מסמך גלובלי אחד לכל העובדים.
  const canSave = !!title.trim() && (isGlobalDoc || !!employeeId);
  const newTitle = isGlobalType ? "הסכם מניעת הטרדה מינית" : isForm101 ? "העלאת טופס 101" : "הסכם חדש";
  const editTitle = isGlobalType ? "עריכת הסכם הטרדה" : isForm101 ? "עריכת טופס 101" : "עריכת הסכם";
  const editorSubtitle = isForm101
    ? "טופס ריק להורדה — העובדים ממלאים, חותמים וסורקים בעצמם"
    : "העלאת PDF וסימון מקומות החתימה";

  return (
    <Modal
      open
      onClose={onClose}
      title={template ? editTitle : newTitle}
      subtitle={editorSubtitle}
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
                signature_fields: isForm101 ? [] : fields,
                employee_id: isGlobalDoc ? null : employeeId || null,
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
        ) : isForm101 ? (
          <>
            <Field label="כותרת"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="טופס 101" /></Field>
            <div className="flex items-center gap-2 rounded-[11px] bg-surface-2 px-3 py-2.5 text-[12.5px] font-semibold text-text-2">
              <Icon name="groups" size={18} /> טופס ריק אחד לכל העובדים — כל עובד מוריד, ממלא ידנית, חותם ומעלה סריקה.
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
        <Field label={isForm101 ? "טופס 101 ריק (PDF)" : "מסמך ההסכם (PDF)"}>
          <Input type="file" accept="application/pdf" onChange={handleFile} disabled={uploading} />
        </Field>
        {isForm101 && !fileUrl && (
          <p className="text-[12px] text-text-3">
            אם לא תועלה גרסה מותאמת, העובדים יורידו את טופס 101 ברירת המחדל של המערכת.
          </p>
        )}

        {fileUrl && !isForm101 && (
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

function Form101UploadModal({
  agreement,
  employeeId,
  signature,
  canSign,
  onClose,
}: {
  agreement: AgreementTemplate;
  employeeId: string;
  signature?: AgreementSignature;
  canSign: boolean;
  onClose: () => void;
}) {
  const businessId = useBusinessId();
  const sign = useSignAgreement(businessId);
  const alreadySigned = !!signature?.agreed;
  const blankUrl = agreement.file_url ?? FORM_101_BLANK_URL;
  const viewUrl = alreadySigned && signature?.signed_file_url ? signature.signed_file_url : null;
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !businessId || !canSign || alreadySigned) return;
    if (file.type !== "application/pdf") {
      setErr("יש להעלות קובץ PDF בלבד.");
      return;
    }
    setUploading(true);
    setErr("");
    try {
      const signedUrl = await uploadAgreementFile(businessId, file);
      await sign.mutateAsync({
        business_id: businessId,
        agreement_id: agreement.id,
        employee_id: employeeId,
        signature_data: "",
        signed_file_url: signedUrl,
      });
      await notifyForm101Signed(agreement.id, employeeId);
      onClose();
    } catch {
      setErr("שגיאה בהעלאת הקובץ. נסו שוב.");
      setUploading(false);
    }
  }

  const uploadAllowed = canSign && !alreadySigned;

  return (
    <Modal
      open
      onClose={onClose}
      title={agreement.title || "טופס 101"}
      subtitle={
        alreadySigned
          ? "הטופס הועלה"
          : uploadAllowed
            ? "הורידו את הטופס, מלאו וחתמו ידנית, סרקו והעלו PDF"
            : "ממתין להעלאת העובד/ת"
      }
      icon="description"
      maxWidth={840}
      footer={<Button className="flex-1" onClick={onClose}>סגירה</Button>}
    >
      {!alreadySigned && (
        <a
          href={blankUrl}
          target="_blank"
          rel="noreferrer"
          download
          className="mb-3 flex items-center gap-2 rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-[13px] font-semibold text-link"
        >
          <Icon name="download" size={18} /> הורדת טופס 101 (ריק)
        </a>
      )}
      {alreadySigned && signature?.signed_file_url && (
        <a
          href={signature.signed_file_url}
          target="_blank"
          rel="noreferrer"
          className="mb-3 flex items-center gap-2 rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-[13px] font-semibold text-link"
        >
          <Icon name="download" size={18} /> הורדת העותק שהועלה
        </a>
      )}
      {uploadAllowed && (
        <Field label="העלאת טופס 101 חתום (PDF)">
          <Input type="file" accept="application/pdf" onChange={handleFile} disabled={uploading} />
        </Field>
      )}
      {!canSign && !alreadySigned && (
        <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] font-semibold text-text-2">
          <Icon name="schedule" size={18} /> העובד/ת עדיין לא העלה/תה את הטופס החתום.
        </div>
      )}
      {viewUrl && (
        <div className="max-h-[58vh] overflow-auto rounded-[12px] border border-border bg-surface-2 p-3">
          <PdfDocViewer url={viewUrl} />
        </div>
      )}
      {err && <p className="mt-2 text-[12px] font-semibold text-danger">{err}</p>}
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
  const { profile } = useAuth();
  const canSign = profile?.id === employeeId;
  const sign = useSignAgreement(businessId);
  const alreadySigned = !!signature?.agreed;
  const fields = agreement.signature_fields ?? [];
  const isPdfFlow = agreement.type !== "form_101" && !!agreement.file_url && fields.length > 0;

  if (agreement.type === "form_101") {
    return (
      <Form101UploadModal
        agreement={agreement}
        employeeId={employeeId}
        signature={signature}
        canSign={canSign}
        onClose={onClose}
      />
    );
  }

  if (isPdfFlow) {
    return (
      <PdfSignModal
        agreement={agreement}
        employeeId={employeeId}
        signature={signature}
        alreadySigned={alreadySigned}
        canSign={canSign}
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
      canSign={canSign}
      signing={sign.isPending}
      onClose={onClose}
      onSign={async (dataUrl) => {
        await sign.mutateAsync({
          business_id: businessId!,
          agreement_id: agreement.id,
          employee_id: employeeId,
          signature_data: dataUrl,
        });
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
  canSign,
  onClose,
}: {
  agreement: AgreementTemplate;
  employeeId: string;
  signature?: AgreementSignature;
  alreadySigned: boolean;
  canSign: boolean;
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
  const signingAllowed = canSign && !alreadySigned;

  async function submit() {
    if (!canSign) return;
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
        subtitle={
          alreadySigned ? "המסמך נחתם" : canSign ? "לחצו על כל תיבה כדי לחתום" : "צפייה במסמך — ממתין לחתימת העובד"
        }
        icon="draw"
        maxWidth={840}
        footer={
          signingAllowed ? (
            <>
              <Button variant="secondary" onClick={onClose}>ביטול</Button>
              <Button className="flex-1" disabled={!allSigned} loading={submitting} onClick={submit}>
                שמירה וחתימה
              </Button>
            </>
          ) : (
            <Button className="flex-1" onClick={onClose}>סגירה</Button>
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
        {signingAllowed && (
          <div className="mb-3 flex items-center gap-2 rounded-[11px] bg-accent-tint px-3 py-2.5 text-[12.5px] font-semibold text-accent-2">
            <Icon name="info" size={18} /> נותרו {fields.length - Object.keys(sigs).filter((k) => sigs[k]).length} תיבות לחתימה
          </div>
        )}
        {!canSign && !alreadySigned && (
          <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] font-semibold text-text-2">
            <Icon name="lock" size={18} /> רק העובד/ת יכול/ה לחתום על המסמך שלו/ה
          </div>
        )}
        <div className="max-h-[58vh] overflow-auto rounded-[12px] border border-border bg-surface-2 p-3">
          <PdfDocViewer
            url={viewUrl}
            renderOverlay={(pageIndex) =>
              signingAllowed ? (
                <FieldSignOverlay
                  pageIndex={pageIndex}
                  fields={fields}
                  signatures={overlaySigs}
                  readonly={false}
                  onTap={(fid) => setPadField(fid)}
                />
              ) : null
            }
          />
        </div>
        {err && <p className="mt-2 text-[12px] font-semibold text-danger">{err}</p>}
      </Modal>
      {padField && canSign && (
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
  canSign,
  signing,
  onClose,
  onSign,
}: {
  agreement: AgreementTemplate;
  employeeId: string;
  signature?: AgreementSignature;
  alreadySigned: boolean;
  canSign: boolean;
  signing: boolean;
  onClose: () => void;
  onSign: (dataUrl: string) => Promise<void>;
}) {
  const [padOpen, setPadOpen] = useState(false);
  const signingAllowed = canSign && !alreadySigned;

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
          signingAllowed ? (
            <>
              <Button variant="secondary" onClick={onClose}>ביטול</Button>
              <Button className="flex-1" loading={signing} onClick={() => setPadOpen(true)}>אני מאשר/ת וחותם/ת</Button>
            </>
          ) : (
            <Button className="flex-1" onClick={onClose}>סגירה</Button>
          )
        }
      >
        {agreement.file_url && (
          <a href={agreement.file_url} target="_blank" rel="noreferrer" className="mb-3 flex items-center gap-2 rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-[13px] font-semibold text-link">
            <Icon name="attach_file" size={18} /> צפייה במסמך המצורף
          </a>
        )}
        {!canSign && !alreadySigned && (
          <div className="mb-3 flex items-center gap-2 rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] font-semibold text-text-2">
            <Icon name="lock" size={18} /> רק העובד/ת יכול/ה לחתום על המסמך שלו/ה
          </div>
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
      {padOpen && canSign && (
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
