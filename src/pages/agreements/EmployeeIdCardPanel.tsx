import { useEffect, useRef, useState } from "react";
import { Badge, Button, Icon } from "@/components/ui";
import { idCardByEmployee, useEmployeeIdCards, useUploadEmployeeIdCard } from "@/api/employeeIdCards";
import type { EmployeeIdCard } from "@/types/database";
import { PdfFirstPagePreview } from "./pdf";

function formatUploaded(at: string) {
  return new Date(at).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
}

export function EmployeeIdCardUploadPanel({
  businessId,
  employeeId,
  compact,
}: {
  businessId: string;
  employeeId: string;
  /** Smaller layout when embedded in a list */
  compact?: boolean;
}) {
  const { data: cards } = useEmployeeIdCards(businessId);
  const card = idCardByEmployee(cards, employeeId);
  const upload = useUploadEmployeeIdCard(businessId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<"image" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      setError("יש להעלות תמונה (JPG, PNG) או PDF");
      return;
    }
    const previewObj = isImage || isPdf ? URL.createObjectURL(file) : null;
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(previewObj);
    setPendingKind(isPdf ? "pdf" : isImage ? "image" : null);
    try {
      await upload.mutateAsync({ employee_id: employeeId, file });
      if (previewObj) URL.revokeObjectURL(previewObj);
      setLocalPreview(null);
      setPendingKind(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "העלאה נכשלה");
    }
  }

  const busy = upload.isPending;
  const uploaded = !!card && !busy;

  return (
    <section
      className={`id-card-panel${compact ? " id-card-panel--compact" : ""}`}
      aria-label="תעודת זהות"
      data-uploaded={uploaded || undefined}
      data-busy={busy || undefined}
    >
      <div className="id-card-panel__head">
        <span className="id-card-panel__icon" data-tone={uploaded ? "success" : "warning"} aria-hidden>
          <Icon name="badge" size={22} />
        </span>
        <div className="id-card-panel__copy">
          <h2 className="id-card-panel__title">תעודת זהות</h2>
          <p className="id-card-panel__sub">
            {uploaded && card
              ? `הועלתה · ${formatUploaded(card.uploaded_at)}`
              : "חובה להעלות צילום ברור של תעודת הזהות (שני הצדדים בתמונה אחת או PDF)"}
          </p>
        </div>
        {uploaded ? <Badge tone="success">הועלה</Badge> : <Badge tone="warning">חסר</Badge>}
      </div>

      {uploaded && card && !busy && (
        <div className="id-card-panel__actions">
          <a href={card.file_url} target="_blank" rel="noreferrer" className="id-card-panel__view">
            <Icon name="visibility" size={18} />
            צפייה במסמך
          </a>
          <Button type="button" variant="secondary" icon="sync" className="!px-3 !py-2 text-[12.5px]" onClick={() => inputRef.current?.click()}>
            החלפת קובץ
          </Button>
        </div>
      )}

      {(!uploaded || busy) && (
        <div
          className={`id-card-drop${dragOver ? " id-card-drop--over" : ""}${busy ? " id-card-drop--busy" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!busy) inputRef.current?.click();
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
            if (!busy) void handleFile(e.dataTransfer.files[0] ?? null);
          }}
        >
          {busy ? (
            <div className="id-card-drop__busy">
              <span className="id-card-drop__spinner" aria-hidden />
              <span className="id-card-drop__busy-text">מעלה ושומר...</span>
            </div>
          ) : localPreview && pendingKind === "image" ? (
            <div className="id-card-drop__preview">
              <img src={localPreview} alt="" className="id-card-drop__img" />
            </div>
          ) : localPreview && pendingKind === "pdf" ? (
            <PdfFirstPagePreview url={localPreview} maxHeight={160} className="id-card-drop__pdf" />
          ) : (
            <div className="id-card-drop__empty">
              <span className="id-card-drop__glyph">
                <Icon name="add_a_photo" size={28} />
              </span>
              <span className="id-card-drop__label">לחצו או גררו לכאן</span>
              <span className="id-card-drop__hint">תמונה מהמצלמה או PDF · נשמר אוטומטית</span>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />

      {error && (
        <p className="id-card-panel__error" role="alert">
          <Icon name="error" size={16} />
          {error}
        </p>
      )}
    </section>
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
