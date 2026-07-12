import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface MultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = "בחר...",
  disabled = false,
  className = "",
}: MultiSelectProps) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selectedSet = useMemo(() => new Set(values), [values]);
  const displayLabel = useMemo(() => {
    if (values.length === 0) return "";
    const names = values
      .map((id) => options.find((o) => o.value === id)?.label)
      .filter((name): name is string => !!name);
    return names.join(", ");
  }, [values, options]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const idealHeight = Math.min(options.length * 42 + 8, 240);
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 8);
      const menuHeight = Math.min(idealHeight, spaceBelow);
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: menuHeight > 0 ? menuHeight : idealHeight,
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
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if ((target as Element).closest?.(`[data-select-menu="${listboxId}"]`)) return;
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
  }, [open, listboxId]);

  function toggleOption(value: string) {
    const next = selectedSet.has(value)
      ? values.filter((id) => id !== value)
      : [...values, value];
    onChange(next);
  }

  const menu =
    open &&
    createPortal(
      <div data-select-menu={listboxId} className="select-dropdown-panel" style={menuStyle}>
        <ul id={listboxId} role="listbox" aria-multiselectable="true" className="select-dropdown">
          {options.map((opt) => {
            const active = selectedSet.has(opt.value);
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={opt.disabled}
                  onClick={() => !opt.disabled && toggleOption(opt.value)}
                  className={`select-option select-option-multi${active ? " select-option-active" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`select-multi-check${active ? " select-multi-check--on" : ""}`}
                      aria-hidden="true"
                    >
                      {active && <Icon name="check" size={14} />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>,
      document.body,
    );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`field flex w-full items-center justify-between gap-2 text-right ${
          open ? "border-[var(--accent-2)] shadow-[0_0_0_3px_var(--focus-ring)]" : ""
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span className={`truncate ${displayLabel ? "text-text" : "text-text-3"}`}>
          {displayLabel || placeholder}
        </span>
        <Icon name="expand_more" size={20} className="flex-none text-text-3" />
      </button>
      {menu}
    </div>
  );
}
