import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function parseTimeValue(value: string): { hour: string; minute: string } {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return { hour: "00", minute: "00" };
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return {
    hour: String(hour).padStart(2, "0"),
    minute: String(minute).padStart(2, "0"),
  };
}

function formatTimeValue(hour: string, minute: string): string {
  return `${hour}:${minute}`;
}

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TimePicker({
  value,
  onChange,
  placeholder = "בחר שעה",
  disabled = false,
  className = "",
}: TimePickerProps) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const hourListRef = useRef<HTMLUListElement | null>(null);
  const minuteListRef = useRef<HTMLUListElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const parsed = parseTimeValue(value);
  const [draftHour, setDraftHour] = useState(parsed.hour);
  const [draftMinute, setDraftMinute] = useState(parsed.minute);

  useEffect(() => {
    if (!open) return;
    const next = parseTimeValue(value);
    setDraftHour(next.hour);
    setDraftMinute(next.minute);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const panelWidth = Math.min(280, window.innerWidth - 16);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - panelWidth - 8);
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left,
        width: panelWidth,
        zIndex: 10001,
      });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const scrollActive = (list: HTMLUListElement | null, activeValue: string) => {
      const active = list?.querySelector<HTMLElement>(`[data-time-value="${activeValue}"]`);
      active?.scrollIntoView({ block: "center" });
    };
    const t = window.setTimeout(() => {
      scrollActive(hourListRef.current, draftHour);
      scrollActive(minuteListRef.current, draftMinute);
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, draftHour, draftMinute]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if ((target as Element).closest?.(`[data-time-picker-panel="${panelId}"]`)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, panelId]);

  function confirmSelection() {
    onChange(formatTimeValue(draftHour, draftMinute));
    setOpen(false);
  }

  function clearSelection() {
    onChange("");
    setOpen(false);
  }

  const displayValue = value.trim() ? formatTimeValue(parsed.hour, parsed.minute) : "";

  const menu =
    open &&
    createPortal(
      <div data-time-picker-panel={panelId} className="time-picker-panel" style={menuStyle}>
        <div className="time-picker-preview" aria-live="polite">
          <span className="time-picker-preview-value">{draftHour}</span>
          <span className="time-picker-preview-sep">:</span>
          <span className="time-picker-preview-value">{draftMinute}</span>
        </div>

        <div className="time-picker-columns">
          <div className="time-picker-column">
            <span className="time-picker-column-label">שעות</span>
            <ul ref={hourListRef} className="time-picker-list" role="listbox" aria-label="שעות">
              {HOURS.map((hour) => {
                const active = hour === draftHour;
                return (
                  <li key={hour} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-time-value={hour}
                      className={`time-picker-option${active ? " time-picker-option-active" : ""}`}
                      onClick={() => setDraftHour(hour)}
                    >
                      {hour}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="time-picker-column">
            <span className="time-picker-column-label">דקות</span>
            <ul ref={minuteListRef} className="time-picker-list" role="listbox" aria-label="דקות">
              {MINUTES.map((minute) => {
                const active = minute === draftMinute;
                return (
                  <li key={minute} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-time-value={minute}
                      className={`time-picker-option${active ? " time-picker-option-active" : ""}`}
                      onClick={() => setDraftMinute(minute)}
                    >
                      {minute}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="time-picker-actions">
          <button type="button" className="time-picker-action time-picker-action-muted" onClick={clearSelection}>
            ניקוי
          </button>
          <button type="button" className="time-picker-action time-picker-action-primary" onClick={confirmSelection}>
            אישור
          </button>
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      <div className={`relative ${className}`}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={`time-picker-trigger field flex w-full items-center justify-between gap-2 ${
            open ? "border-[var(--accent-2)] shadow-[0_0_0_3px_var(--focus-ring)]" : ""
          } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon name="schedule" size={18} className="flex-none text-accent-2" />
            <span
              className={`truncate font-bold tabular-nums ${displayValue ? "text-text" : "text-text-3"}`}
              style={{ direction: "ltr" }}
            >
              {displayValue || placeholder}
            </span>
          </span>
          <Icon
            name="expand_more"
            size={20}
            className={`flex-none text-text-3 transition-transform duration-200 ease-out ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {menu}
    </>
  );
}
