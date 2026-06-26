import { useState } from "react";
import { Badge, Button, Card, EmptyState, Icon, Input, PageHeader, PageLoader, ErrorState, Switch } from "@/components/ui";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useBusiness, useUpdateBusiness } from "@/api/businesses";
import { ATTENDANCE_RADIUS_M } from "@/lib/constants";
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

  if (!businessId) {
    return (
      <EmptyState
        icon="store"
        title="לא משויך לעסק"
        description="המשתמש שלך עדיין לא משויך לעסק. פנו לסופר אדמין כדי לשייך אתכם לעסק."
      />
    );
  }

  if (isLoading) return <PageLoader />;
  if (isError || !biz) return <ErrorState onRetry={refetch} />;

  return (
    <div className="mx-auto max-w-[1000px] animate-fadeUp">
      <PageHeader title="הגדרות עסק" subtitle="שם העסק, כתובת, מחלקות ושעות משמרת" />
      <div className="flex flex-col gap-5">
        <BusinessNameCard businessId={businessId!} />
        <LocationCard businessId={businessId!} />
        <DepartmentsCard businessId={businessId!} />
        <ShiftTemplatesCard businessId={businessId!} />
      </div>
    </div>
  );
}

function BusinessNameCard({ businessId }: { businessId: string }) {
  const { data: biz } = useBusiness(businessId);
  const update = useUpdateBusiness();
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!biz) return null;

  const nameV = name ?? biz.name;
  const unchanged = nameV.trim() === biz.name;

  function handleSave() {
    setMsg(null);
    if (!nameV.trim()) {
      setMsg("יש להזין שם עסק");
      return;
    }
    update.mutate(
      { id: businessId, name: nameV.trim() },
      {
        onSuccess: () => {
          setMsg(null);
          setSaved(true);
        },
        onError: () => setMsg("שמירה נכשלה"),
      }
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2 text-[16px] font-bold">
        <Icon name="store" size={22} className="text-accent-2" /> שם העסק
      </div>
      <p className="mb-4 text-[13px] text-text-2">השם שיוצג בכל המערכת — בדשבורד, בדוחות ובממשק העובדים.</p>
      <label className="block">
        <span className="label-text">שם העסק</span>
        <Input
          className="mt-1.5"
          value={nameV}
          onChange={(e) => {
            setName(e.target.value);
            setMsg(null);
            setSaved(false);
          }}
          placeholder="לדוגמה: בר הים"
        />
      </label>
      <div className="mt-4 flex items-center gap-2.5">
        <Button icon="save" loading={update.isPending} disabled={unchanged} onClick={handleSave}>
          שמירת שם
        </Button>
        {msg && <span className="text-[13px] font-semibold text-danger">{msg}</span>}
        {saved && !msg && !update.isPending && (
          <span className="text-[13px] font-semibold text-success">נשמר בהצלחה</span>
        )}
      </div>
    </Card>
  );
}

function LocationCard({ businessId }: { businessId: string }) {
  const { data: biz } = useBusiness(businessId);
  const update = useUpdateBusiness();
  const [address, setAddress] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!biz) return null;

  const addressV = address ?? biz.location_address ?? "";
  const addressDirty = address !== null;
  const latV = lat ?? (addressDirty ? null : biz.location_lat);
  const lngV = lng ?? (addressDirty ? null : biz.location_lng);
  const hasCoords = latV != null && lngV != null;

  function handleSave() {
    setMsg(null);
    if (!addressV.trim()) {
      setMsg("יש לבחור כתובת מהרשימה");
      return;
    }
    if (latV == null || lngV == null) {
      setMsg("יש לבחור כתובת מההשלמה האוטומטית של Google");
      return;
    }
    update.mutate(
      {
        id: businessId,
        location_address: addressV.trim(),
        location_lat: latV,
        location_lng: lngV,
        location_radius_m: ATTENDANCE_RADIUS_M,
      },
      {
        onSuccess: () => {
          setMsg(null);
          setSaved(true);
        },
        onError: () => setMsg("שמירה נכשלה"),
      }
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2 text-[16px] font-bold">
        <Icon name="location_on" size={22} className="text-accent-2" /> כתובת העסק לשעון נוכחות
      </div>
      <p className="mb-4 text-[13px] text-text-2">
        העובדים יוכלו להחתים נוכחות רק כשהם במרחק של עד {ATTENDANCE_RADIUS_M} מטר מהכתובת.
      </p>
      <label className="block">
        <span className="label-text">כתובת העסק</span>
        <div className="mt-1.5">
          <AddressAutocomplete
            value={addressV}
            onResolvingChange={setResolvingPlace}
            onChange={(v) => {
              setAddress(v);
              setLat(null);
              setLng(null);
              setMsg(null);
              setSaved(false);
            }}
            onPlaceSelect={(place) => {
              setAddress(place.address);
              setLat(place.lat);
              setLng(place.lng);
              setMsg(null);
              setSaved(false);
            }}
          />
        </div>
      </label>
      {hasCoords && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-text-3">
          <Badge tone="violet">רדיוס: {ATTENDANCE_RADIUS_M} מ׳</Badge>
          <span style={{ direction: "ltr" }}>
            {latV!.toFixed(6)}, {lngV!.toFixed(6)}
          </span>
        </div>
      )}
      <div className="mt-4 flex items-center gap-2.5">
        <Button icon="save" loading={update.isPending || resolvingPlace} disabled={resolvingPlace} onClick={handleSave}>
          שמירת כתובת
        </Button>
        {msg && <span className="text-[13px] font-semibold text-danger">{msg}</span>}
        {saved && !msg && !update.isPending && (
          <span className="text-[13px] font-semibold text-success">נשמר בהצלחה</span>
        )}
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
  const create = useCreateShiftTemplate(businessId);
  const update = useUpdateShiftTemplate(businessId);
  const del = useDeleteShiftTemplate(businessId);
  const activeCount = (templates ?? []).filter((t) => t.active).length;
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");

  const rowGrid =
    "grid grid-cols-[auto_minmax(100px,1fr)_110px_auto_110px_auto_auto] items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5";

  function handleAddShift() {
    if (!newName.trim() || !newStart || !newEnd) return;
    create.mutate(
      {
        business_id: businessId,
        name: newName.trim(),
        start_time: newStart,
        end_time: newEnd,
        color: SHIFT_COLORS[(templates?.length ?? 0) % SHIFT_COLORS.length],
        sort_order: templates?.length ?? 0,
      },
      {
        onSuccess: () => {
          setNewName("");
          setNewStart("09:00");
          setNewEnd("17:00");
        },
      }
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2 text-[16px] font-bold">
        <Icon name="schedule" size={22} className="text-accent-2" /> שעות משמרת
      </div>
      <div className="mb-4 text-[13px] text-text-2">
        ארבע משמרות בסיס (בוקר, צהריים, ערב, לילה) — כבו משמרות שלא רלוונטיות וערכו שעות. ניתן גם להוסיף משמרות
        מותאמות (למשל ביניים). המשמרות מוצגות לפי סדר שעות ההתחלה.
      </div>
      <div className="flex flex-col gap-2.5">
        {(templates ?? []).map((t) => {
          const isCustom = t.shift_key == null;
          return (
            <div key={t.id} className={rowGrid} style={{ opacity: t.active ? 1 : 0.55 }}>
              <Switch checked={t.active} onChange={(v) => update.mutate({ id: t.id, active: v })} />
              <Input
                className="!bg-surface"
                defaultValue={t.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== t.name) update.mutate({ id: t.id, name });
                }}
                disabled={!t.active}
              />
              <input
                type="time"
                defaultValue={t.start_time?.slice(0, 5)}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (v && v !== t.start_time?.slice(0, 5)) update.mutate({ id: t.id, start_time: v });
                }}
                className="field !w-full !bg-surface"
                style={{ direction: "ltr", textAlign: "center" }}
                disabled={!t.active}
              />
              <span className="font-bold text-text-3">–</span>
              <input
                type="time"
                defaultValue={t.end_time?.slice(0, 5)}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (v && v !== t.end_time?.slice(0, 5)) update.mutate({ id: t.id, end_time: v });
                }}
                className="field !w-full !bg-surface"
                style={{ direction: "ltr", textAlign: "center" }}
                disabled={!t.active}
              />
              {!t.active ? <Badge tone="neutral">כבויה</Badge> : <span />}
              {isCustom ? (
                <button
                  onClick={() => del.mutate(t.id)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger"
                >
                  <Icon name="delete" size={20} />
                </button>
              ) : (
                <span className="h-9 w-9" />
              )}
            </div>
          );
        })}
      </div>
      <div className={`mt-3 ${rowGrid} !border-dashed !bg-transparent`}>
        <span className="h-9 w-9" />
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="שם משמרת חדשה"
        />
        <input
          type="time"
          value={newStart}
          onChange={(e) => setNewStart(e.target.value)}
          className="field !w-full"
          style={{ direction: "ltr", textAlign: "center" }}
        />
        <span className="font-bold text-text-3">–</span>
        <input
          type="time"
          value={newEnd}
          onChange={(e) => setNewEnd(e.target.value)}
          className="field !w-full"
          style={{ direction: "ltr", textAlign: "center" }}
        />
        <span />
        <Button icon="add" loading={create.isPending} onClick={handleAddShift} className="!px-3">
          הוספה
        </Button>
      </div>
      <div className="mt-3">
        <Badge tone="violet">{activeCount} משמרות פעילות</Badge>
      </div>
    </Card>
  );
}
