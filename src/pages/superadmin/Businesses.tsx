import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Input, PageHeader, PageLoader } from "@/components/ui";
import { CreateBusinessWizard } from "@/components/superadmin/CreateBusinessWizard";
import { SeatMeter } from "@/components/superadmin/SeatMeter";
import { useBusinesses } from "@/api/businesses";
import { PLAN_LABELS } from "@/lib/features";
import { ALL_FEATURES } from "@/lib/constants";
import { colorFor, initialsOf } from "@/lib/db";

export function Businesses() {
  const { data, isLoading, isError, refetch } = useBusinesses();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => (data ?? []).filter((b) => b.name.toLowerCase().includes(search.trim().toLowerCase())),
    [data, search],
  );

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const total = data?.length ?? 0;
  const active = (data ?? []).filter((b) => b.active).length;

  return (
    <div className="w-full animate-fadeUp">
      <PageHeader
        title="עסקים"
        subtitle={`${total} עסקים · ${active} פעילים · ניהול חבילות ומודולים`}
        actions={
          <Button icon="add_business" onClick={() => setOpen(true)}>
            הוספת עסק חדש
          </Button>
        }
      />

      {total === 0 ? (
        <EmptyState
          icon="store"
          title="אין עדיין עסקים"
          description="הקימו את העסק הראשון: בחרו חבילת מודולים והוסיפו לו מנהל מערכת שיקים את הצוות."
          action={<Button icon="add_business" onClick={() => setOpen(true)}>הוספת עסק חדש</Button>}
        />
      ) : (
        <>
          <div className="mb-4 max-w-[360px]">
            <div className="relative">
              <Icon name="search" size={19} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3" />
              <Input
                className="pr-10"
                placeholder="חיפוש עסק..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-auto">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-[2.2fr_1fr_1.2fr_1.4fr_1fr_0.5fr] gap-2 border-b border-border bg-surface-2 px-5 py-3 text-[12px] font-bold text-text-3">
                  <span>עסק</span>
                  <span>חבילה</span>
                  <span>מודולים</span>
                  <span>משתמשים</span>
                  <span>סטטוס</span>
                  <span />
                </div>
                {filtered.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => navigate(`/businesses/${b.id}`)}
                    className="grid cursor-pointer grid-cols-[2.2fr_1fr_1.2fr_1.4fr_1fr_0.5fr] items-center gap-2 border-b border-border-2 px-5 py-3.5 text-[13.5px] last:border-0 hover:bg-surface-2"
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
                    <span>
                      <Badge tone={b.plan === "custom" ? "neutral" : "violet"}>{PLAN_LABELS[b.plan]}</Badge>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] [background:var(--accent-tint)] text-[12px] font-extrabold text-accent-2">
                        {b.feature_count}
                      </span>
                      <span className="text-[12px] text-text-3">מתוך {ALL_FEATURES.length}</span>
                    </span>
                    <span className="pl-3">
                      <SeatMeter used={b.employee_count} cap={b.max_users} />
                    </span>
                    <span>{b.active ? <Badge tone="success">פעיל</Badge> : <Badge tone="danger">מושהה</Badge>}</span>
                    <span className="text-left">
                      <Icon name="chevron_left" size={20} className="text-text-3" />
                    </span>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="px-5 py-10 text-center text-text-2">לא נמצאו עסקים בשם הזה.</div>
                )}
              </div>
            </div>
          </Card>
        </>
      )}

      <CreateBusinessWizard
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(biz) => navigate(`/businesses/${biz.id}`)}
      />
    </div>
  );
}
