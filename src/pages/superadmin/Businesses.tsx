import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  PageHeader,
  PageLoader,
  Switch,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useBusinesses, useCreateBusiness } from "@/api/businesses";
import { ALL_FEATURES, DEFAULT_FEATURE_STATE } from "@/lib/constants";
import { colorFor, initialsOf } from "@/lib/db";
import type { FeatureKey } from "@/types/database";

export function Businesses() {
  const { data, isLoading, isError, refetch } = useBusinesses();
  const create = useCreateBusiness();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({ ...DEFAULT_FEATURE_STATE });
  const [error, setError] = useState<string | null>(null);

  const featuresOn = Object.values(features).filter(Boolean).length;

  async function submit() {
    setError(null);
    if (!name.trim()) return setError("נא להזין שם עסק");
    try {
      await create.mutateAsync({ name: name.trim(), features });
      setOpen(false);
      setName("");
      setFeatures({ ...DEFAULT_FEATURE_STATE });
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה ביצירת העסק");
    }
  }

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div className="w-full animate-fadeUp">
      <PageHeader
        title="עסקים"
        subtitle={`${data?.length ?? 0} עסקים · ניהול מנויים ומודולים`}
        actions={
          <Button icon="add_business" onClick={() => setOpen(true)}>
            הוספת עסק חדש
          </Button>
        }
      />

      {data && data.length === 0 ? (
        <EmptyState
          icon="store"
          title="אין עדיין עסקים"
          description="צרו את העסק הראשון ובחרו אילו מודולים יהיו פעילים עבורו."
          action={<Button icon="add_business" onClick={() => setOpen(true)}>הוספת עסק חדש</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[2.4fr_1fr_1.2fr_1fr_0.6fr] gap-2 border-b border-border bg-surface-2 px-5 py-3 text-[12px] font-bold text-text-3">
                <span>עסק</span>
                <span>עובדים</span>
                <span>מודולים</span>
                <span>סטטוס</span>
                <span></span>
              </div>
              {data?.map((b) => (
                <div
                  key={b.id}
                  onClick={() => navigate(`/businesses/${b.id}`)}
                  className="grid cursor-pointer grid-cols-[2.4fr_1fr_1.2fr_1fr_0.6fr] items-center gap-2 border-b border-border-2 px-5 py-3.5 text-[13.5px] hover:bg-surface-2"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] text-[12.5px] font-bold text-white"
                      style={{ background: colorFor(b.id) }}
                    >
                      {initialsOf(b.name)}
                    </span>
                    <span className="truncate font-bold">{b.name}</span>
                  </span>
                  <span className="font-bold">{b.employee_count}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] [background:var(--accent-tint)] text-[12px] font-extrabold text-accent-2">
                      {b.feature_count}
                    </span>
                    <span className="text-[12px] text-text-3">מתוך {ALL_FEATURES.length}</span>
                  </span>
                  <span>
                    {b.active ? <Badge tone="success">פעיל</Badge> : <Badge tone="danger">מושהה</Badge>}
                  </span>
                  <span className="text-left">
                    <Icon name="chevron_left" size={20} className="text-text-3" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="הוספת עסק חדש"
        subtitle="בחרו אילו מודולים יהיו פעילים"
        icon="add_business"
        maxWidth={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>ביטול</Button>
            <Button className="flex-1" loading={create.isPending} onClick={submit}>יצירת העסק</Button>
          </>
        }
      >
        <Field label="שם העסק" className="mb-5">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: קפה הבוקר" />
        </Field>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-bold uppercase tracking-wide text-text-3">מודולים פעילים</span>
          <Badge tone="violet">{featuresOn} מתוך {ALL_FEATURES.length}</Badge>
        </div>
        <div className="flex flex-col gap-2.5">
          {ALL_FEATURES.map((f) => {
            const on = features[f.key];
            return (
              <div
                key={f.key}
                onClick={() => setFeatures((s) => ({ ...s, [f.key]: !s[f.key] }))}
                className="flex cursor-pointer items-center gap-3 rounded-[12px] border px-3.5 py-3 transition"
                style={{
                  borderColor: on ? "var(--accent-2)" : "var(--border)",
                  background: on ? "var(--accent-tint)" : "var(--surface)",
                }}
              >
                <span
                  className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px]"
                  style={{ background: on ? "var(--accent)" : "var(--surface-2)" }}
                >
                  <Icon name={f.icon} size={20} className={on ? "text-white" : "text-text-3"} />
                </span>
                <span className="flex-1 text-[14px] font-semibold">{f.label}</span>
                <Switch checked={on} />
              </div>
            );
          })}
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Icon name="error" size={18} /> {error}
          </div>
        )}
      </Modal>
    </div>
  );
}
