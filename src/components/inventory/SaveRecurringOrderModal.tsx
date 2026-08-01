import { useEffect, useMemo, useState } from "react";
import { Button, Field, Icon, Input } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import type { RecurringOrderWithItems } from "@/api/recurringOrders";
import type { DraftOrderLine } from "@/lib/orderSuppliers";

interface SaveRecurringOrderModalProps {
  open: boolean;
  lines: DraftOrderLine[];
  templates: RecurringOrderWithItems[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: { id: string | null; name: string }) => void;
}

const NEW_TEMPLATE = "__new__";

export function SaveRecurringOrderModal({
  open,
  lines,
  templates,
  busy,
  error,
  onClose,
  onSave,
}: SaveRecurringOrderModalProps) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState<string>(NEW_TEMPLATE);

  useEffect(() => {
    if (!open) return;
    setName("");
    setTarget(NEW_TEMPLATE);
  }, [open]);

  const overwriting = target !== NEW_TEMPLATE;
  const selected = useMemo(
    () => templates.find((t) => t.id === target) ?? null,
    [templates, target],
  );
  const effectiveName = overwriting ? selected?.name ?? "" : name.trim();
  const canSave = !!effectiveName && lines.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="שמירה כהזמנה קבועה"
      subtitle={`${lines.length} מוצרים מההזמנה הנוכחית`}
      icon="bookmark_add"
      maxWidth={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
          <Button
            className="flex-1 !bg-ink"
            icon="check"
            disabled={!canSave}
            loading={busy}
            onClick={() => onSave({ id: overwriting ? target : null, name: effectiveName })}
          >
            {overwriting ? "עדכון התבנית" : "שמירה"}
          </Button>
        </>
      }
    >
      <div className="rord-save">
        <p className="rord-note">
          <Icon name="info" size={14} />
          נשמרים המוצרים, הכמויות והספקים — ההזמנה עצמה לא נשלחת עכשיו.
        </p>

        {templates.length > 0 && (
          <div className="rord-targets">
            <span className="label-text">לאן לשמור</span>
            <div className="rord-target-row">
              <button
                type="button"
                className="rord-target"
                data-active={!overwriting}
                onClick={() => setTarget(NEW_TEMPLATE)}
              >
                <Icon name="add" size={14} />
                הזמנה קבועה חדשה
              </button>
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="rord-target"
                  data-active={target === template.id}
                  onClick={() => setTarget(template.id)}
                >
                  <Icon name="event_repeat" size={14} />
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {overwriting ? (
          <p className="rord-note rord-note--warn">
            <Icon name="warning" size={14} />
            המוצרים של "{selected?.name}" יוחלפו במוצרים שבהזמנה הנוכחית.
          </p>
        ) : (
          <Field label="שם ההזמנה הקבועה">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="למשל: הזמנת בר שבועית"
              maxLength={60}
              autoFocus
            />
          </Field>
        )}

        <ul className="rord-preview">
          {lines.map((line) => (
            <li key={line.item_id} className="rord-preview-line">
              <span className="rord-preview-name">{line.name}</span>
              <span className="rord-preview-qty tabular-nums">{line.qty_label}</span>
            </li>
          ))}
        </ul>

        {error && (
          <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Icon name="error" size={18} className="shrink-0" /> {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
