import { useState } from "react";
import { Button, Icon, InlineLoader } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import type { RecurringOrderWithItems } from "@/api/recurringOrders";
import type { ItemWithQty } from "@/api/inventory";

/** Products of the template that are no longer in the catalog cannot be ordered. */
export function recurringOrderMissingCount(
  template: RecurringOrderWithItems,
  itemById: Map<string, ItemWithQty>,
): number {
  return template.items.filter((line) => !itemById.has(line.item_id)).length;
}

function lastUsedLabel(template: RecurringOrderWithItems): string {
  if (!template.last_used_at) return "עדיין לא הייתה בשימוש";
  const date = new Date(template.last_used_at);
  return `שימוש אחרון: ${date.toLocaleDateString("he-IL", { day: "numeric", month: "short" })}`;
}

interface RecurringOrderPickerProps {
  open: boolean;
  templates: RecurringOrderWithItems[];
  loading: boolean;
  itemById: Map<string, ItemWithQty>;
  /** Loading a template replaces the cart — warn before throwing work away. */
  cartHasLines: boolean;
  busyId: string | null;
  /** When listing templates for one supplier only. */
  supplierName?: string;
  /** Total templates before supplier filter — shown when the filter hides some. */
  totalTemplateCount?: number;
  onClose: () => void;
  onUse: (template: RecurringOrderWithItems) => void;
  onDelete: (template: RecurringOrderWithItems) => void;
}

export function RecurringOrderPicker({
  open,
  templates,
  loading,
  itemById,
  cartHasLines,
  busyId,
  supplierName,
  totalTemplateCount,
  onClose,
  onUse,
  onDelete,
}: RecurringOrderPickerProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const filteredEmpty =
    !!supplierName &&
    templates.length === 0 &&
    (totalTemplateCount ?? 0) > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="הזמנות קבועות"
      subtitle={
        supplierName
          ? `תבניות שמורות ל${supplierName} — בחירה תפתח הזמנה חדשה`
          : "בחרו תבנית שמורה כדי להתחיל ממנה את ההזמנה"
      }
      icon="event_repeat"
      maxWidth={560}
      footer={
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          סגירה
        </Button>
      }
    >
      {loading ? (
        <InlineLoader label="טוען הזמנות קבועות" />
      ) : templates.length === 0 ? (
        <div className="rord-empty">
          <span className="rord-empty-icon">
            <Icon name="event_repeat" size={26} />
          </span>
          <p className="rord-empty-title">
            {filteredEmpty ? `אין הזמנות קבועות ל${supplierName}` : "אין עדיין הזמנות קבועות"}
          </p>
          <p className="rord-empty-sub">
            {filteredEmpty
              ? "יש תבניות שמורות לספקים אחרים. בנו הזמנה מהמחירון של הספק ושמרו אותה כהזמנה קבועה."
              : 'בנו הזמנה כרגיל ולחצו על "שמירה כהזמנה קבועה" — בפעם הבאה תוכלו להתחיל ממנה בלחיצה אחת.'}
          </p>
        </div>
      ) : (
        <div className="rord-list">
          {cartHasLines && (
            <p className="rord-note">
              <Icon name="info" size={14} />
              בחירת הזמנה קבועה תחליף את המוצרים שכבר נבחרו בהזמנה הנוכחית.
            </p>
          )}
          {templates.map((template) => {
            const missing = recurringOrderMissingCount(template, itemById);
            const usable = template.items.length - missing;
            const names = template.items
              .map((line) => itemById.get(line.item_id)?.name)
              .filter((name): name is string => !!name);
            const confirming = confirmDeleteId === template.id;

            return (
              <article key={template.id} className="rord-card">
                <div className="rord-card-head">
                  <span className="rord-card-icon">
                    <Icon name="event_repeat" size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="rord-card-name">{template.name}</h3>
                    <span className="rord-card-meta">
                      {template.items.length} מוצרים · {lastUsedLabel(template)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="rord-card-del"
                    aria-label={`מחיקת ${template.name}`}
                    onClick={() => setConfirmDeleteId(confirming ? null : template.id)}
                  >
                    <Icon name={confirming ? "close" : "delete"} size={16} />
                  </button>
                </div>

                {names.length > 0 && (
                  <div className="rord-card-items">
                    {names.slice(0, 4).map((name) => (
                      <span key={name} className="rord-item-chip">
                        {name}
                      </span>
                    ))}
                    {names.length > 4 && <span className="rord-item-chip">+{names.length - 4}</span>}
                  </div>
                )}

                {missing > 0 && (
                  <p className="rord-card-warn">
                    <Icon name="warning" size={13} />
                    {missing} מוצרים כבר לא קיימים במלאי ולא ייכנסו להזמנה
                  </p>
                )}

                {confirming ? (
                  <div className="rord-card-actions">
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      ביטול
                    </Button>
                    <Button
                      variant="danger"
                      className="flex-1"
                      icon="delete"
                      loading={busyId === template.id}
                      onClick={() => {
                        setConfirmDeleteId(null);
                        onDelete(template);
                      }}
                    >
                      מחיקה לצמיתות
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full !bg-ink"
                    icon="play_arrow"
                    disabled={usable === 0}
                    loading={busyId === template.id}
                    onClick={() => onUse(template)}
                  >
                    {usable === 0 ? "אין מוצרים זמינים" : "התחלת הזמנה מהתבנית"}
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
