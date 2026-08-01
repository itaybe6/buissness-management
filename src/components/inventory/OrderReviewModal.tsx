import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  deliveryDaysLabel,
  formatPrice,
  type DraftOrderLine,
  type DraftSupplierGroup,
} from "@/lib/orderSuppliers";

interface OrderReviewModalProps {
  open: boolean;
  groups: DraftSupplierGroup[];
  total: number;
  busy: boolean;
  error: string | null;
  isEditing: boolean;
  onClose: () => void;
  onRemoveLine: (itemId: string) => void;
  onSubmit: () => void;
}

function monogram(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0] : "?";
}

function ReviewLine({ line, onRemove }: { line: DraftOrderLine; onRemove: () => void }) {
  return (
    <li className="orev-line">
      <span className="orev-thumb">
        {line.image_url ? <img src={line.image_url} alt="" /> : <Icon name="inventory_2" size={15} />}
      </span>
      <span className="orev-line-body">
        <span className="orev-line-name">{line.name}</span>
        <span className="orev-line-calc tabular-nums">
          {line.unit_price > 0 ? (
            line.calc_label || line.qty_label
          ) : (
            <>
              {line.qty_label}
              <span className="orev-line-noprice"> · ללא מחיר מוגדר</span>
            </>
          )}
        </span>
      </span>
      <span className="orev-line-total tabular-nums">{line.line_total > 0 ? formatPrice(line.line_total) : "—"}</span>
      <button type="button" className="orev-line-remove" onClick={onRemove} aria-label={`הסרת ${line.name}`}>
        <Icon name="close" size={15} />
      </button>
    </li>
  );
}

export function OrderReviewModal({
  open,
  groups,
  total,
  busy,
  error,
  isEditing,
  onClose,
  onRemoveLine,
  onSubmit,
}: OrderReviewModalProps) {
  const lineCount = groups.reduce((sum, g) => sum + g.lines.length, 0);
  const unpricedCount = groups.reduce((sum, g) => sum + g.unpriced_count, 0);
  const multiSupplier = groups.length > 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="סיכום ההזמנה"
      subtitle={`${lineCount} מוצרים · ${groups.length} ${groups.length === 1 ? "ספק" : "ספקים"}`}
      icon="receipt_long"
      maxWidth={620}
      fullScreenMobile
      footer={
        <>
          <Button variant="secondary" onClick={onClose} icon="arrow_forward" className="active:scale-[0.98]">
            חזרה לעריכה
          </Button>
          <Button
            className="flex-1 !bg-ink active:scale-[0.98]"
            icon="send"
            loading={busy}
            disabled={lineCount === 0}
            onClick={onSubmit}
          >
            {isEditing ? "שמירת השינויים" : multiSupplier ? `שליחה · ${groups.length} הזמנות` : "שליחת ההזמנה"}
          </Button>
        </>
      }
    >
      <div className="orev-body">
        {multiSupplier && !isEditing && (
          <p className="orev-split">
            <Icon name="call_split" size={15} />
            הבחירה מתפצלת ל־{groups.length} הזמנות נפרדות — אחת לכל ספק.
          </p>
        )}

        {groups.map((group) => (
          <section key={group.supplier_id} className="orev-group">
            <header className="orev-group-head">
              <span className="orev-avatar">{monogram(group.name)}</span>
              <span className="orev-group-info">
                <span className="orev-group-name">{group.name}</span>
                <span className="orev-group-meta">
                  <Icon name="local_shipping" size={12} />
                  אספקה: {deliveryDaysLabel(group.delivery_days)}
                  <span className="orev-dot" />
                  {group.lines.length} מוצרים
                </span>
              </span>
              <span className="orev-group-total tabular-nums">{formatPrice(group.total)}</span>
            </header>
            <ul className="orev-lines">
              {group.lines.map((line) => (
                <ReviewLine key={line.item_id} line={line} onRemove={() => onRemoveLine(line.item_id)} />
              ))}
            </ul>
            {group.unpriced_count > 0 && (
              <p className="orev-group-warn">
                <Icon name="info" size={13} />
                {group.unpriced_count} מוצרים ללא מחיר במחירון הספק — הסכום חלקי.
              </p>
            )}
          </section>
        ))}

        <div className="orev-grand">
          <span className="orev-grand-label">
            סה״כ הזמנה
            {unpricedCount > 0 && <small>ללא {unpricedCount} מוצרים שאין להם מחיר</small>}
          </span>
          <b className="orev-grand-value tabular-nums">{formatPrice(total)}</b>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Icon name="error" size={18} className="shrink-0" />
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
