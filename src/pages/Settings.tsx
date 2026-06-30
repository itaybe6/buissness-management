import { useState, type ReactNode } from "react";
import { Badge, Button, EmptyState, Icon, Input, PageLoader, ErrorState, Switch } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
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
import { useBusinessId, HE_DAYS } from "@/lib/db";
import { formatShiftPrefsDeadlineRule } from "@/lib/shift-deadline";
import { PageEnter, PressableCard, StaggerGrid, StaggerItem } from "@/components/motion/shared-motion";

const SHIFT_COLORS = ["#eab308", "#fdab3d", "#ef4444", "#7c3aed", "#0d9488", "#2563eb"];

type SettingsPanel = "name" | "location" | "maintenance" | "deadline" | "departments" | "shifts";

export function Settings() {
  const businessId = useBusinessId();
  const { data: biz, isLoading, isError, refetch } = useBusiness(businessId);
  const { data: departments } = useDepartments(businessId);
  const { data: templates } = useShiftTemplates(businessId);
  const [panel, setPanel] = useState<SettingsPanel | null>(null);
  const close = () => setPanel(null);

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

  const activeShifts = (templates ?? []).filter((t) => t.active).length;
  const deptCount = departments?.length ?? 0;

  return (
    <PageEnter className="mx-auto max-w-[1100px]">
      <header className="page-hero">
        <div className="page-hero-inner">
          <div>
            <h1 className="page-hero-title">הגדרות עסק</h1>
            <p className="page-hero-sub">
              שם העסק, מיקום לשעון נוכחות, מחלקות ושעות משמרת. לחצו על קובייה לעריכה.
            </p>
          </div>
          <div className="page-hero-stats">
            <div className="page-hero-stat">
              <Icon name="store" size={18} style={{ color: "var(--accent-2)" }} />
              <span className="truncate max-w-[180px]">
                <strong>{biz.name}</strong>
              </span>
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

      <StaggerGrid className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <SettingsTile
          icon="store"
          label="שם העסק"
          value={biz.name}
          hint="דשבורד, דוחות וממשק עובדים"
          accent="var(--accent)"
          onClick={() => setPanel("name")}
        />
        <SettingsTile
          icon="location_on"
          label="כתובת לשעון נוכחות"
          value={biz.location_address?.split(",")[0] ?? "לא הוגדרה"}
          hint={biz.attendance_geofence_enabled ? "בדיקת GPS פעילה" : "בדיקת GPS כבויה"}
          accent="var(--info)"
          onClick={() => setPanel("location")}
        />
        <SettingsTile
          icon="verified_user"
          label="אישור משימות אחזקה"
          value={biz.maintenance_task_approval ? "דרוש אישור מנהל" : "ללא אישור"}
          hint="משימות מאחראי משמרת"
          accent="var(--success)"
          onClick={() => setPanel("maintenance")}
        />
        <SettingsTile
          icon="event_busy"
          label="מועד הגשה לשבוע הבא"
          value={
            biz.shift_prefs_deadline_dow != null
              ? formatShiftPrefsDeadlineRule(
                  biz.shift_prefs_deadline_dow,
                  biz.shift_prefs_deadline_time?.slice(0, 5) ?? "20:00"
                )
              : "ללא הגבלה"
          }
          hint="זמינות עובדים למשמרות"
          accent="var(--warning)"
          onClick={() => setPanel("deadline")}
        />
        <SettingsTile
          icon="category"
          label="מחלקות"
          value={deptCount > 0 ? `${deptCount} מחלקות` : "אין מחלקות"}
          hint={
            deptCount > 0
              ? (departments ?? [])
                  .slice(0, 2)
                  .map((d) => d.name)
                  .join(" · ")
              : "הוסיפו מטבח, בר, מלצרות…"
          }
          accent="#fdab3d"
          onClick={() => setPanel("departments")}
        />
        <SettingsTile
          icon="schedule"
          label="שעות משמרת"
          value={`${activeShifts} פעילות`}
          hint={`${templates?.length ?? 0} משמרות מוגדרות`}
          accent="var(--accent-2)"
          onClick={() => setPanel("shifts")}
        />
      </StaggerGrid>

      <BusinessNameModal businessId={businessId} open={panel === "name"} onClose={close} />
      <LocationModal businessId={businessId} open={panel === "location"} onClose={close} />
      <MaintenanceApprovalModal businessId={businessId} open={panel === "maintenance"} onClose={close} />
      <ShiftPrefsDeadlineModal businessId={businessId} open={panel === "deadline"} onClose={close} />
      <DepartmentsModal businessId={businessId} open={panel === "departments"} onClose={close} />
      <ShiftTemplatesModal businessId={businessId} open={panel === "shifts"} onClose={close} />
    </PageEnter>
  );
}

function SettingsTile({
  icon,
  label,
  value,
  hint,
  accent,
  onClick,
}: {
  icon: string;
  label: string;
  value: string;
  hint: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <StaggerItem>
      <PressableCard>
        <button
          type="button"
          onClick={onClick}
          className="settings-tile group relative w-full overflow-hidden rounded-[20px] border border-border/70 bg-surface p-4 text-start shadow-[0_12px_32px_-12px_rgba(15,23,20,0.08)] transition-[border-color,box-shadow] hover:border-accent/30 sm:p-5"
        >
          <div
            className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full blur-2xl transition-opacity group-hover:opacity-70"
            style={{ background: accent, opacity: 0.14 }}
          />
          <div className="relative flex items-start justify-between gap-2">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
              style={{ background: accent }}
            >
              <Icon name={icon} size={20} className="text-white" />
            </span>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-text-3 opacity-0 transition group-hover:opacity-100">
              <Icon name="edit" size={16} />
            </span>
          </div>
          <div className="relative mt-4 min-w-0">
            <div className="truncate text-[clamp(1.05rem,2.5vw,1.25rem)] font-extrabold leading-snug tracking-tight text-text">
              {value}
            </div>
            <div className="mt-1.5">
              <div className="text-[12px] font-semibold text-text-2">{label}</div>
              <div className="mt-0.5 truncate text-[11.5px] text-text-3">{hint}</div>
            </div>
          </div>
        </button>
      </PressableCard>
    </StaggerItem>
  );
}

function ModalBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

function BusinessNameModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
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
    <Modal
      open={open}
      onClose={onClose}
      title="שם העסק"
      subtitle="השם שיוצג בדשבורד, בדוחות ובממשק העובדים"
      icon="store"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            סגירה
          </Button>
          <Button icon="save" loading={update.isPending} disabled={unchanged} onClick={handleSave}>
            שמירת שם
          </Button>
        </>
      }
    >
      <ModalBody>
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
        {msg && <span className="text-[13px] font-semibold text-danger">{msg}</span>}
        {saved && !msg && !update.isPending && (
          <span className="text-[13px] font-semibold text-success">נשמר בהצלחה</span>
        )}
      </ModalBody>
    </Modal>
  );
}

function LocationModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
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
  const geofenceEnabled = biz.attendance_geofence_enabled;
  const radiusM = biz.location_radius_m ?? ATTENDANCE_RADIUS_M;

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
    <Modal
      open={open}
      onClose={onClose}
      title="כתובת לשעון נוכחות"
      subtitle={
        geofenceEnabled
          ? `עובדים יוכלו להחתים נוכחות רק במרחק של עד ${radiusM} מטר מהכתובת`
          : "בדיקת הרדיוס כבויה — ניתן להחתים מכל מקום"
      }
      icon="location_on"
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            סגירה
          </Button>
          <Button
            icon="save"
            loading={update.isPending || resolvingPlace}
            disabled={resolvingPlace}
            onClick={handleSave}
          >
            שמירת כתובת
          </Button>
        </>
      }
    >
      <ModalBody>
        <div className="settings-toggle-row">
          <div className="settings-toggle-label">דרישת מיקום GPS ברדיוס מהכתובת</div>
          <Switch
            checked={geofenceEnabled}
            onChange={(v) => update.mutate({ id: businessId, attendance_geofence_enabled: v })}
          />
        </div>
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
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-3">
            <Badge tone="violet">רדיוס: {radiusM} מ׳</Badge>
            <span style={{ direction: "ltr" }}>
              {latV!.toFixed(6)}, {lngV!.toFixed(6)}
            </span>
          </div>
        )}
        {msg && <span className="text-[13px] font-semibold text-danger">{msg}</span>}
        {saved && !msg && !update.isPending && (
          <span className="text-[13px] font-semibold text-success">נשמר בהצלחה</span>
        )}
      </ModalBody>
    </Modal>
  );
}

function MaintenanceApprovalModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: biz } = useBusiness(businessId);
  const update = useUpdateBusiness();

  if (!biz) return null;

  const enabled = biz.maintenance_task_approval;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="אישור משימות לאיש אחזקה"
      subtitle="משימה שאחראי משמרת מוריד לאיש אחזקה ממתינה לאישור מנהל לפני שהיא מופיעה אצלו"
      icon="verified_user"
      footer={<Button onClick={onClose}>סגירה</Button>}
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
    </Modal>
  );
}

function ShiftPrefsDeadlineModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: biz } = useBusiness(businessId);
  const update = useUpdateBusiness();
  const [draftEnabled, setDraftEnabled] = useState<boolean | null>(null);
  const [dow, setDow] = useState<number | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!biz) return null;

  const isEnabled = draftEnabled ?? biz.shift_prefs_deadline_dow != null;
  const dowV = dow ?? biz.shift_prefs_deadline_dow ?? 2;
  const timeV = time ?? biz.shift_prefs_deadline_time?.slice(0, 5) ?? "20:00";
  const savedTime = biz.shift_prefs_deadline_time?.slice(0, 5) ?? "20:00";
  const unchanged =
    isEnabled === (biz.shift_prefs_deadline_dow != null) &&
    (!isEnabled || (dowV === (biz.shift_prefs_deadline_dow ?? 2) && timeV === savedTime));

  function handleToggle(on: boolean) {
    if (!biz) return;
    setMsg(null);
    setSaved(false);
    if (!on) {
      setDraftEnabled(false);
      setDow(null);
      setTime(null);
      update.mutate({
        id: businessId,
        shift_prefs_deadline_dow: null,
        shift_prefs_deadline_time: null,
      });
      return;
    }
    setDraftEnabled(true);
    setDow(biz.shift_prefs_deadline_dow ?? 2);
    setTime(biz.shift_prefs_deadline_time?.slice(0, 5) ?? "20:00");
  }

  function handleSave() {
    setMsg(null);
    if (!isEnabled) return;
    update.mutate(
      {
        id: businessId,
        shift_prefs_deadline_dow: dowV,
        shift_prefs_deadline_time: `${timeV}:00`,
      },
      {
        onSuccess: () => {
          setMsg(null);
          setSaved(true);
          setDraftEnabled(null);
          setDow(null);
          setTime(null);
        },
        onError: () => setMsg("שמירה נכשלה"),
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="מועד הגשה לשבוע הבא"
      subtitle="קבעו עד איזה יום ושעה בשבוע הנוכחי עובדים יכולים לעדכן זמינות לשבוע הבא"
      icon="event_busy"
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            סגירה
          </Button>
          {isEnabled && (
            <Button icon="save" loading={update.isPending} disabled={unchanged} onClick={handleSave}>
              שמירת מועד
            </Button>
          )}
        </>
      }
    >
      <ModalBody>
        <div className="settings-toggle-row">
          <div className="settings-toggle-label">הגבלת מועד הגשה</div>
          <Switch checked={isEnabled} onChange={handleToggle} />
        </div>

        {isEnabled && (
          <>
            <p className="text-[13px] font-semibold text-text-2">
              {formatShiftPrefsDeadlineRule(dowV, timeV)}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <label className="block flex-1">
                <span className="label-text">יום בשבוע</span>
                <select
                  className="field mt-1.5 w-full"
                  value={dowV}
                  onChange={(e) => {
                    setDow(Number(e.target.value));
                    setMsg(null);
                    setSaved(false);
                  }}
                >
                  {HE_DAYS.map((label, i) => (
                    <option key={i} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:w-36">
                <span className="label-text">שעה</span>
                <input
                  type="time"
                  value={timeV}
                  onChange={(e) => {
                    setTime(e.target.value);
                    setMsg(null);
                    setSaved(false);
                  }}
                  className="field mt-1.5 w-full"
                  style={{ direction: "ltr" }}
                />
              </label>
            </div>
            {msg && <span className="text-[13px] font-semibold text-danger">{msg}</span>}
            {saved && !msg && !update.isPending && (
              <span className="text-[13px] font-semibold text-success">נשמר בהצלחה</span>
            )}
          </>
        )}
      </ModalBody>
    </Modal>
  );
}

function DepartmentsModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: departments } = useDepartments(businessId);
  const create = useCreateDepartment();
  const update = useUpdateDepartment(businessId);
  const del = useDeleteDepartment(businessId);
  const [name, setName] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="מחלקות"
      subtitle="מחלקות מגדירות סידור עבודה, משימות ושיוך עובדים"
      icon="category"
      maxWidth={560}
      footer={<Button onClick={onClose}>סגירה</Button>}
    >
      <ModalBody>
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
        <div className="flex gap-2.5">
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
      </ModalBody>
    </Modal>
  );
}

function ShiftTemplatesModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
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
    <Modal
      open={open}
      onClose={onClose}
      title="שעות משמרת"
      subtitle="כבו משמרות שלא רלוונטיות, ערכו שעות או הוסיפו משמרות מותאמות"
      icon="schedule"
      maxWidth={640}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="settings-active-count !mt-0">
            <Icon name="schedule" size={15} />
            {activeCount} משמרות פעילות
          </div>
          <Button onClick={onClose}>סגירה</Button>
        </div>
      }
    >
      <ModalBody>
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
      </ModalBody>
    </Modal>
  );
}
