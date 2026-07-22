import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, InlineLoader, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  uploadReceiptFile,
  useCreateOfficeReceipt,
  useDeleteOfficeReceipt,
  useOfficeReceipts,
  type CreateOfficeReceiptInput,
} from "@/api/officeReceipts";
import { useSuppliers } from "@/api/suppliers";
import { formatCurrency, todayISO } from "@/lib/db";
import type { OfficeReceipt, ReceiptType } from "@/types/database";
import { PdfFirstPagePreview } from "./pdf";
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ vendor: string; type: ReceiptType; amount: number } | null>(null);
  const { data: receipts, isLoading } = useOfficeReceipts(businessId, month);
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
        <div>
          <h2 className="text-[17px] font-extrabold tracking-tight">חשבוניות וקבלות</h2>
          <p className="mt-0.5 text-[13px] text-text-2">מעקב וארכיון מסמכים פיננסיים</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="!w-[150px]" />
          {canManage && (
            <Button icon="add" onClick={() => setUploadOpen(true)} className="hidden sm:inline-flex">
              מסמך חדש
            </Button>
          )}
        </div>
      </div>

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
  const [vendorDetails, setVendorDetails] = useState("");
  const [documentDate, setDocumentDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: suppliers } = useSuppliers(businessId, { activeOnly: true });

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function clearFile() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function pickFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    if (f.type.startsWith("image/") || f.type === "application/pdf") {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }
  }

  function pickSupplier(id: string) {
    setSupplierId(id);
    const s = (suppliers ?? []).find((x) => x.id === id);
    if (s) {
      setVendorName(s.name);
      if (s.tax_id && !vendorDetails.trim()) setVendorDetails(s.tax_id);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedAmount = parseFloat(amount.replace(/,/g, ""));
    if (!vendorName.trim()) return setError("יש למלא את שם הספק / מי הוציא את המסמך");
    if (!parsedAmount || parsedAmount <= 0) return setError("יש למלא סכום תקין");
    if (!file) return setError("יש להעלות תמונה או קובץ של המסמך");

    const savedVendor = vendorName.trim();
    const savedType = type;
    const savedAmount = parsedAmount;

    setUploading(true);
    try {
      const fileUrl = await uploadReceiptFile(businessId, file);
      await onSave({
        business_id: businessId,
        type,
        amount: parsedAmount,
        vendor_name: savedVendor,
        vendor_details: vendorDetails.trim() || null,
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
          <p className="mt-1 text-[12px] text-text-3">בחירת ספק תמלא את השם ותאפשר לראות מסמכים והזמנות בעמוד הספקים.</p>
        </Field>
      )}

      <Field label="שם הספק / מי הוציא את המסמך">
        <Input
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
          placeholder="לדוגמה: סלקום, רמי לוי, חברת חשמל"
          required
        />
      </Field>

      <Field label="פרטים נוספים (ח.פ, כתובת, הערות על הספק)">
        <Textarea
          rows={2}
          value={vendorDetails}
          onChange={(e) => setVendorDetails(e.target.value)}
          placeholder="מספר עוסק, כתובת, איש קשר..."
        />
      </Field>

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
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files[0] ?? null);
          }}
          onClick={() => inputRef.current?.click()}
          className={`receipt-dropzone relative cursor-pointer overflow-hidden rounded-[14px] border-2 border-dashed transition ${
            dragOver ? "border-accent bg-[var(--accent-tint)]" : "border-border hover:border-accent/40 hover:bg-surface-2"
          }`}
        >
          {preview && isImage ? (
            <div className="relative">
              <img src={preview} alt="תצוגה מקדימה" className="max-h-48 w-full object-contain p-2" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clearFile(); }}
                className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white hover:bg-black/75"
                aria-label="הסרת קובץ"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : preview && isPdf ? (
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <PdfFirstPagePreview url={preview} maxHeight={200} className="min-h-[140px] p-2" />
              <div className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2">
                <Icon name="picture_as_pdf" size={18} className="shrink-0 text-danger" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-2">{file?.name}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearFile(); }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-text-2 hover:bg-black/10"
                  aria-label="הסרת קובץ"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
          ) : file ? (
            <div className="relative flex flex-col items-center gap-2 py-8 text-text-2">
              <Icon name="picture_as_pdf" size={36} />
              <span className="max-w-[90%] truncate text-[13px] font-semibold">{file.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clearFile(); }}
                className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white hover:bg-black/75"
                aria-label="הסרת קובץ"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-text-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2">
                <Icon name="cloud_upload" size={26} />
              </span>
              <span className="text-[13px] font-bold text-text-2">גררי קובץ לכאן או לחצי לבחירה</span>
              <span className="text-[11.5px]">תמונה (JPG, PNG) או PDF</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
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
