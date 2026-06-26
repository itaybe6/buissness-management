import { useState } from "react";
import { Badge, Button, Card, Icon, Input, PageHeader, PageLoader, ErrorState } from "@/components/ui";
import { useBusiness, useUpdateBusiness } from "@/api/businesses";
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from "@/api/departments";
import {
  useShiftTemplates,
  useCreateShiftTemplate,
  useUpdateShiftTemplate,
  useDeleteShiftTemplate,
} from "@/api/shifts";
import { useBusinessId } from "@/lib/db";

const SHIFT_COLORS = ["#eab308", "#fdab3d", "#ef4444", "#7c3aed", "#0d9488", "#2563eb"];

export function Settings() {
  const businessId = useBusinessId();
  const { data: biz, isLoading, isError, refetch } = useBusiness(businessId);

  if (isLoading) return <PageLoader />;
  if (isError || !biz) return <ErrorState onRetry={refetch} />;

  return (
    <div className="mx-auto max-w-[1000px] animate-fadeUp">
      <PageHeader title="הגדרות עסק" subtitle="מיקום ורדיוס נוכחות, מחלקות ושעות משמרת" />
      <div className="flex flex-col gap-5">
        <LocationCard businessId={businessId!} />
        <DepartmentsCard businessId={businessId!} />
        <ShiftTemplatesCard businessId={businessId!} />
      </div>
    </div>
  );
}

function LocationCard({ businessId }: { businessId: string }) {
  const { data: biz } = useBusiness(businessId);
  const update = useUpdateBusiness();
  const [lat, setLat] = useState<string | null>(null);
  const [lng, setLng] = useState<string | null>(null);
  const [radius, setRadius] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!biz) return null;
  const latV = lat ?? (biz.location_lat?.toString() ?? "");
  const lngV = lng ?? (biz.location_lng?.toString() ?? "");
  const radV = radius ?? (biz.location_radius_m?.toString() ?? "150");

  function useMyLocation() {
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      () => setMsg("לא ניתן לקבל מיקום מהדפדפן")
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2 text-[16px] font-bold">
        <Icon name="location_on" size={22} className="text-accent-2" /> מיקום לשעון נוכחות
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block"><span className="label-text">קו רוחב (lat)</span>
          <Input className="mt-1.5" value={latV} onChange={(e) => setLat(e.target.value)} style={{ direction: "ltr", textAlign: "right" }} />
        </label>
        <label className="block"><span className="label-text">קו אורך (lng)</span>
          <Input className="mt-1.5" value={lngV} onChange={(e) => setLng(e.target.value)} style={{ direction: "ltr", textAlign: "right" }} />
        </label>
        <label className="block"><span className="label-text">רדיוס (מטרים)</span>
          <Input className="mt-1.5" type="number" value={radV} onChange={(e) => setRadius(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2.5">
        <Button variant="secondary" icon="my_location" onClick={useMyLocation}>השתמש במיקום הנוכחי</Button>
        <Button
          icon="save"
          loading={update.isPending}
          onClick={() =>
            update.mutate({
              id: businessId,
              location_lat: latV ? Number(latV) : null,
              location_lng: lngV ? Number(lngV) : null,
              location_radius_m: radV ? Number(radV) : 150,
            })
          }
        >
          שמירה
        </Button>
        {msg && <span className="text-[13px] font-semibold text-danger">{msg}</span>}
      </div>
    </Card>
  );
}

function DepartmentsCard({ businessId }: { businessId: string }) {
  const { data: departments } = useDepartments(businessId);
  const create = useCreateDepartment();
  const update = useUpdateDepartment(businessId);
  const del = useDeleteDepartment(businessId);
  const [name, setName] = useState("");

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2 text-[16px] font-bold">
        <Icon name="category" size={22} className="text-accent-2" /> מחלקות
      </div>
      <div className="flex flex-col gap-2.5">
        {(departments ?? []).map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5">
            <span className="h-3 w-3 flex-none rounded-full" style={{ background: d.color ?? "#7c3aed" }} />
            <Input
              className="flex-1 !bg-surface"
              defaultValue={d.name}
              onBlur={(e) => e.target.value !== d.name && update.mutate({ id: d.id, name: e.target.value })}
            />
            <button onClick={() => del.mutate(d.id)} className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger">
              <Icon name="delete" size={20} />
            </button>
          </div>
        ))}
        {departments && departments.length === 0 && (
          <div className="py-3 text-center text-[13px] text-text-3">עדיין אין מחלקות. הוסיפו מטבח, בר, מלצרות וכו׳.</div>
        )}
      </div>
      <div className="mt-3 flex gap-2.5">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מחלקה חדשה" />
        <Button
          icon="add"
          loading={create.isPending}
          onClick={() => {
            if (!name.trim()) return;
            create.mutate({
              business_id: businessId,
              name: name.trim(),
              color: SHIFT_COLORS[(departments?.length ?? 0) % SHIFT_COLORS.length],
              sort_order: departments?.length ?? 0,
            });
            setName("");
          }}
        >
          הוספה
        </Button>
      </div>
    </Card>
  );
}

function ShiftTemplatesCard({ businessId }: { businessId: string }) {
  const { data: templates } = useShiftTemplates(businessId);
  const create = useCreateShiftTemplate();
  const update = useUpdateShiftTemplate(businessId);
  const del = useDeleteShiftTemplate(businessId);
  const [name, setName] = useState("");
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("23:30");

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2 text-[16px] font-bold">
        <Icon name="schedule" size={22} className="text-accent-2" /> שעות משמרת
      </div>
      <div className="mb-4 text-[13px] text-text-2">המשמרות שמוגדרות כאן הן אלו שיופיעו בכל המערכת (אילוצים, סידור, טיפים).</div>
      <div className="flex flex-col gap-2.5">
        {(templates ?? []).map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5">
            <span className="h-3 w-3 flex-none rounded-full" style={{ background: t.color ?? "#7c3aed" }} />
            <Input className="!bg-surface min-w-[120px] flex-1" defaultValue={t.name} onBlur={(e) => e.target.value !== t.name && update.mutate({ id: t.id, name: e.target.value })} />
            <input type="time" defaultValue={t.start_time?.slice(0, 5)} onBlur={(e) => update.mutate({ id: t.id, start_time: e.target.value })} className="field !w-[110px] !bg-surface" style={{ direction: "ltr", textAlign: "center" }} />
            <span className="font-bold text-text-3">–</span>
            <input type="time" defaultValue={t.end_time?.slice(0, 5)} onBlur={(e) => update.mutate({ id: t.id, end_time: e.target.value })} className="field !w-[110px] !bg-surface" style={{ direction: "ltr", textAlign: "center" }} />
            <button onClick={() => del.mutate(t.id)} className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger">
              <Icon name="delete" size={20} />
            </button>
          </div>
        ))}
        {templates && templates.length === 0 && (
          <div className="py-3 text-center text-[13px] text-text-3">עדיין אין משמרות. הוסיפו בוקר/צהריים/ערב.</div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2.5">
        <label className="block flex-1 min-w-[120px]"><span className="label-text">שם משמרת</span>
          <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: ערב" />
        </label>
        <label className="block"><span className="label-text">התחלה</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="field mt-1.5 !w-[110px]" style={{ direction: "ltr", textAlign: "center" }} />
        </label>
        <label className="block"><span className="label-text">סיום</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="field mt-1.5 !w-[110px]" style={{ direction: "ltr", textAlign: "center" }} />
        </label>
        <Button
          icon="add"
          loading={create.isPending}
          onClick={() => {
            if (!name.trim()) return;
            create.mutate({
              business_id: businessId,
              name: name.trim(),
              start_time: start,
              end_time: end,
              color: SHIFT_COLORS[(templates?.length ?? 0) % SHIFT_COLORS.length],
              sort_order: templates?.length ?? 0,
            });
            setName("");
          }}
        >
          הוספה
        </Button>
      </div>
      <div className="mt-3"><Badge tone="violet">{templates?.length ?? 0} משמרות פעילות</Badge></div>
    </Card>
  );
}
