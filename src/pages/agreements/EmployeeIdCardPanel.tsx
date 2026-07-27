import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { idCardByEmployee, useEmployeeIdCards, useUploadEmployeeIdCard } from "@/api/employeeIdCards";
import type { EmployeeIdCard } from "@/types/database";
import { PdfDocViewer, PdfFirstPagePreview } from "./pdf";

function formatUploaded(at: string) {
  return new Date(at).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|heic|heif)(\?|$)/i.test(url);
}

/** Compact list row — matches the other document items on the employee page. */
export function EmployeeIdCardRow({
  uploaded,
  uploadedAt,
  onOpen,
  index = 0,
}: {
  uploaded: boolean;
  uploadedAt?: string;
  onOpen: () => void;
  index?: number;
}) {
  const desc = uploaded
    ? uploadedAt
      ? `הועלתה · ${formatUploaded(uploadedAt)}`
      : "הועלתה — אפשר לצפות במסמך"
    : "צלמו או העלו תמונה ברורה של שני הצדדים";

  return (
    <button
      type="button"
      className="docs-item doc-card--enter"
      data-signed={uploaded || undefined}
      style={{ "--doc-delay": `${Math.min(index, 8) * 45}ms` } as CSSProperties}
      onClick={onOpen}
    >
      <span className="docs-item__icon" aria-hidden>
        <Icon name="badge" size={20} />
      </span>
      <span className="docs-item__copy">
        <span className="docs-item__top">
          <span className="docs-item__title">תעודת זהות</span>
          <span className="docs-item__pill">
            {uploaded ? <Icon name="check" size={13} /> : null}
            {uploaded ? "הושלם" : "לביצוע"}
          </span>
        </span>
        <span className="docs-item__desc">{desc}</span>
      </span>
      <Icon name="chevron_left" size={20} className="docs-item__chevron" />
    </button>
  );
}

export function IdCardUploadModal({
  businessId,
  employeeId,
  card,
  onClose,
}: {
  businessId: string;
  employeeId: string;
  card?: EmployeeIdCard;
  onClose: () => void;
}) {
  const upload = useUploadEmployeeIdCard(businessId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"image" | "pdf" | null>(null);
  const [justUploaded, setJustUploaded] = useState(false);
  const [err, setErr] = useState("");

  const uploading = upload.isPending;
  const uploaded = !!card || justUploaded;
  const viewUrl = card?.file_url ?? localPreview;

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  async function handleFile(file: File | null | undefined) {
    if (!file || uploading) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      setErr("יש להעלות תמונה (JPG, PNG) או PDF");
      return;
    }

    const previewObj = URL.createObjectURL(file);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(previewObj);
    setPreviewKind(isPdf ? "pdf" : "image");
    setFileName(file.name);
    setErr("");

    try {
      await upload.mutateAsync({ employee_id: employeeId, file });
      setJustUploaded(true);
    } catch (e) {
      URL.revokeObjectURL(previewObj);
      setLocalPreview(null);
      setPreviewKind(null);
      setErr(e instanceof Error ? e.message : "העלאה נכשלה");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function openPicker() {
    if (!uploading) fileInput.current?.click();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="תעודת זהות"
      subtitle={uploaded ? "המסמך נשמר במערכת" : "צילום ברור של שני הצדדים"}
      icon="badge"
      maxWidth={560}
      fullScreenMobile
      footer={
        uploaded ? (
          <>
            {!uploading && (
              <Button variant="secondary" icon="sync" onClick={openPicker}>
                החלפת קובץ
              </Button>
            )}
            <Button className="flex-1" onClick={onClose}>
              סגירה
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              ביטול
            </Button>
            <Button className="flex-1" icon="add_a_photo" loading={uploading} onClick={openPicker}>
              צילום או בחירת קובץ
            </Button>
          </>
        )
      }
    >
      <div className="docs-upload">
        {uploaded ? (
          <>
            <div className="docs-upload__done">
              <span className="docs-upload__done-icon" aria-hidden>
                <Icon name="check" size={26} />
              </span>
              <div className="docs-upload__done-copy">
                <span className="docs-upload__done-title">תעודת הזהות הועלתה</span>
                <span className="docs-upload__done-sub">
                  {card?.uploaded_at
                    ? `נשמר · ${formatUploaded(card.uploaded_at)}`
                    : "המסמך נשמר וזמין לצפייה"}
                </span>
              </div>
            </div>

            {viewUrl && (
              <div className="docs-upload__actions">
                <a className="docs-upload__btn" href={viewUrl} target="_blank" rel="noreferrer">
                  <Icon name="visibility" size={18} /> צפייה במסמך
                </a>
                <a className="docs-upload__btn" href={viewUrl} download target="_blank" rel="noreferrer">
                  <Icon name="download" size={18} /> הורדת העותק
                </a>
              </div>
            )}

            {viewUrl && (
              <div className="docs-upload__preview">
                {previewKind === "pdf" || (!previewKind && !isImageUrl(viewUrl)) ? (
                  card?.file_url ? (
                    <PdfDocViewer url={viewUrl} />
                  ) : (
                    <PdfFirstPagePreview url={viewUrl} maxHeight={420} />
                  )
                ) : (
                  <img src={viewUrl} alt="תעודת זהות" className="docs-upload__preview-img" />
                )}
              </div>
            )}
          </>
        ) : (
          <ol className="docs-upload__steps">
            <li className="docs-upload-step">
              <span className="docs-upload-step__num">1</span>
              <div className="docs-upload-step__body">
                <span className="docs-upload-step__title">הכינו את התעודה</span>
                <span className="docs-upload-step__desc">
                  שימו את שני הצדדים על משטח שטוח, בתאורה טובה וללא השתקפויות
                </span>
              </div>
            </li>

            <li className="docs-upload-step">
              <span className="docs-upload-step__num">2</span>
              <div className="docs-upload-step__body">
                <span className="docs-upload-step__title">צלמו או העלו את הקובץ</span>
                <span className="docs-upload-step__desc">תמונה מהמצלמה, מהגלריה, או PDF סרוק</span>
                <div
                  className={`docs-upload-drop${dragOver ? " docs-upload-drop--over" : ""}${uploading ? " docs-upload-drop--busy" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={openPicker}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPicker();
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
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
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

/** @deprecated Use EmployeeIdCardRow + IdCardUploadModal instead. */
export function EmployeeIdCardUploadPanel({
  businessId,
  employeeId,
}: {
  businessId: string;
  employeeId: string;
  compact?: boolean;
}) {
  const { data: cards } = useEmployeeIdCards(businessId);
  const card = idCardByEmployee(cards, employeeId);
  const [open, setOpen] = useState(false);

  return (
    <>
      <EmployeeIdCardRow uploaded={!!card} uploadedAt={card?.uploaded_at} onOpen={() => setOpen(true)} />
      {open && (
        <IdCardUploadModal businessId={businessId} employeeId={employeeId} card={card} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** שורת סטטוס תעודת זהות בטבלת מנהלים */
export function IdCardStatusCell({
  card,
  onView,
}: {
  card: EmployeeIdCard | undefined;
  onView?: () => void;
}) {
  const done = !!card;
  const badge = (
    <span
      className={`inline-grid h-7 w-7 place-items-center rounded-full ${done ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}
    >
      <Icon name={done ? "check" : "close"} size={18} />
    </span>
  );
  if (done && onView) {
    return (
      <button
        type="button"
        className="inline-flex rounded-full transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label="צפייה בתעודת זהות"
        onClick={onView}
      >
        {badge}
      </button>
    );
  }
  return badge;
}

export function openIdCard(card: EmployeeIdCard | undefined) {
  if (card?.file_url) window.open(card.file_url, "_blank", "noopener,noreferrer");
}
