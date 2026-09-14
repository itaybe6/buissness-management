import { useMemo, useState } from "react";
import { Button, Field, Icon, Input, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { parseEventDay } from "@/components/events/eventTime";
import { useDepartments } from "@/api/departments";
import { notifyEventRequestCreated, useCreateEventRequest } from "@/api/eventRequests";
import { colorForDepartment } from "@/lib/db";
import type { EventRecord, EventStaffingLine } from "@/types/database";

const MAX_PER_LINE = 50;
/** Seats drawn in the preview before collapsing into "+N". */
const PREVIEW_SEATS = 14;

const SHIFT_PRESETS = [
  { key: "morning", label: "בוקר", icon: "wb_twilight" },
  { key: "noon", label: "צהריים", icon: "light_mode" },
  { key: "evening", label: "ערב", icon: "wb_twilight" },
  { key: "night", label: "לילה", icon: "bedtime" },
] as const;

function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <span className="evrq-stepper" data-active={value > 0 || undefined}>
      <button
        type="button"
        className="evrq-stepper-btn"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        aria-label={`פחות ${label}`}
      >
        <Icon name="remove" size={18} />
      </button>
      <span className="evrq-stepper-val" aria-live="polite">{value}</span>
      <button
        type="button"
        className="evrq-stepper-btn"
        onClick={() => onChange(Math.min(MAX_PER_LINE, value + 1))}
        disabled={value >= MAX_PER_LINE}
        aria-label={`עוד ${label}`}
      >
        <Icon name="add" size={18} />
      </button>
    </span>
  );
}

/**
 * "I need 2 bartenders and a waiter for Wednesday evening."
 * Departments are the job areas of the business (בר, מלצרות…); a free-text
 * row covers anything that is not a department. The manager later fills
 * each requested seat with a named employee.
 */
export function StaffingRequestModal({
  open,
  onClose,
  businessId,
  event,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
  event: EventRecord;
}) {
  const { data: departments = [] } = useDepartments(businessId);
  const create = useCreateEventRequest(businessId);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [freeLabel, setFreeLabel] = useState("");
  const [freeCount, setFreeCount] = useState(0);
  const [shiftLabel, setShiftLabel] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeDepartments = useMemo(() => departments.filter((d) => d.active), [departments]);

  const day = parseEventDay(event.event_date);
  const weekday = day.toLocaleDateString("he-IL", { weekday: "long" });
  const dateShort = day.toLocaleDateString("he-IL", { day: "numeric", month: "long" });

  const lines = useMemo<EventStaffingLine[]>(() => {
    const out: EventStaffingLine[] = activeDepartments
      .filter((d) => (counts[d.id] ?? 0) > 0)
      .map((d) => ({ department_id: d.id, label: d.name, count: counts[d.id] }));
    if (freeCount > 0 && freeLabel.trim()) {
      out.push({ department_id: null, label: freeLabel.trim(), count: freeCount });
    }
    return out;
  }, [activeDepartments, counts, freeCount, freeLabel]);

  const total = lines.reduce((s, l) => s + l.count, 0);

  /** Seats for the preview: one per requested person, coloured by department. */
  const seats = useMemo(() => {
    const out: { color: string; label: string }[] = [];
    for (const l of lines) {
      const dept = l.department_id ? departments.find((d) => d.id === l.department_id) : null;
      const color = colorForDepartment(l.department_id, dept?.color ?? null);
      for (let i = 0; i < l.count; i++) out.push({ color, label: l.label });
    }
    return out;
  }, [lines, departments]);

  function applyPreset(label: string) {
    setShiftLabel((prev) => {
      const base = `${weekday} ${label}`;
      return prev.trim() === base ? "" : base;
    });
  }
  const activePreset = SHIFT_PRESETS.find((p) => shiftLabel.trim() === `${weekday} ${p.label}`)?.key ?? null;

  function reset() {
    setCounts({});
    setFreeLabel("");
    setFreeCount(0);
    setShiftLabel("");
    setNote("");
    setError(null);
  }

  function close() {
    onClose();
    reset();
  }

  async function submit() {
    setError(null);
    if (lines.length === 0) {
      setError(
        freeCount > 0 && !freeLabel.trim()
          ? "נא לכתוב איזה תפקיד צריך"
          : "נא לבחור כמה עובדים צריך, לפחות ממחלקה אחת",
      );
      return;
    }
    setSaving(true);
    try {
      const created = await create.mutateAsync({
        kind: "staffing",
        event_id: event.id,
        shift_label: shiftLabel,
        note,
        lines,
      });
      notifyEventRequestCreated(created.id);
      close();
    } catch {
      setError("שליחת הבקשה נכשלה. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="בקשת שיבוץ עובדים"
      subtitle={`${event.title} · ${weekday}, ${dateShort}`}
      icon="groups"
      maxWidth={560}
      fullScreenMobile
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            ביטול
          </Button>
          <Button className="flex-1" icon="send" loading={saving} onClick={submit} disabled={total === 0}>
            {total > 0 ? `שליחה למנהל · ${total} ${total === 1 ? "עובד" : "עובדים"}` : "שליחה למנהל"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* ---- Who ---- */}
        <section className="evrq-block" aria-labelledby="stf-who">
          <header className="evrq-block-head">
            <span className="evrq-block-step">1</span>
            <h3 id="stf-who" className="evrq-block-title">כמה עובדים צריך?</h3>
            {total > 0 && (
              <span className="evrq-block-badge">
                {total} {total === 1 ? "עובד" : "עובדים"}
              </span>
            )}
          </header>

          {activeDepartments.length === 0 && (
            <p className="evrq-hint">
              עוד לא הוגדרו מחלקות בעסק — אפשר לכתוב את התפקיד בשורה החופשית למטה.
            </p>
          )}

          <ul className="evrq-dept-list">
            {activeDepartments.map((d) => {
              const n = counts[d.id] ?? 0;
              const color = colorForDepartment(d.id, d.color);
              return (
                <li
                  key={d.id}
                  className="evrq-dept-row"
                  data-active={n > 0 || undefined}
                  style={{ "--dept": color } as React.CSSProperties}
                >
                  <span className="evrq-dept-dot" style={{ background: color }} aria-hidden />
                  <span className="evrq-dept-name">
                    {d.name}
                    {n > 0 && <small className="evrq-dept-sub">{n === 1 ? "עובד אחד" : `${n} עובדים`}</small>}
                  </span>
                  <Stepper
                    value={n}
                    label={d.name}
                    onChange={(v) => setCounts((prev) => ({ ...prev, [d.id]: v }))}
                  />
                </li>
              );
            })}
            <li className="evrq-dept-row evrq-dept-row--free" data-active={freeCount > 0 || undefined}>
              <span className="evrq-dept-dot evrq-dept-dot--free" aria-hidden>
                <Icon name="edit" size={12} />
              </span>
              <Input
                value={freeLabel}
                onChange={(e) => setFreeLabel(e.target.value)}
                placeholder="תפקיד אחר (די־ג׳יי, מאבטח…)"
                className="evrq-free-input"
                aria-label="תפקיד אחר"
              />
              <Stepper value={freeCount} label="תפקיד אחר" onChange={setFreeCount} />
            </li>
          </ul>

          {seats.length > 0 && (
            <div className="evrq-seats" aria-label="תצוגה מקדימה של המקומות">
              {seats.slice(0, PREVIEW_SEATS).map((s, i) => (
                <span
                  key={i}
                  className="evrq-seat"
                  style={{ "--dept": s.color } as React.CSSProperties}
                  title={s.label}
                >
                  <Icon name="person" size={14} />
                </span>
              ))}
              {seats.length > PREVIEW_SEATS && <span className="evrq-seat evrq-seat--more">+{seats.length - PREVIEW_SEATS}</span>}
              <span className="evrq-seats-hint">המנהל ימלא כל מקום בשם של עובד</span>
            </div>
          )}
        </section>

        {/* ---- When ---- */}
        <section className="evrq-block" aria-labelledby="stf-when">
          <header className="evrq-block-head">
            <span className="evrq-block-step">2</span>
            <h3 id="stf-when" className="evrq-block-title">לאיזו משמרת?</h3>
          </header>
          <div className="evrq-presets" role="group" aria-label="משמרת">
            {SHIFT_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="evrq-preset"
                data-active={activePreset === p.key || undefined}
                onClick={() => applyPreset(p.label)}
              >
                <Icon name={p.icon} size={15} />
                {weekday} {p.label}
              </button>
            ))}
          </div>
          <Input
            value={shiftLabel}
            onChange={(e) => setShiftLabel(e.target.value)}
            placeholder={`או בחופשי: ${weekday} בערב, הגעה 18:00`}
            aria-label="פירוט המשמרת"
          />
        </section>

        {/* ---- Note ---- */}
        <Field label="הערה למנהל (אופציונלי)">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="דגשים, ניסיון נדרש, מי כבר אישר הגעה…"
            rows={2}
            className="max-h-[200px] min-h-[64px] resize-y overflow-y-auto leading-relaxed"
          />
        </Field>

        {error && <span className="text-[13px] font-semibold text-danger">{error}</span>}
      </div>
    </Modal>
  );
}
