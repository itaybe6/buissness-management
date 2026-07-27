import { useEffect, useRef, useState } from "react";
import { Field, Icon, Input } from "@/components/ui";

export type EventPeriodFilter = "all" | "upcoming" | "past";

export function EventsFilter({
  query,
  onQueryChange,
  period,
  onPeriodChange,
  dateFilter,
  onDateFilterChange,
  upcomingCount,
  pastCount,
  canManage,
  onAdd,
  filtersEnabled,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  period: EventPeriodFilter;
  onPeriodChange: (p: EventPeriodFilter) => void;
  dateFilter: string | null;
  onDateFilterChange: (d: string | null) => void;
  upcomingCount: number;
  pastCount: number;
  canManage: boolean;
  onAdd: () => void;
  filtersEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeCount = (period !== "all" ? 1 : 0) + (dateFilter ? 1 : 0);
  const showClear = activeCount > 0;

  function clearAll() {
    onPeriodChange("all");
    onDateFilterChange(null);
  }

  return (
    <div className="evt-filter-bar">
      <div className="evt-action-row">
        <div className="evt-search">
          <Icon name="search" size={20} className="evt-search-icon" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="חיפוש אירוע..."
            aria-label="חיפוש אירוע"
          />
          {query && (
            <button type="button" className="evt-search-clear" onClick={() => onQueryChange("")} aria-label="ניקוי חיפוש">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        {filtersEnabled && (
          <div className="inv-filters-anchor">
            <button
              ref={btnRef}
              type="button"
              className="inv-filters-btn evt-action-btn"
              data-open={open}
              data-filtered={activeCount > 0}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="events-filter-panel"
              aria-label="סינון אירועים"
            >
              <Icon name="tune" size={19} />
              <span className="inv-filters-btn-label">סינון</span>
              {activeCount > 0 && <span className="inv-filters-badge">{activeCount}</span>}
            </button>

            {open && (
              <button
                type="button"
                className="evt-filter-backdrop"
                onClick={() => setOpen(false)}
                aria-label="סגירת הסינון"
              />
            )}

            <div
              ref={popRef}
              id="events-filter-panel"
              className="inv-filters-pop evt-filters-pop"
              data-open={open}
              role="group"
              aria-label="סינון אירועים"
            >
              <div className="inv-filters-pop-head">
                <span className="inv-filters-pop-title">
                  <Icon name="tune" size={15} />
                  סינון אירועים
                </span>
                {showClear && (
                  <button type="button" className="inv-filters-clear" onClick={clearAll}>
                    <Icon name="filter_alt_off" size={15} />
                    ניקוי
                  </button>
                )}
              </div>

              <div className="inv-filters-pop-body">
                <div className="inv-filter-row">
                  <span className="inv-filter-row-label">תקופה</span>
                  <div className="inv-filter-track">
                    <FilterChip
                      label="הכל"
                      active={period === "all" && !dateFilter}
                      onClick={() => {
                        onPeriodChange("all");
                        onDateFilterChange(null);
                      }}
                    />
                    <FilterChip
                      label="עתידיים"
                      icon="event_upcoming"
                      active={period === "upcoming"}
                      count={upcomingCount}
                      onClick={() => {
                        onPeriodChange("upcoming");
                        onDateFilterChange(null);
                      }}
                    />
                    <FilterChip
                      label="עברו"
                      icon="history"
                      active={period === "past"}
                      count={pastCount}
                      onClick={() => {
                        onPeriodChange("past");
                        onDateFilterChange(null);
                      }}
                    />
                  </div>
                </div>

                <div className="evt-filter-date">
                  <Field label="תאריך ספציפי">
                    <Input
                      type="date"
                      value={dateFilter ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        onDateFilterChange(v);
                        if (v) onPeriodChange("all");
                      }}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>
        )}

        {canManage && (
          <button type="button" className="evt-action-btn evt-action-btn--add" onClick={onAdd} aria-label="אירוע חדש">
            <Icon name="add" size={22} />
          </button>
        )}
      </div>

      {showClear && (
        <div className="evt-filter-tokens">
          {period !== "all" && (
            <button
              type="button"
              className="inv-filters-token"
              onClick={() => onPeriodChange("all")}
            >
              {period === "upcoming" ? "עתידיים" : "עברו"}
              <Icon name="close" size={14} className="inv-filters-token-x" />
            </button>
          )}
          {dateFilter && (
            <button
              type="button"
              className="inv-filters-token"
              onClick={() => onDateFilterChange(null)}
            >
              {new Date(dateFilter + "T12:00:00").toLocaleDateString("he-IL", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              <Icon name="close" size={14} className="inv-filters-token-x" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  icon,
  active,
  count,
  onClick,
}: {
  label: string;
  icon?: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inv-chip"
      data-active={active || undefined}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={15} />}
      {label}
      {count != null && <span className="inv-chip-count">{count}</span>}
    </button>
  );
}
