import { useMemo, useState } from "react";
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
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { ActiveModulesPanel } from "@/components/superadmin/ActiveModulesPanel";
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

  const enabledSet = useMemo(
    () => new Set(Object.entries(features).filter(([, on]) => on).map(([key]) => key as FeatureKey)),
    [features],
  );
  const featuresOn = enabledSet.size;

  function resetForm() {
    setName("");
    setFeatures({ ...DEFAULT_FEATURE_STATE });
    setError(null);
  }

  function closeModal() {
    setOpen(false);
    resetForm();
  }

  async function submit() {
    setError(null);
    if (!name.trim()) return setError("נא להזין שם עסק");
    if (featuresOn === 0) return setError("יש לבחור לפחות מודול אחד");
    try {
      const biz = await create.mutateAsync({ name: name.trim(), features });
      closeModal();
      navigate(`/businesses/${biz.id}`);
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
        onClose={closeModal}
        title="הוספת עסק חדש"
        subtitle="הגדירו שם ומודולים — אחרי היצירה תועברו לעמוד ניהול העסק"
        icon="add_business"
        maxWidth={920}
        fullScreenMobile
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>ביטול</Button>
            <Button className="flex-1" loading={create.isPending} onClick={submit}>
              יצירת העסק
            </Button>
          </>
        }
      >
        <Field label="שם העסק" className="mb-5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: קפה הבוקר"
            autoFocus
          />
          <span className="mt-1.5 block text-[12px] text-text-3">השם יוצג למנהל העסק ולעובדים שלו</span>
        </Field>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-bold uppercase tracking-wide text-text-3">מודולים פעילים</span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="px-3 py-2 text-[12.5px]"
              onClick={() =>
                setFeatures(Object.fromEntries(ALL_FEATURES.map((f) => [f.key, true])) as Record<FeatureKey, boolean>)
              }
            >
              הכל פעיל
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-2 text-[12.5px]"
              onClick={() =>
                setFeatures(Object.fromEntries(ALL_FEATURES.map((f) => [f.key, false])) as Record<FeatureKey, boolean>)
              }
            >
              כבוי הכל
            </Button>
            <Badge tone="violet">{featuresOn} מתוך {ALL_FEATURES.length}</Badge>
          </div>
        </div>

        <ActiveModulesPanel
          enabledSet={enabledSet}
          onToggle={(key, enabled) => setFeatures((state) => ({ ...state, [key]: enabled }))}
        />

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Icon name="error" size={18} /> {error}
          </div>
        )}
      </Modal>
    </div>
  );
}
