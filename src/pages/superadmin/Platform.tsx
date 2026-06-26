import { useNavigate } from "react-router-dom";
import { Card, Icon, PageHeader, PageLoader, ErrorState, Button, Badge } from "@/components/ui";
import { useBusinesses } from "@/api/businesses";
import { useProfiles } from "@/api/users";
import { colorFor, initialsOf } from "@/lib/db";

export function Platform() {
  const navigate = useNavigate();
  const { data: businesses, isLoading, isError, refetch } = useBusinesses();
  const { data: users } = useProfiles();

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const activeCount = (businesses ?? []).filter((b) => b.active).length;
  const kpis = [
    { label: "עסקים פעילים", value: String(activeCount), icon: "storefront" },
    { label: "סה״כ עסקים", value: String(businesses?.length ?? 0), icon: "store" },
    { label: "סה״כ משתמשים", value: String(users?.length ?? 0), icon: "group" },
    { label: "מנהלים", value: String((users ?? []).filter((u) => u.role === "manager").length), icon: "badge" },
  ];

  return (
    <div className="mx-auto max-w-[1220px] animate-fadeUp">
      <PageHeader
        title="סקירת פלטפורמה"
        subtitle="ניהול כל העסקים, המנויים והמודולים במקום אחד"
        actions={<Button icon="add_business" onClick={() => navigate("/businesses")}>ניהול עסקים</Button>}
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

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="text-[16px] font-bold">העסקים בפלטפורמה</div>
          <button onClick={() => navigate("/businesses")} className="text-[13px] font-bold text-link">לכל העסקים ←</button>
        </div>
        {(businesses ?? []).slice(0, 8).map((b) => (
          <div
            key={b.id}
            onClick={() => navigate(`/businesses/${b.id}`)}
            className="flex cursor-pointer items-center gap-3 border-b border-border-2 px-5 py-3.5 text-[13.5px] last:border-0 hover:bg-surface-2"
          >
            <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] text-[12.5px] font-bold text-white" style={{ background: colorFor(b.id) }}>
              {initialsOf(b.name)}
            </span>
            <span className="flex-1 font-bold">{b.name}</span>
            <span className="text-text-3">{b.employee_count} עובדים</span>
            <span className="hidden sm:block"><Badge tone="violet">{b.feature_count} מודולים</Badge></span>
            {b.active ? <Badge tone="success">פעיל</Badge> : <Badge tone="danger">מושהה</Badge>}
          </div>
        ))}
        {businesses && businesses.length === 0 && (
          <div className="px-5 py-10 text-center text-text-2">אין עדיין עסקים. צרו את הראשון.</div>
        )}
      </Card>
    </div>
  );
}
