import { useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, Icon, PageHeader, PageLoader, ErrorState, Field, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useFaults, useCreateFault, useUpdateFault, uploadFaultPhotos } from "@/api/faults";
import type { FaultStatus } from "@/types/database";

const STATUS_META: Record<FaultStatus, { label: string; tone: "danger" | "warning" | "success"; icon: string; color: string }> = {
  needs_handling: { label: "דורש טיפול", tone: "danger", icon: "error", color: "var(--danger)" },
  in_progress: { label: "בטיפול", tone: "warning", icon: "pending", color: "var(--warning)" },
  handled: { label: "טופל", tone: "success", icon: "check_circle", color: "var(--success)" },
};
const NEXT: Record<FaultStatus, FaultStatus> = { needs_handling: "in_progress", in_progress: "handled", handled: "needs_handling" };

function FaultPhotos({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  if (urls.length === 1) {
    return <img src={urls[0]} alt="תקלה" className="h-36 w-full object-cover" />;
  }
  return (
    <div className="flex h-36 snap-x snap-mandatory gap-1 overflow-x-auto bg-surface-2">
      {urls.map((url, i) => (
        <img key={url} src={url} alt={`תקלה ${i + 1}`} className="h-full w-full min-w-full snap-center object-cover" />
      ))}
    </div>
  );
}

export function Faults() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: faults, isLoading, isError, refetch } = useFaults(businessId);
  const createFault = useCreateFault();
  const updateFault = useUpdateFault(businessId);
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const canReport = profile?.role !== "maintenance";

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const counts = { needs_handling: 0, in_progress: 0, handled: 0 } as Record<FaultStatus, number>;
  (faults ?? []).forEach((f) => (counts[f.status] += 1));

  function resetForm() {
    setDesc("");
    setFiles([]);
    setError(null);
  }

  function addFiles(next: FileList | null) {
    if (!next?.length) return;
    setFiles((prev) => [...prev, ...Array.from(next)]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    setError(null);
    if (!desc.trim()) return setError("נא לתאר את התקלה");
    setBusy(true);
    try {
      const photo_urls = files.length ? await uploadFaultPhotos(businessId!, files) : [];
      await createFault.mutateAsync({
        business_id: businessId!,
        description: desc.trim(),
        photo_urls,
        reported_by: profile?.id,
      });
      setOpen(false);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה. ודאו שקיים Bucket בשם faults ב-Storage.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <PageHeader
        title="דיווח תקלות"
        subtitle="מעקב וטיפול בתקלות · עדכון סטטוס בלחיצה"
        actions={canReport ? <Button icon="add_a_photo" onClick={() => setOpen(true)}>דיווח תקלה חדשה</Button> : undefined}
      />

      <div className="mb-5 grid grid-cols-3 gap-4">
        {(Object.keys(STATUS_META) as FaultStatus[]).map((s) => (
          <Card key={s} className="flex items-center gap-3.5 p-[18px]">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-[12px]" style={{ background: `var(--${STATUS_META[s].tone}-bg)` }}>
              <Icon name={STATUS_META[s].icon} size={24} style={{ color: STATUS_META[s].color }} />
            </span>
            <div>
              <div className="text-[26px] font-extrabold tracking-tight">{counts[s]}</div>
              <div className="text-[12.5px] text-text-2">{STATUS_META[s].label}</div>
            </div>
          </Card>
        ))}
      </div>

      {faults && faults.length === 0 ? (
        <EmptyState icon="build" title="אין תקלות פתוחות" description="כל הכבוד! לא דווחו תקלות." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(faults ?? []).map((f) => {
            const meta = STATUS_META[f.status];
            const photos = f.photo_urls ?? [];
            return (
              <Card key={f.id} className="flex flex-col overflow-hidden p-0">
                <div className="h-1.5" style={{ background: meta.color }} />
                <div className="relative">
                  <FaultPhotos urls={photos} />
                  {photos.length > 1 && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">
                      {photos.length} תמונות
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-[12px]" style={{ background: `var(--${meta.tone}-bg)` }}>
                      <Icon name={meta.icon} size={24} style={{ color: meta.color }} />
                    </span>
                  </div>
                  <div className="mt-3 text-[14.5px] font-bold leading-snug">{f.description}</div>
                  <div className="mt-1.5 text-[12px] text-text-3">{new Date(f.created_at).toLocaleString("he-IL")}</div>
                  <button
                    onClick={() => updateFault.mutate({ id: f.id, status: NEXT[f.status] })}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[11px] py-2.5 text-[13px] font-bold text-white transition active:scale-[0.98]"
                    style={{ background: meta.color }}
                  >
                    <Icon name={meta.icon} size={18} /> {meta.label}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => { setOpen(false); resetForm(); }}
        title="דיווח תקלה"
        icon="build"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>ביטול</Button>
            <Button className="flex-1" loading={busy} onClick={submit}>שליחת דיווח לאחזקה</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />

          {previews.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-36 flex-col items-center justify-center gap-2 rounded-[13px] border border-dashed border-border bg-surface-2 text-text-3 hover:border-accent-2 hover:text-ink"
            >
              <Icon name="add_a_photo" size={34} />
              <span className="text-[13.5px] font-semibold">צילום או העלאת תמונות</span>
              <span className="text-[12px]">ניתן לבחור כמה תמונות</span>
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                {previews.map((url, i) => (
                  <div key={url} className="relative aspect-square overflow-hidden rounded-[11px] bg-surface-2">
                    <img src={url} alt={`תמונה ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                      aria-label="הסרת תמונה"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[11px] border border-dashed border-border bg-surface-2 text-text-3 hover:border-accent-2"
                >
                  <Icon name="add" size={24} />
                  <span className="text-[11px] font-semibold">הוספה</span>
                </button>
              </div>
              <div className="text-[12px] text-text-3">{files.length} תמונות נבחרו</div>
            </div>
          )}

          <Field label="תיאור התקלה">
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="h-24" placeholder="תארו את התקלה..." />
          </Field>
          {error && (
            <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
              <Icon name="error" size={18} /> {error}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
