import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, ErrorState, Icon, PageHeader, PageLoader } from "@/components/ui";
import { useBusinesses } from "@/api/businesses";
import { useProfiles } from "@/api/users";
import { SeatMeter } from "@/components/superadmin/SeatMeter";
import { MODULE_BY_KEY, PLANS, PLAN_LABELS } from "@/lib/features";
import { colorFor, initialsOf } from "@/lib/db";

export function Platform() {
  const navigate = useNavigate();
  const { data: businesses, isLoading, isError, refetch } = useBusinesses();
  const { data: users } = useProfiles();

  const planSpread = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of businesses ?? []) counts.set(b.plan, (counts.get(b.plan) ?? 0) + 1);
    return counts;
  }, [businesses]);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const list = businesses ?? [];
  const activeCount = list.filter((b) => b.active).length;
  const atCapacity = list.filter((b) => b.max_users != null && b.employee_count >= b.max_users).length;

  const kpis = [
    { label: "עסקים פעילים", value: String(activeCount), icon: "storefront" },
    { label: "סה״כ עסקים", value: String(list.length), icon: "store" },
    { label: "סה״כ משתמשים", value: String(users?.length ?? 0), icon: "group" },
    { label: "עסקים במגבלת מושבים", value: String(atCapacity), icon: "group_off" },
  ];

  return (
    <div className="w-full animate-fadeUp">
      <PageHeader
        title="סקירת פלטפורמה"
        subtitle="ניהול כל העסקים, החבילות והמודולים במקום אחד"
        actions={
          <Button icon="add_business" onClick={() => navigate("/businesses")}>
            ניהול עסקים
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-[18px]">
            <span className="grid h-10 w-10 place-items-center rounded-[11px] [background:var(--surface-2)]">
              <Icon name={k.icon} size={22} className="text-ink" />
            </span>
            <div className="mt-3.5 text-[28px] font-extrabold tracking-tight">{k.value}</div>
            <div className="mt-0.5 text-[13px] text-text-2">{k.label}</div>
          </Card>
        ))}
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="text-[16px] font-bold">העסקים בפלטפורמה</div>
            <button onClick={() => navigate("/businesses")} className="text-[13px] font-bold text-link">
              לכל העסקים ←
            </button>
          </div>
          {list.slice(0, 8).map((b) => (
            <div
              key={b.id}
              onClick={() => navigate(`/businesses/${b.id}`)}
              className="flex cursor-pointer items-center gap-3 border-b border-border-2 px-5 py-3.5 text-[13.5px] last:border-0 hover:bg-surface-2"
            >
              <span
                className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] text-[12.5px] font-bold text-white"
                style={{ background: colorFor(b.id) }}
              >
                {initialsOf(b.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{b.name}</span>
                <span className="block text-[11.5px] text-text-3">
                  {PLAN_LABELS[b.plan]} · {b.feature_count} מודולים
                </span>
              </span>
              <span className="hidden w-[130px] flex-none sm:block">
                <SeatMeter used={b.employee_count} cap={b.max_users} />
              </span>
              {b.active ? <Badge tone="success">פעיל</Badge> : <Badge tone="danger">מושהה</Badge>}
            </div>
          ))}
          {list.length === 0 && (
            <div className="px-5 py-10 text-center text-text-2">אין עדיין עסקים. צרו את הראשון.</div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4 text-[16px] font-bold">פילוח חבילות</div>
          <div className="flex flex-col gap-3 p-5">
            {[...PLANS.map((p) => p.id), "custom" as const].map((planId) => {
              const count = planSpread.get(planId) ?? 0;
              const pct = list.length ? Math.round((count / list.length) * 100) : 0;
              const def = PLANS.find((p) => p.id === planId);
              return (
                <div key={planId}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Icon name={def?.icon ?? "tune"} size={16} className="text-text-3" />
                      {PLAN_LABELS[planId]}
                    </span>
                    <span className="font-bold tabular-nums text-text-2">{count}</span>
                  </div>
                  <div className="seat-meter">
                    <div className="seat-meter-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border px-5 py-4">
            <div className="mb-2.5 text-[13px] font-bold">המודולים בקטלוג</div>
            <div className="flex flex-wrap gap-1.5">
              {[...MODULE_BY_KEY.values()].slice(0, 6).map((m) => (
                <span
                  key={m.key}
                  className="flex items-center gap-1 rounded-[7px] bg-surface-2 px-2 py-1 text-[11.5px] font-semibold text-text-2"
                >
                  <Icon name={m.icon} size={14} />
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
