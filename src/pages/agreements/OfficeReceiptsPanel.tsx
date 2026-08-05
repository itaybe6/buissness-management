import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, InlineLoader, MonthPickerButton, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  uploadReceiptFiles,
  useAllOfficeReceipts,
  useCreateOfficeReceipt,
  useDeleteOfficeReceipt,
  useOfficeReceipts,
  type CreateOfficeReceiptInput,
} from "@/api/officeReceipts";
import { useSuppliers } from "@/api/suppliers";
import { formatCurrency, todayISO } from "@/lib/db";
import type { OfficeReceipt, ReceiptType } from "@/types/database";
import { PdfFirstPagePreview } from "./pdf";
import { SupplierSpendPanel } from "./SupplierSpendPanel";
import { RECEIPT_TYPE_ICONS, RECEIPT_TYPE_LABELS, RECEIPT_TYPES } from "./types";

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
}

function formatDocDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
}

const TYPE_TONE: Record<ReceiptType, "info" | "violet" | "success"> = {
  tax_invoice: "info",
  tax_invoice_receipt: "violet",
  receipt: "success",
};

type ReceiptsView = "docs" | "analysis";

const RECEIPT_VIEWS: { key: ReceiptsView; label: string; icon: string }[] = [
  { key: "docs", label: "כל המסמכים", icon: "receipt_long" },
  { key: "analysis", label: "ניתוח ספקים", icon: "insights" },
];

export function OfficeReceiptsPanel({
  businessId,
  profileId,
  canManage,
}: {
  businessId: string;
  profileId: string;
  canManage: boolean;
}) {
  const [month, setMonth] = useState(monthNow());
  const [view, setView] = useState<ReceiptsView>("docs");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ vendor: string; type: ReceiptType; amount: number } | null>(null);
  const { data: receipts, isLoading } = useOfficeReceipts(businessId, month);
  const { data: allReceipts, isLoading: allLoading } = useAllOfficeReceipts(businessId);
  const create = useCreateOfficeReceipt(businessId);
  const del = useDeleteOfficeReceipt(businessId);

  const stats = useMemo(() => {
    const list = receipts ?? [];
    const total = list.reduce((s, r) => s + Number(r.amount), 0);
    const byType = RECEIPT_TYPES.reduce(
      (acc, t) => ({ ...acc, [t]: list.filter((r) => r.type === t).length }),
      {} as Record<ReceiptType, number>
    );
    return { count: list.length, total, byType };
  }, [receipts]);

  return (
    <div className="receipts-panel space-y-6">
      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="receipt_long" label="מסמכים בחודש" value={String(stats.count)} delay={0} />
        <StatCard icon="account_balance_wallet" label="סה״כ סכומים" value={formatCurrency(stats.total)} delay={1} accent />
        <StatCard icon="receipt" label="חשבוניות מס" value={String(stats.byType.tax_invoice)} delay={2} />
        <StatCard icon="payments" label="קבלות" value={String(stats.byType.receipt + stats.byType.tax_invoice_receipt)} delay={3} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="receipts-viewswitch" role="tablist" aria-label="תצוגת מסמכים">
          {RECEIPT_VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              data-active={view === v.key}
              className="receipts-viewswitch__btn"
              onClick={() => setView(v.key)}
            >
              <Icon name={v.icon} size={18} />
              <span>{v.label}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPickerButton value={month} onChange={setMonth} variant="primary" />
          {canManage && (
            <Button icon="add" onClick={() => setUploadOpen(true)} className="hidden sm:inline-flex">
              מסמך חדש
            </Button>
          )}
        </div>
      </div>

      {view === "analysis" ? (
        <section className="min-w-0 page-enter">
          <SupplierSpendPanel receipts={allReceipts ?? []} isLoading={allLoading} month={month} />
        </section>
      ) : (
        <section className="min-w-0">
          {isLoading ? (
            <InlineLoader label="טוען מסמכים..." />
          ) : (receipts ?? []).length === 0 ? (
            <EmptyState
              icon="receipt_long"
              title="אין מסמכים בחודש זה"
              description="העלי חשבונית או קבלה חדשה באמצעות כפתור הפלוס."
              action={
                canManage ? (
                  <Button icon="add" onClick={() => setUploadOpen(true)}>
                    העלאת מסמך
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {(receipts ?? []).map((r, i) => (
                <ReceiptRow
                  key={r.id}
                  receipt={r}
                  index={i}
                  canManage={canManage}
                  deleting={del.isPending}
                  onDelete={() => confirm("למחוק את המסמך?") && del.mutate(r.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {canManage && (
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="receipt-fab sm:hidden"
          aria-label="העלאת מסמך חדש"
        >
          <Icon name="add" size={28} />
        </button>
      )}

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="העלאת מסמך חדש"
        subtitle="בחרי סוג, מלאי פרטים והעלי קובץ"
        icon="upload_file"
        maxWidth={520}
      >
        <UploadForm
          key={uploadOpen ? "open" : "closed"}
          businessId={businessId}
          profileId={profileId}
          saving={create.isPending}
          onSave={async (input) => {
            await create.mutateAsync(input);
          }}
          onSuccess={(info) => {
            setUploadOpen(false);
            setSuccessInfo(info);
            setSuccessOpen(true);
          }}
        />
      </Modal>

      <Modal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
        title="המסמך הועלה בהצלחה"
        subtitle="המסמך נשמר בארכיון החשבוניות והקבלות"
        icon="check_circle"
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              className="flex-1"
              icon="add"
              onClick={() => {
                setSuccessOpen(false);
                setUploadOpen(true);
              }}
            >
              מסמך נוסף
            </Button>
            <Button className="flex-1" icon="done" onClick={() => setSuccessOpen(false)}>
              סיום
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full [background:var(--success-bg)] text-success">
            <Icon name="task_alt" size={34} />
          </span>
          <div>
            <p className="text-[15px] font-extrabold text-text">ההעלאה הושלמה</p>
            <p className="mt-1 text-[13px] text-text-2">המסמך מופיע ברשימה למטה.</p>
          </div>
          {successInfo && (
            <div className="w-full space-y-2 rounded-[14px] border border-border bg-surface-2 px-4 py-3 text-right">
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-text-3">ספק</span>
                <span className="font-bold text-text">{successInfo.vendor}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-text-3">סוג</span>
                <span className="font-bold text-text">{RECEIPT_TYPE_LABELS[successInfo.type]}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-text-3">סכום</span>
                <span className="font-extrabold tabular-nums text-text">{formatCurrency(successInfo.amount)}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  delay,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  delay: number;
  accent?: boolean;
}) {
  return (
    <Card
      className="receipt-stat p-4"
      style={{ animationDelay: `${delay * 60}ms` }}
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-[11px] ${accent ? "[background:var(--accent-tint)]" : "bg-surface-2"}`}
      >
        <Icon name={icon} size={21} className={accent ? "text-accent-2" : "text-ink"} />
      </span>
      <div
        className={`mt-3 text-[22px] font-extrabold tracking-tight tabular-nums ${accent ? "text-accent-2" : ""}`}
      >
        {value}
      </div>
      <div className="text-[12.5px] text-text-2">{label}</div>
    </Card>
  );
}

function ReceiptRow({
  receipt: r,
  index,
  canManage,
  deleting,
  onDelete,
}: {
  receipt: OfficeReceipt;
  index: number;
  canManage: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <Card
      className="receipt-row group overflow-hidden transition hover:shadow-md"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex gap-4 p-4">
        <a
          href={r.file_url}
          target="_blank"
          rel="noreferrer"
          className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[12px] border border-border bg-surface-2 transition group-hover:border-accent/30"
        >
          {isImageUrl(r.file_url) ? (
            <img src={r.file_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-text-3">
              <Icon name="picture_as_pdf" size={28} />
            </span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
            <Icon name="open_in_new" size={20} className="text-white" />
          </span>
        </a>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold">{r.vendor_name}</div>
              {r.vendor_details && (
                <div className="mt-0.5 line-clamp-2 text-[12.5px] text-text-3">{r.vendor_details}</div>
              )}
            </div>
            <Badge tone={TYPE_TONE[r.type]}>{RECEIPT_TYPE_LABELS[r.type]}</Badge>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-text-2">
            <span className="flex items-center gap-1 font-extrabold tabular-nums text-text">
              <Icon name="payments" size={15} />
              {formatCurrency(Number(r.amount))}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="calendar_today" size={15} />
              {formatDocDate(r.document_date)}
            </span>
          </div>
          {r.notes && <p className="mt-2 text-[12px] text-text-3">{r.notes}</p>}
        </div>

        {canManage && (
          <Button
            variant="ghost"
            icon="delete"
            className="shrink-0 self-start text-danger opacity-0 transition group-hover:opacity-100"
            loading={deleting}
            onClick={onDelete}
            aria-label="מחיקה"
          />
        )}
      </div>
    </Card>
  );
}

type PreviewItem = { file: File; url: string | null };

function ReceiptFilePreview({
  file,
  preview,
  isImage,
  isPdf,
  onClear,
  onReplace,
  empty,
}: {
  file: File | null;
  preview: string | null;
  isImage: boolean;
  isPdf: boolean;
  onClear: () => void;
  onReplace?: () => void;
  empty?: ReactNode;
}) {
  if (!file) return empty ?? null;

  return (
    <div className="receipt-file-preview">
      {preview && isImage ? (
        <div className="receipt-file-preview__media">
          <img src={preview} alt="תצוגה מקדימה" className="receipt-file-preview__img" />
        </div>
      ) : preview && isPdf ? (
        <div className="receipt-file-preview__media" onClick={(e) => e.stopPropagation()}>
          <PdfFirstPagePreview url={preview} maxHeight={200} className="min-h-[140px] p-2" />
        </div>
      ) : (
        <div className="receipt-file-preview__fallback">
          <Icon name="picture_as_pdf" size={36} />
        </div>
      )}

      <div className="receipt-file-preview__meta">
        <div className="receipt-file-preview__info">
          <span className="receipt-file-preview__badge" aria-hidden>
            <Icon name={isPdf ? "picture_as_pdf" : "image"} size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-text">{file.name}</span>
            <span className="block text-[11.5px] text-text-3">
              {isPdf ? "מסמך PDF" : isImage ? "תמונה" : "קובץ"}
            </span>
          </span>
        </div>
        <div className="receipt-file-preview__actions">
          {onReplace && (
            <button type="button" className="receipt-file-preview__replace press" onClick={onReplace}>
              <Icon name="swap_horiz" size={16} />
              החלפה
            </button>
          )}
          <button
            type="button"
            className="receipt-file-preview__remove press"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            aria-label="הסרת קובץ"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileReceiptPhotos({
  items,
  onRemoveAt,
  onClear,
  onCaptureMore,
  onAddGallery,
}: {
  items: PreviewItem[];
  onRemoveAt: (index: number) => void;
  onClear: () => void;
  onCaptureMore: () => void;
  onAddGallery: () => void;
}) {
  const onlyPdf = items.length === 1 && items[0].file.type === "application/pdf";
  const first = items[0];

  if (onlyPdf && first) {
    return (
      <ReceiptFilePreview
        file={first.file}
        preview={first.url}
        isImage={false}
        isPdf
        onClear={onClear}
        onReplace={onClear}
      />
    );
  }

  return (
    <div className="receipt-photos">
      <div className="receipt-photos__strip" role="list" aria-label="תמונות המסמך">
        {items.map((item, i) => (
          <div key={`${item.file.name}-${i}`} className="receipt-photos__item" role="listitem">
            {item.url && item.file.type.startsWith("image/") ? (
              <img src={item.url} alt={`תמונה ${i + 1}`} className="receipt-photos__thumb" />
            ) : (
              <span className="receipt-photos__fallback">
                <Icon name="image" size={22} />
              </span>
            )}
            <button
              type="button"
              className="receipt-photos__remove press"
              onClick={() => onRemoveAt(i)}
              aria-label={`הסרת תמונה ${i + 1}`}
            >
              <Icon name="close" size={14} />
            </button>
            <span className="receipt-photos__page">{i + 1}</span>
          </div>
        ))}
      </div>

      <p className="receipt-photos__count">
        {items.length === 1 ? "תמונה אחת — אפשר לצלם עוד עמודים" : `${items.length} תמונות ישמרו כמסמך אחד`}
      </p>

      <div className="receipt-photos__actions">
        <button type="button" className="receipt-photos__action press" data-kind="camera" onClick={onCaptureMore}>
          <Icon name="photo_camera" size={18} />
          צלם עוד
        </button>
        <button type="button" className="receipt-photos__action press" data-kind="gallery" onClick={onAddGallery}>
          <Icon name="add_photo_alternate" size={18} />
          מהגלריה
        </button>
        <button type="button" className="receipt-photos__action press" data-kind="clear" onClick={onClear}>
          <Icon name="delete" size={18} />
          נקה
        </button>
      </div>
    </div>
  );
}

function UploadForm({
  businessId,
  profileId,
  saving,
  onSave,
  onSuccess,
}: {
  businessId: string;
  profileId: string;
  saving: boolean;
  onSave: (input: CreateOfficeReceiptInput) => Promise<void>;
  onSuccess: (info: { vendor: string; type: ReceiptType; amount: number }) => void;
}) {
  const [type, setType] = useState<ReceiptType>("tax_invoice");
  const [amount, setAmount] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [documentDate, setDocumentDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<PreviewItem[]>([]);
  const { data: suppliers } = useSuppliers(businessId, { activeOnly: true });

  itemsRef.current = items;

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        if (item.url) URL.revokeObjectURL(item.url);
      }
    };
  }, []);

  function revokeAll(list: PreviewItem[]) {
    for (const item of list) {
      if (item.url) URL.revokeObjectURL(item.url);
    }
  }

  function toPreviewItem(f: File): PreviewItem {
    const url =
      f.type.startsWith("image/") || f.type === "application/pdf" ? URL.createObjectURL(f) : null;
    return { file: f, url };
  }

  function clearFile() {
    setItems((prev) => {
      revokeAll(prev);
      return [];
    });
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
    if (filesRef.current) filesRef.current.value = "";
    if (desktopInputRef.current) desktopInputRef.current.value = "";
  }

  function removeAt(index: number) {
    setItems((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed?.url) URL.revokeObjectURL(removed.url);
      return next;
    });
  }

  /** Replace all files (desktop / PDF / single pick). */
  function replaceFiles(list: File[]) {
    if (list.length === 0) return;
    setError(null);
    setItems((prev) => {
      revokeAll(prev);
      return list.map(toPreviewItem);
    });
  }

  /** Append images (camera / gallery on mobile). PDF replaces the set. */
  function appendFiles(list: File[]) {
    if (list.length === 0) return;
    setError(null);
    const pdf = list.find((f) => f.type === "application/pdf");
    if (pdf) {
      replaceFiles([pdf]);
      return;
    }
    const images = list.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      setError("יש להעלות תמונה (JPG, PNG) או PDF");
      return;
    }
    setItems((prev) => {
      // Drop a lone PDF if user starts adding photos again
      if (prev.length === 1 && prev[0].file.type === "application/pdf") {
        revokeAll(prev);
        return images.map(toPreviewItem);
      }
      return [...prev, ...images.map(toPreviewItem)];
    });
  }

  function openMobileSource(source: "camera" | "gallery" | "files") {
    setError(null);
    window.setTimeout(() => {
      if (source === "camera") cameraRef.current?.click();
      else if (source === "gallery") galleryRef.current?.click();
      else filesRef.current?.click();
    }, 80);
  }

  function pickSupplier(id: string) {
    setSupplierId(id);
    const s = (suppliers ?? []).find((x) => x.id === id);
    setVendorName(s?.name ?? "");
  }

  const linkedSupplier = supplierId ? (suppliers ?? []).find((x) => x.id === supplierId) : null;
  const files = items.map((i) => i.file);
  const file = files[0] ?? null;
  const preview = items[0]?.url ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedAmount = parseFloat(amount.replace(/,/g, ""));
    const savedVendor = linkedSupplier?.name ?? vendorName.trim();
    if (!savedVendor) return setError("יש לבחור ספק או למלא את שם מי שהוציא את המסמך");
    if (!parsedAmount || parsedAmount <= 0) return setError("יש למלא סכום תקין");
    if (files.length === 0) return setError("יש להעלות תמונה או קובץ של המסמך");
    const savedType = type;
    const savedAmount = parsedAmount;

    setUploading(true);
    try {
      const fileUrl = await uploadReceiptFiles(businessId, files);
      await onSave({
        business_id: businessId,
        type,
        amount: parsedAmount,
        vendor_name: savedVendor,
        supplier_id: supplierId || null,
        document_date: documentDate || null,
        file_url: fileUrl,
        notes: notes.trim() || null,
        created_by: profileId,
      });
      onSuccess({ vendor: savedVendor, type: savedType, amount: savedAmount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת המסמך נכשלה");
    } finally {
      setUploading(false);
    }
  }

  const busy = saving || uploading;
  const isPdf = file?.type === "application/pdf";
  const isImage = Boolean(file?.type.startsWith("image/"));
  const hasFiles = items.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="סוג המסמך">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {RECEIPT_TYPES.map((t) => {
            const active = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`receipt-type-btn flex flex-col items-center gap-1.5 rounded-[12px] border px-3 py-3.5 text-center transition ${
                  active
                    ? "border-accent bg-[var(--accent-tint)] text-accent-2 shadow-sm"
                    : "border-border bg-surface hover:border-accent/30 hover:bg-surface-2"
                }`}
              >
                <Icon name={RECEIPT_TYPE_ICONS[t]} size={22} />
                <span className="text-[11.5px] font-bold leading-tight">{RECEIPT_TYPE_LABELS[t]}</span>
              </button>
            );
          })}
        </div>
      </Field>

      {(suppliers?.length ?? 0) > 0 && (
        <Field label="קישור לספק במערכת (אופציונלי)">
          <Select
            value={supplierId}
            onChange={(e) => pickSupplier(e.target.value)}
            searchable
            searchPlaceholder="בחר ספק..."
          >
            <option value="">ללא קישור — שם חופשי למטה</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-[12px] text-text-3">
            {linkedSupplier
              ? `המסמך יקושר ל${linkedSupplier.name} — לא צריך למלא שם ספק בנפרד.`
              : "בחירת ספק תקשר את המסמך לעמוד הספקים. ללא קישור — מלאי שם חופשי למטה."}
          </p>
        </Field>
      )}

      {!linkedSupplier && (
        <Field label="שם הספק / מי הוציא את המסמך">
          <Input
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="לדוגמה: סלקום, רמי לוי, חברת חשמל"
            required
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="סכום (₪)">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="tabular-nums"
            style={{ direction: "ltr", textAlign: "right" }}
            required
          />
        </Field>
        <Field label="תאריך המסמך">
          <Input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
        </Field>
      </div>

      <Field label="הערות (אופציונלי)">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות פנימיות..." />
      </Field>

      <Field label="תמונה / קובץ של המסמך">
        {/* Mobile: camera / gallery / files */}
        <div className="receipt-upload-mobile sm:hidden">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              appendFiles(e.target.files ? Array.from(e.target.files) : []);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              appendFiles(e.target.files ? Array.from(e.target.files) : []);
              e.target.value = "";
            }}
          />
          <input
            ref={filesRef}
            type="file"
            accept="application/pdf,image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const list = e.target.files ? Array.from(e.target.files) : [];
              if (list[0]?.type === "application/pdf") replaceFiles(list.slice(0, 1));
              else appendFiles(list);
              e.target.value = "";
            }}
          />

          {hasFiles ? (
            <MobileReceiptPhotos
              items={items}
              onRemoveAt={removeAt}
              onClear={clearFile}
              onCaptureMore={() => openMobileSource("camera")}
              onAddGallery={() => openMobileSource("gallery")}
            />
          ) : (
            <div className="receipt-upload-sources" role="group" aria-label="בחירת מקור הקובץ">
              <button
                type="button"
                className="receipt-upload-source press"
                data-kind="camera"
                onClick={() => openMobileSource("camera")}
              >
                <span className="receipt-upload-source__icon" aria-hidden>
                  <Icon name="photo_camera" size={24} />
                </span>
                <span className="receipt-upload-source__label">מצלמה</span>
                <span className="receipt-upload-source__hint">צילום מסמך</span>
              </button>
              <button
                type="button"
                className="receipt-upload-source press"
                data-kind="gallery"
                onClick={() => openMobileSource("gallery")}
              >
                <span className="receipt-upload-source__icon" aria-hidden>
                  <Icon name="photo_library" size={24} />
                </span>
                <span className="receipt-upload-source__label">גלריה</span>
                <span className="receipt-upload-source__hint">תמונה מהמכשיר</span>
              </button>
              <button
                type="button"
                className="receipt-upload-source press"
                data-kind="files"
                onClick={() => openMobileSource("files")}
              >
                <span className="receipt-upload-source__icon" aria-hidden>
                  <Icon name="folder_open" size={24} />
                </span>
                <span className="receipt-upload-source__label">מסמכים</span>
                <span className="receipt-upload-source__hint">PDF או קובץ</span>
              </button>
            </div>
          )}

          {!hasFiles && (
            <p className="receipt-upload-mobile__note">
              <Icon name="info" size={14} />
              אפשר לצלם כמה עמודים ברצף · JPG, PNG או PDF
            </p>
          )}
        </div>

        {/* Desktop: drag & drop */}
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && desktopInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const list = Array.from(e.dataTransfer.files);
            if (list.length > 1 && list.every((f) => f.type.startsWith("image/"))) appendFiles(list);
            else if (list[0]) replaceFiles([list[0]]);
          }}
          onClick={() => desktopInputRef.current?.click()}
          className={`receipt-dropzone relative hidden cursor-pointer overflow-hidden rounded-[14px] border-2 border-dashed transition sm:block ${
            dragOver ? "border-accent bg-[var(--accent-tint)]" : "border-border hover:border-accent/40 hover:bg-surface-2"
          }`}
        >
          {items.length > 1 ? (
            <div className="p-3" onClick={(e) => e.stopPropagation()}>
              <MobileReceiptPhotos
                items={items}
                onRemoveAt={removeAt}
                onClear={clearFile}
                onCaptureMore={() => desktopInputRef.current?.click()}
                onAddGallery={() => desktopInputRef.current?.click()}
              />
            </div>
          ) : (
            <ReceiptFilePreview
              file={file}
              preview={preview}
              isImage={isImage}
              isPdf={Boolean(isPdf)}
              onClear={clearFile}
              empty={
                <div className="flex flex-col items-center gap-2 py-8 text-text-3">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2">
                    <Icon name="cloud_upload" size={26} />
                  </span>
                  <span className="text-[13px] font-bold text-text-2">גררי קובץ לכאן או לחצי לבחירה</span>
                  <span className="text-[11.5px]">תמונה (JPG, PNG) או PDF — אפשר כמה תמונות</span>
                </div>
              }
            />
          )}
          <input
            ref={desktopInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = e.target.files ? Array.from(e.target.files) : [];
              if (list.length > 1 && list.every((f) => f.type.startsWith("image/"))) appendFiles(list);
              else if (list[0]) {
                if (hasFiles && list[0].type.startsWith("image/")) appendFiles(list);
                else replaceFiles(list.slice(0, 1));
              }
              e.target.value = "";
            }}
          />
        </div>
      </Field>

      {error && (
        <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
          <Icon name="error" size={18} />
          {error}
        </div>
      )}

      <Button type="submit" icon="save" className="w-full" loading={busy} disabled={busy}>
        {uploading ? "מעלה ושומר..." : "שמירת המסמך"}
      </Button>
    </form>
  );
}
