import { useState, type ReactNode } from "react";
import { Badge, Button, EmptyState, Icon, Input, PageLoader, ErrorState, Switch } from "@/components/ui";
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
      <header className="page-hero">
        <div className="page-hero-inner">
          <div>
            <h1 className="page-hero-title">הגדרות עסק</h1>
            <p className="page-hero-sub">
              שם העסק, מיקום לשעון נוכחות, מחלקות ושעות משמרת. כל שינוי כאן משפיע על כל המערכת.
            </p>
          </div>
          <div className="page-hero-stats">
            <div className="page-hero-stat">
              <Icon name="store" size={18} style={{ color: "var(--accent-2)" }} />
              <span className="truncate max-w-[180px]"><strong>{biz.name}</strong></span>
            </div>
            {biz.location_address && (
              <div className="page-hero-stat">
                <Icon name="location_on" size={18} style={{ color: "var(--info)" }} />
                <span className="truncate max-w-[200px]">{biz.location_address}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="settings-stack">
        <BusinessNameCard businessId={businessId!} />
        <LocationCard businessId={businessId!} />
        <MaintenanceApprovalCard businessId={businessId!} />
        <DepartmentsCard businessId={businessId!} />
        <ShiftTemplatesCard businessId={businessId!} />
      </div>
    </div>
  );
}

function SettingsSection({
  icon,
  tone = "accent",
  title,
  desc,
  children,
}: {
  icon: string;
  tone?: "accent" | "info" | "success" | "warning";
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <div className="settings-section-icon" data-tone={tone}>
          <Icon name={icon} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="settings-section-title">{title}</h2>
          <p className="settings-section-desc">{desc}</p>
        </div>
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
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
    <SettingsSection icon="store" title="שם העסק" desc="השם שיוצג בדשבורד, בדוחות ובממשק העובדים.">
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
    </SettingsSection>
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
    <SettingsSection
      icon="location_on"
      tone="info"
      title="כתובת לשעון נוכחות"
      desc={`העובדים יוכלו להחתים נוכחות רק במרחק של עד ${ATTENDANCE_RADIUS_M} מטר מהכתובת.`}
    >
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
    </SettingsSection>
  );
}

function MaintenanceApprovalCard({ businessId }: { businessId: string }) {
  const { data: biz } = useBusiness(businessId);
  const update = useUpdateBusiness();

  if (!biz) return null;

  const enabled = biz.maintenance_task_approval;

  return (
    <SettingsSection
      icon="verified_user"
      tone="success"
      title="אישור משימות לאיש אחזקה"
      desc="כשהמתג דלוק, משימה שאחראי משמרת מוריד לאיש אחזקה ממתינה לאישור מנהל לפני שהיא מופיעה אצלו."
    >
      <div className="settings-toggle-row">
        <div className="settings-toggle-label">
          דרישת אישור מנהל למשימות שאחראי משמרת מוריד לאיש אחזקה
        </div>
        <Switch
          checked={enabled}
          onChange={(v) => update.mutate({ id: businessId, maintenance_task_approval: v })}
        />
      </div>
    </SettingsSection>
  );
}

function DepartmentsCard({ businessId }: { businessId: string }) {
  const { data: departments } = useDepartments(businessId);
  const create = useCreateDepartment();
  const update = useUpdateDepartment(businessId);
  const del = useDeleteDepartment(businessId);
  const [name, setName] = useState("");

  return (
    <SettingsSection
      icon="category"
      tone="warning"
      title="מחלקות"
      desc="מחלקות מגדירות סידור עבודה, משימות ושיוך עובדים. הוסיפו מטבח, בר, מלצרות וכו׳."
    >
      <div className="flex flex-col gap-2">
        {(departments ?? []).map((d) => (
          <div key={d.id} className="settings-dept-row">
            <span
              className="settings-dept-dot"
              style={{ background: d.color ?? "#7c3aed", color: d.color ?? "#7c3aed" }}
            />
            <Input
              className="flex-1 !bg-surface"
              defaultValue={d.name}
              onBlur={(e) => e.target.value !== d.name && update.mutate({ id: d.id, name: e.target.value })}
            />
            <button
              type="button"
              onClick={() => del.mutate(d.id)}
              className="grid h-9 w-9 place-items-center rounded-lg text-text-3 transition hover:[background:var(--danger-bg)] hover:text-danger"
              aria-label="מחק מחלקה"
            >
              <Icon name="delete" size={20} />
            </button>
          </div>
        ))}
        {departments && departments.length === 0 && (
          <div className="py-4 text-center text-[13px] text-text-3">עדיין אין מחלקות.</div>
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
    </SettingsSection>
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

  function handleAddShift() {
    if (!newName.trim() || !newStart || !newEnd) return;
    create.mutate(
      {
        business_id: businessId,
        name: newName.trim(),
        start_time: newStart,
        end_time: newEnd,
        color: "#7c3aed",
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
    <SettingsSection
      icon="schedule"
      title="שעות משמרת"
      desc="ארבע משמרות בסיס (בוקר, צהריים, ערב, לילה). כבו משמרות שלא רלוונטיות, ערכו שעות או הוסיפו משמרות מותאמות."
    >
      <div className="shift-hours-panel">
        {(templates ?? []).map((t) => {
          const isCustom = t.shift_key == null;
          return (
            <div key={t.id} className="shift-hours-item" data-active={t.active}>
              <Switch checked={t.active} onChange={(v) => update.mutate({ id: t.id, active: v })} />
              <span className="shift-hours-icon" aria-hidden="true">
                <Icon name="schedule" size={18} />
              </span>
              <Input
                className="shift-hours-name !bg-surface"
                defaultValue={t.name}
                onBlur={(e) => {
                  const n = e.target.value.trim();
                  if (n && n !== t.name) update.mutate({ id: t.id, name: n });
                }}
                disabled={!t.active}
              />
              <div className="shift-hours-times">
                <input
                  type="time"
                  defaultValue={t.start_time?.slice(0, 5)}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v && v !== t.start_time?.slice(0, 5)) update.mutate({ id: t.id, start_time: v });
                  }}
                  className="field shift-hours-time-field"
                  style={{ direction: "ltr" }}
                  disabled={!t.active}
                />
                <span className="shift-hours-dash">–</span>
                <input
                  type="time"
                  defaultValue={t.end_time?.slice(0, 5)}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v && v !== t.end_time?.slice(0, 5)) update.mutate({ id: t.id, end_time: v });
                  }}
                  className="field shift-hours-time-field"
                  style={{ direction: "ltr" }}
                  disabled={!t.active}
                />
              </div>
              {!t.active && <span className="shift-hours-off">כבויה</span>}
              {isCustom ? (
                <button
                  type="button"
                  onClick={() => del.mutate(t.id)}
                  className="shift-hours-delete"
                  aria-label="מחק משמרת"
                >
                  <Icon name="delete" size={19} />
                </button>
              ) : (
                <span className="w-9 flex-none" />
              )}
            </div>
          );
        })}
      </div>

      <div className="shift-hours-add">
        <span className="shift-hours-add-icon" aria-hidden="true">
          <Icon name="add" size={20} />
        </span>
        <div className="shift-hours-add-fields">
          <Input
            className="shift-hours-add-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="שם משמרת חדשה"
          />
          <div className="shift-hours-times">
            <input
              type="time"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="field shift-hours-time-field"
              style={{ direction: "ltr" }}
            />
            <span className="shift-hours-dash">–</span>
            <input
              type="time"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="field shift-hours-time-field"
              style={{ direction: "ltr" }}
            />
          </div>
        </div>
        <Button icon="add" loading={create.isPending} onClick={handleAddShift} className="!px-4">
          הוספה
        </Button>
      </div>

      <div className="shift-hours-footer">
        <div className="settings-active-count">
          <Icon name="schedule" size={15} />
          {activeCount} משמרות פעילות
        </div>
      </div>
    </SettingsSection>
  );
}
