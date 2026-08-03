import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";

export interface OrderDraftPreviewLine {
  item_id: string;
  name: string;
  image_url: string | null;
  qty_label: string;
}

interface OrderDraftPromptProps {
  open: boolean;
  /** e.g. "לפני 20 דק׳" — how long the unsent order has been waiting. */
  savedAgo: string;
  lines: OrderDraftPreviewLine[];
  /** The saved order is being loaded back into the cart. */
  busy?: boolean;
  onRestore: () => void;
  onDiscard: () => void;
  /** Escape / backdrop — decide later, the saved order stays untouched. */
  onClose: () => void;
}

export function OrderDraftPrompt({
  open,
  savedAgo,
  lines,
  busy = false,
  onRestore,
  onDiscard,
  onClose,
}: OrderDraftPromptProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="להמשיך מההזמנה האחרונה?"
      subtitle={`${lines.length} מוצרים · נשמרה ${savedAgo}`}
      icon="history"
      maxWidth={480}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onDiscard}>
            התחלה מחדש
          </Button>
          <Button className="flex-1 !bg-ink" icon="play_arrow" loading={busy} onClick={onRestore}>
            {busy ? "טוען את ההזמנה..." : "המשך מאיפה שהפסקתי"}
          </Button>
        </>
      }
    >
      <div className="odft-body">
        <p className="odft-note">
          <Icon name="info" size={14} />
          יצאתם מהעמוד לפני ששלחתם את ההזמנה. אלה המוצרים שנשמרו:
        </p>
        <ul className="odft-lines">
          {lines.map((line) => (
            <li key={line.item_id} className="odft-line">
              <span className="odft-thumb">
                {line.image_url ? (
                  <img src={line.image_url} alt="" />
                ) : (
                  <Icon name="inventory_2" size={15} />
                )}
              </span>
              <span className="odft-name">{line.name}</span>
              <span className="odft-qty tabular-nums">{line.qty_label}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
