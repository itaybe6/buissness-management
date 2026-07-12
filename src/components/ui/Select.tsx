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

function optionLabelFromChildren(children: ReactNode): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(optionLabelFromChildren).join("");
  if (isValidElement(children)) {
    const props = children.props as { children?: ReactNode };
    return optionLabelFromChildren(props.children);
  }
  return String(children);
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
        label: optionLabelFromChildren(props.children) || String(props.value ?? ""),
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

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  searchable?: boolean;
  searchPlaceholder?: string;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      className = "",
      children,
      value = "",
      onChange,
      disabled,
      id,
      name,
      searchable = false,
      searchPlaceholder = "חיפוש...",
    },
    ref,
  ) => {
    const listboxId = useId();
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const searchRef = useRef<HTMLInputElement | null>(null);
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

    const options = useMemo(() => parseOptions(children), [children]);
    const valueStr = String(value ?? "");
    const selected = options.find((o) => String(o.value) === valueStr);
    const displayLabel = selected?.label ?? "";
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredOptions = useMemo(() => {
      if (!searchable || !normalizedQuery) return options;
      return options.filter((opt) => opt.label.toLowerCase().includes(normalizedQuery));
    }, [options, searchable, normalizedQuery]);

    useEffect(() => {
      if (!open) return;
      const updatePosition = () => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const searchHeight = searchable ? 48 : 0;
        const idealHeight = Math.min(filteredOptions.length * 42 + 8 + searchHeight, searchable ? 300 : 240);
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
    }, [open, filteredOptions.length, searchable]);

    useEffect(() => {
      if (!open) {
        setSearchQuery("");
        return;
      }
      if (searchable) {
        const t = window.setTimeout(() => searchRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
      }
    }, [open, searchable]);

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
      setSearchQuery("");
    }

    const menu =
      open &&
      createPortal(
        <div
          data-select-menu={listboxId}
          className={`select-dropdown-panel${searchable ? " select-dropdown-panel--searchable" : ""}`}
          style={menuStyle}
        >
          {searchable && (
            <div
              className="select-search-wrap"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Icon name="search" size={18} className="flex-none text-text-3" />
              <input
                ref={searchRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="select-search-input"
                aria-label={searchPlaceholder}
              />
            </div>
          )}
          <ul id={listboxId} role="listbox" className="select-dropdown">
            {filteredOptions.length === 0 ? (
              <li className="select-empty" role="presentation">
                לא נמצאו תוצאות
              </li>
            ) : (
              filteredOptions.map((opt) => {
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
              })
            )}
          </ul>
        </div>,
        document.body,
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
              className={`flex-none text-text-3 transition-transform duration-200 ease-out ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>
        {menu}
      </>
    );
  }
);
Select.displayName = "Select";
