import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/ui";
import { useRecurringOrders } from "@/api/recurringOrders";
import {
  recurringOrdersForSupplier,
  recurringOrdersPagePath,
  type RecurringOrdersFrom,
} from "@/lib/recurringOrders";

type RecurringOrdersEntryVariant =
  | "toolbar"
  | "hero"
  | "compact"
  | "supplier-action"
  | "summary-cell"
  /** Wide banner that reads as a button — the way into the page from /suppliers. */
  | "panel";

interface RecurringOrdersEntryProps {
  businessId: string | null;
  variant?: RecurringOrdersEntryVariant;
  /** When set, the page lists only templates that include this supplier. */
  supplierId?: string | null;
  supplierName?: string;
  from?: RecurringOrdersFrom;
  className?: string;
  disabled?: boolean;
}

export function RecurringOrdersEntry({
  businessId,
  variant = "toolbar",
  supplierId = null,
  supplierName,
  from = "inventory",
  className = "",
  disabled = false,
}: RecurringOrdersEntryProps) {
  const navigate = useNavigate();
  const { data: recurringOrders } = useRecurringOrders(businessId);

  const templates = useMemo(
    () => recurringOrdersForSupplier(recurringOrders ?? [], supplierId),
    [recurringOrders, supplierId],
  );
  const count = templates.length;

  const ariaLabel = supplierName
    ? `הזמנות קבועות — ${supplierName}`
    : count > 0
      ? `הזמנות קבועות (${count})`
      : "הזמנות קבועות";

  const buttonClass =
    variant === "supplier-action"
      ? `spd-act ${className}`.trim()
      : variant === "panel"
        ? `rord-cta ${className}`.trim()
        : variant === "summary-cell"
          ? `inventory-summary-cell inventory-tab-cell inventory-tab-cell--action ${className}`.trim()
          : `rord-entry-btn rord-entry-btn--${variant} ${className}`.trim();

  function openPage() {
    navigate(
      recurringOrdersPagePath({
        supplierId,
        from: supplierId && from === "inventory" ? "supplier" : from,
      }),
    );
  }

  return (
    <button
      type="button"
      className={buttonClass}
      onClick={openPage}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {variant === "panel" ? (
        <>
          <span className="rord-cta-ico" aria-hidden>
            <Icon name="event_repeat" size={21} />
          </span>
          <span className="rord-cta-body">
            <b>הזמנות קבועות</b>
            <span>
              {supplierName
                ? count > 0
                  ? `${count} תבניות שמורות עם מוצרים מ${supplierName}`
                  : `עדיין אין תבנית שמורה ל${supplierName}`
                : count > 0
                  ? "תבניות שמורות — הזמנה שלמה בלחיצה אחת"
                  : "שמרו הזמנה חוזרת כתבנית והתחילו ממנה בכל פעם"}
            </span>
          </span>
          <span className="rord-cta-count">{count}</span>
          <Icon name="chevron_left" size={20} className="rord-cta-arrow" />
        </>
      ) : variant === "summary-cell" ? (
        <>
          <div className="text-[18px] font-extrabold leading-none tabular-nums tracking-tight md:text-[26px]">
            {count}
          </div>
          <div className="inventory-tab-cell-label mt-1 text-[10px] font-medium text-text-3 md:mt-1.5 md:text-[12px]">
            הזמנות קבועות
          </div>
        </>
      ) : (
        <>
          <Icon name="event_repeat" size={variant === "hero" ? 22 : 17} />
          {variant !== "compact" && <span>הזמנות קבועות</span>}
          {count > 0 && <span className="rord-entry-count">{count}</span>}
        </>
      )}
    </button>
  );
}
