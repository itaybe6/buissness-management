import { useRef, useState } from "react";
import { Button, Field, Icon, Input, Select } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useBusinessId } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { uploadAgreementBlob, uploadAgreementFile, useSignAgreement, notifyForm101Signed } from "@/api/agreements";
import type {
  AgreementSignature,
  AgreementTemplate,
  AgreementType,
  FormFieldKind,
  Profile,
  SignatureField,
} from "@/types/database";
import { TYPE_LABELS, FORM_101_BLANK_URL } from "./types";
import {
  buildSignedPdf,
  FieldEditorOverlay,
  FieldSignOverlay,
  isFieldFilled,
  kindOf,
  PdfDocViewer,
  SignaturePadModal,
} from "./pdf";
import { detectFormFields } from "./detectFields";

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
  const [fields, setFields] = useState<SignatureField[]>(
    isForm101 ? [] : (template?.signature_fields ?? [])
  );
  const [tool, setTool] = useState<FormFieldKind>("signature");
  const [uploading, setUploading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState("");
  const [err, setErr] = useState("");

  // Form 101 falls back to the blank form bundled with the app, so boxes can be
  // placed even before the manager uploads a business-specific version.
  const editorUrl = isForm101 ? fileUrl || FORM_101_BLANK_URL : fileUrl;
  const textFields = fields.filter((f) => kindOf(f) === "text");
  const checkFields = fields.filter((f) => kindOf(f) === "checkbox");
  const signFields = fields.filter((f) => kindOf(f) === "signature");

  async function autoDetect() {
    if (!editorUrl || detecting) return;
    if (fields.length > 0 && !confirm("הזיהוי האוטומטי יחליף את כל התיבות הקיימות. להמשיך?")) return;
    setDetecting(true);
    setErr("");
    setDetectNote("");
    try {
      const found = await detectFormFields(editorUrl);
      setFields(found);
      setDetectNote(
        found.length > 0
          ? `זוהו ${found.length} תיבות. עברו עליהן — אפשר לגרור, למחוק ולהוסיף מה שחסר.`
          : "לא זוהו תיבות במסמך הזה. סמנו אותן ידנית בגרירה."
      );
    } catch {
      setErr("הזיהוי האוטומטי נכשל. אפשר לסמן את התיבות ידנית.");
    } finally {
      setDetecting(false);
    }
  }

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
    ? "העובדים מורידים את הטופס, ממלאים וחותמים ידנית, ומעלים סריקה"
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
                file_url: (isForm101 ? fileUrl || FORM_101_BLANK_URL : fileUrl) || null,
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
              <Icon name="groups" size={18} /> טופס אחד לכל העובדים — כל עובד מוריד, ממלא וחותם ידנית, ומעלה PDF סרוק.
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

        {editorUrl && !isForm101 && (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="label-text">סוג התיבה שתסמנו:</span>
              {(
                [
                  { key: "text", label: "תיבת טקסט", icon: "keyboard" },
                  { key: "checkbox", label: "תיבת סימון", icon: "check_box" },
                  { key: "signature", label: "תיבת חתימה", icon: "draw" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTool(t.key)}
                  aria-pressed={tool === t.key}
                  className={`inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-[12.5px] font-bold transition-colors ${
                    tool === t.key
                      ? "border-accent-2 bg-accent-tint text-accent-2"
                      : "border-border bg-surface-2 text-text-2"
                  }`}
                >
                  <Icon name={t.icon} size={16} /> {t.label}
                </button>
              ))}
              <span className="mr-auto text-[12px] font-semibold text-text-3">
                {textFields.length} טקסט · {checkFields.length} סימון · {signFields.length} חתימה
              </span>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[11px] bg-accent-tint px-3 py-2.5 text-[12.5px] font-semibold text-accent-2">
              <Icon name="auto_fix_high" size={18} />
              <span className="flex-1">
                אפשר לזהות את תיבות הטופס אוטומטית, ואז לתקן ידנית — גררו לסימון תיבה חדשה, גררו תיבה קיימת כדי
                להזיז, או מחקו ב-×.
              </span>
              <Button variant="secondary" loading={detecting} onClick={autoDetect}>
                זיהוי אוטומטי
              </Button>
            </div>
            {detectNote && (
              <div className="mb-2 flex items-center gap-2 rounded-[11px] bg-success/10 px-3 py-2.5 text-[12.5px] font-semibold text-success">
                <Icon name="check_circle" size={18} /> {detectNote}
              </div>
            )}
            <div className="max-h-[52vh] overflow-auto rounded-[12px] border border-border bg-surface-2 p-3">
              <PdfDocViewer
                url={editorUrl}
                zoomable
                renderOverlay={(pageIndex) => (
                  <FieldEditorOverlay
                    pageIndex={pageIndex}
                    tool={tool}
                    fields={fields.filter((f) => f.page === pageIndex)}
                    onAdd={(f) => setFields((p) => [...p, { ...f, id: uid() }])}
                    onRemove={(id) => setFields((p) => p.filter((x) => x.id !== id))}
                    onMove={(id, x, y) => setFields((p) => p.map((f) => (f.id === id ? { ...f, x, y } : f)))}
                  />
                )}
              />
            </div>
            {textFields.length > 0 && (
              <details className="mt-2 rounded-[12px] border border-border bg-surface-2 px-3 py-2">
                <summary className="cursor-pointer text-[12.5px] font-bold text-text-2">
                  שמות תיבות הטקסט ({textFields.length}) — אופציונלי
                </summary>
                <p className="mt-1 text-[11.5px] text-text-3">
                  השם מוצג לעובד/ת כרמז בתוך התיבה הריקה, ואינו מודפס על הטופס.
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {textFields.map((f, i) => (
                    <div key={f.id} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[11.5px] font-semibold text-text-3">
                        #{i + 1} · ע׳{f.page + 1}
                      </span>
                      <Input
                        value={f.label ?? ""}
                        placeholder="למשל: שם משפחה"
                        onChange={(e) =>
                          setFields((p) => p.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))
                        }
                      />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        {err && <p className="text-[12px] font-semibold text-danger">{err}</p>}
      </div>
    </Modal>
  );
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|heic|heif)(\?|$)/i.test(url);
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
  const fileInput = useRef<HTMLInputElement>(null);
  const blankUrl = agreement.file_url ?? FORM_101_BLANK_URL;
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");

  const done = !!signature?.agreed || !!uploadedUrl;
  const uploadAllowed = canSign && !done;
  const viewUrl = signature?.signed_file_url ?? uploadedUrl;

  async function handleFile(file: File | null | undefined) {
    if (!file || !businessId || !canSign || done || uploading) return;
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      setErr("יש להעלות קובץ PDF או תמונה של הטופס.");
      return;
    }
    setUploading(true);
    setFileName(file.name);
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
      setUploadedUrl(signedUrl);
    } catch {
      setErr("שגיאה בהעלאת הקובץ. נסו שוב.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={agreement.title || "טופס 101"}
      subtitle={
        done ? "הטופס נשמר במערכת" : uploadAllowed ? "שלושה שלבים והטופס אצלנו" : "ממתין להעלאת העובד/ת"
      }
      icon="description"
      maxWidth={560}
      fullScreenMobile
      footer={
        uploadAllowed ? (
          <>
            <Button variant="secondary" onClick={onClose}>ביטול</Button>
            <Button className="flex-1" icon="upload" loading={uploading} onClick={() => fileInput.current?.click()}>
              בחירת הטופס החתום
            </Button>
          </>
        ) : (
          <Button className="flex-1" onClick={onClose}>סגירה</Button>
        )
      }
    >
      <div className="docs-upload">
        {done ? (
          <>
            <div className="docs-upload__done">
              <span className="docs-upload__done-icon" aria-hidden>
                <Icon name="check" size={26} />
              </span>
              <div className="docs-upload__done-copy">
                <span className="docs-upload__done-title">הטופס הועלה</span>
                <span className="docs-upload__done-sub">
                  {signature?.signed_at
                    ? `נשלח · ${new Date(signature.signed_at).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}`
                    : "העותק החתום נשמר ונשלח למשרד"}
                </span>
              </div>
            </div>

            {viewUrl && (
              <div className="docs-upload__actions">
                <a className="docs-upload__btn" href={viewUrl} target="_blank" rel="noreferrer">
                  <Icon name="visibility" size={18} /> צפייה בטופס
                </a>
                <a className="docs-upload__btn" href={viewUrl} download target="_blank" rel="noreferrer">
                  <Icon name="download" size={18} /> הורדת העותק
                </a>
              </div>
            )}

            {viewUrl && (
              <div className="docs-upload__preview">
                {isImageUrl(viewUrl) ? (
                  <img src={viewUrl} alt="הטופס שהועלה" className="docs-upload__preview-img" />
                ) : (
                  <PdfDocViewer url={viewUrl} />
                )}
              </div>
            )}
          </>
        ) : uploadAllowed ? (
          <ol className="docs-upload__steps">
            <li className="docs-upload-step">
              <span className="docs-upload-step__num">1</span>
              <div className="docs-upload-step__body">
                <span className="docs-upload-step__title">הורדת הטופס הריק</span>
                <span className="docs-upload-step__desc">שמרו את ה־PDF במכשיר או הדפיסו אותו</span>
                <a className="docs-upload-step__cta" href={blankUrl} target="_blank" rel="noreferrer" download>
                  <Icon name="download" size={18} /> הורדת טופס 101
                </a>
              </div>
            </li>

            <li className="docs-upload-step">
              <span className="docs-upload-step__num">2</span>
              <div className="docs-upload-step__body">
                <span className="docs-upload-step__title">מילוי וחתימה ידנית</span>
                <span className="docs-upload-step__desc">
                  מלאו את כל הפרטים, חתמו בעט, ואז צלמו או סרקו את הטופס
                </span>
              </div>
            </li>

            <li className="docs-upload-step">
              <span className="docs-upload-step__num">3</span>
              <div className="docs-upload-step__body">
                <span className="docs-upload-step__title">העלאת הטופס החתום</span>
                <span className="docs-upload-step__desc">תמונה מהמצלמה או קובץ PDF</span>
                <div
                  className={`docs-upload-drop${dragOver ? " docs-upload-drop--over" : ""}${uploading ? " docs-upload-drop--busy" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => !uploading && fileInput.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (!uploading) fileInput.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void handleFile(e.dataTransfer.files[0]);
                  }}
                >
                  {uploading ? (
                    <>
                      <span className="docs-upload-drop__spinner" aria-hidden />
                      <span className="docs-upload-drop__label">מעלה ושומר...</span>
                      {fileName && <span className="docs-upload-drop__hint">{fileName}</span>}
                    </>
                  ) : (
                    <>
                      <span className="docs-upload-drop__glyph" aria-hidden>
                        <Icon name="add_a_photo" size={26} />
                      </span>
                      <span className="docs-upload-drop__label">לחצו לצילום או לבחירת קובץ</span>
                      <span className="docs-upload-drop__hint">אפשר גם לגרור לכאן · נשמר אוטומטית</span>
                    </>
                  )}
                </div>
              </div>
            </li>
          </ol>
        ) : (
          <div className="docs-upload__waiting">
            <span className="docs-upload__waiting-icon" aria-hidden>
              <Icon name="schedule" size={24} />
            </span>
            <span className="docs-upload__waiting-text">העובד/ת עדיין לא העלה/תה את הטופס החתום.</span>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />

        {err && (
          <p className="docs-upload__error" role="alert">
            <Icon name="error" size={16} /> {err}
          </p>
        )}
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
  const { profile } = useAuth();
  const canSign = profile?.id === employeeId;
  const sign = useSignAgreement(businessId);
  const alreadySigned = !!signature?.agreed;
  const fields = agreement.signature_fields ?? [];
  const isForm101 = agreement.type === "form_101";
  const isPdfFlow = !isForm101 && !!agreement.file_url && fields.length > 0;

  if (isForm101) {
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
  const [values, setValues] = useState<Record<string, string>>(signature?.field_signatures ?? {});
  const [padField, setPadField] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const signBoxes = fields.filter((f) => kindOf(f) === "signature");
  const textBoxes = fields.filter((f) => kindOf(f) === "text");
  const checkBoxes = fields.filter((f) => kindOf(f) === "checkbox");
  const missingSignatures = signBoxes.filter((f) => !values[f.id]).length;
  const filledText = textBoxes.filter((f) => values[f.id]?.trim()).length;
  const tickedCount = checkBoxes.filter((f) => values[f.id]).length;
  const ready = fields.every((f) => isFieldFilled(f, values));
  const viewUrl = alreadySigned && signature?.signed_file_url ? signature.signed_file_url : agreement.file_url!;
  const overlayValues = alreadySigned ? signature?.field_signatures ?? {} : values;
  const signingAllowed = canSign && !alreadySigned;

  async function submit() {
    if (!canSign) return;
    setSubmitting(true);
    setErr("");
    try {
      const blob = await buildSignedPdf(agreement.file_url!, fields, values);
      const signedUrl = await uploadAgreementBlob(businessId!, blob);
      await sign.mutateAsync({
        business_id: businessId!,
        agreement_id: agreement.id,
        employee_id: employeeId,
        signature_data: signBoxes.length > 0 ? values[signBoxes[0].id] ?? "" : "",
        field_signatures: values,
        signed_file_url: signedUrl,
      });
      if (agreement.type === "form_101") await notifyForm101Signed(agreement.id, employeeId);
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
          alreadySigned
            ? "המסמך נחתם"
            : !canSign
              ? "צפייה במסמך — ממתין לחתימת העובד"
              : textBoxes.length > 0
                ? "הקלידו ישירות על הטופס ולחצו על תיבות החתימה"
                : "לחצו על כל תיבה כדי לחתום"
        }
        icon="draw"
        maxWidth={840}
        footer={
          signingAllowed ? (
            <>
              <Button variant="secondary" onClick={onClose}>ביטול</Button>
              <Button className="flex-1" disabled={!ready} loading={submitting} onClick={submit}>
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
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[11px] bg-accent-tint px-3 py-2.5 text-[12.5px] font-semibold text-accent-2">
            <span className="flex items-center gap-1.5">
              <Icon name="info" size={18} />
              {missingSignatures > 0 ? `נותרו ${missingSignatures} תיבות לחתימה` : "כל החתימות הושלמו"}
            </span>
            {textBoxes.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Icon name="keyboard" size={18} />
                מולאו {filledText} מתוך {textBoxes.length} שדות טקסט
              </span>
            )}
            {checkBoxes.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Icon name="check_box" size={18} />
                סומנו {tickedCount} תיבות
              </span>
            )}
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
            zoomable={signingAllowed}
            renderOverlay={(pageIndex, dims) =>
              signingAllowed ? (
                <FieldSignOverlay
                  pageIndex={pageIndex}
                  fields={fields}
                  signatures={overlayValues}
                  dims={dims}
                  readonly={false}
                  onTap={(fid) => setPadField(fid)}
                  onText={(fid, v) => setValues((p) => ({ ...p, [fid]: v }))}
                  onToggle={(fid, checked) =>
                    setValues((p) => {
                      const next = { ...p };
                      if (checked) next[fid] = "1";
                      else delete next[fid];
                      return next;
                    })
                  }
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
            setValues((p) => ({ ...p, [padField]: dataUrl }));
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
