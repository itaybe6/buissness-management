import { useRef, useState } from "react";
import { Button, Card, EmptyState, Icon, PageHeader, PageLoader, ErrorState, Field, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useFaults, useCreateFault, useUpdateFault, uploadFaultPhoto } from "@/api/faults";
import type { FaultStatus } from "@/types/database";

const STATUS_META: Record<FaultStatus, { label: string; tone: "danger" | "warning" | "success"; icon: string; color: string }> = {
  needs_handling: { label: "דורש טיפול", tone: "danger", icon: "error", color: "var(--danger)" },
  in_progress: { label: "בטיפול", tone: "warning", icon: "pending", color: "var(--warning)" },
  handled: { label: "טופל", tone: "success", icon: "check_circle", color: "var(--success)" },
};
const NEXT: Record<FaultStatus, FaultStatus> = { needs_handling: "in_progress", in_progress: "handled", handled: "needs_handling" };

export function Faults() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: faults, isLoading, isError, refetch } = useFaults(businessId);
  const createFault = useCreateFault();
  const updateFault = useUpdateFault(businessId);
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canReport = profile?.role !== "maintenance";

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const counts = { needs_handling: 0, in_progress: 0, handled: 0 } as Record<FaultStatus, number>;
  (faults ?? []).forEach((f) => (counts[f.status] += 1));

  async function submit() {
    setError(null);
    if (!desc.trim()) return setError("נא לתאר את התקלה");
    setBusy(true);
    try {
      let photo_url: string | null = null;
      if (file) photo_url = await uploadFaultPhoto(businessId!, file);
      await createFault.mutateAsync({ business_id: businessId!, description: desc.trim(), photo_url, reported_by: profile?.id });
      setOpen(false); setDesc(""); setFile(null);
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
            return (
              <Card key={f.id} className="flex flex-col overflow-hidden p-0">
                <div className="h-1.5" style={{ background: meta.color }} />
                {f.photo_url && <img src={f.photo_url} alt="תקלה" className="h-36 w-full object-cover" />}
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
        onClose={() => setOpen(false)}
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
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-32 flex-col items-center justify-center gap-2 rounded-[13px] border border-dashed border-border bg-surface-2 text-text-3 hover:border-accent-2 hover:text-ink"
          >
            {file ? (
              <>
                <Icon name="check_circle" size={30} className="text-success" />
                <span className="text-[13px] font-semibold">{file.name}</span>
              </>
            ) : (
              <>
                <Icon name="add_a_photo" size={34} />
                <span className="text-[13.5px] font-semibold">צילום או העלאת תמונה</span>
              </>
            )}
          </button>
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
