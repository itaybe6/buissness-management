import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

interface OptionItem {
  value: string;
  label: string;
  disabled?: boolean;
}

function parseOptions(children: ReactNode): OptionItem[] {
  const options: OptionItem[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      const props = child.props as {
        value?: string;
        disabled?: boolean;
        children?: ReactNode;
      };
      options.push({
        value: String(props.value ?? ""),
        label: String(props.children ?? props.value ?? ""),
        disabled: props.disabled,
      });
      return;
    }
    if (child.type === "optgroup") {
      const props = child.props as { children?: ReactNode };
      options.push(...parseOptions(props.children));
    }
  });
  return options;
}

function makeChangeEvent(value: string): React.ChangeEvent<HTMLSelectElement> {
  return { target: { value } } as React.ChangeEvent<HTMLSelectElement>;
}

export const Select = forwardRef<HTMLButtonElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", children, value = "", onChange, disabled, id, name }, ref) => {
    const listboxId = useId();
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

    const options = useMemo(() => parseOptions(children), [children]);
    const valueStr = String(value ?? "");
    const selected = options.find((o) => String(o.value) === valueStr);
    const displayLabel = selected?.label ?? "";

    useEffect(() => {
      if (!open) return;
      const updatePosition = () => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const menuHeight = Math.min(options.length * 42 + 8, 240);
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < menuHeight && rect.top > menuHeight;
        setMenuStyle({
          position: "fixed",
          top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
          left: rect.left,
          width: rect.width,
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

    function selectOption(next: string) {
      onChange?.(makeChangeEvent(String(next)));
      setOpen(false);
    }

    const menu =
      open &&
      createPortal(
        <ul
          id={listboxId}
          role="listbox"
          data-select-menu={listboxId}
          className="select-dropdown"
          style={menuStyle}
        >
          {options.map((opt) => {
            const active = String(opt.value) === valueStr;
            return (
              <li key={`${opt.value}-${opt.label}`} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={opt.disabled}
                  onClick={() => !opt.disabled && selectOption(opt.value)}
                  className={`select-option${active ? " select-option-active" : ""}`}
                >
                  <span className="truncate">{opt.label}</span>
                  {active && <Icon name="check" size={18} className="flex-none text-accent-2" />}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body
      );

    return (
      <>
        {name && <input type="hidden" name={name} value={String(value)} />}
        <div className={`relative ${className}`}>
          <button
            ref={(node) => {
              triggerRef.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
            }}
            id={id}
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
              {displayLabel || "בחר..."}
            </span>
            <Icon
              name="expand_more"
              size={20}
              className={`flex-none text-text-3 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>
        {menu}
      </>
    );
  }
);
Select.displayName = "Select";
