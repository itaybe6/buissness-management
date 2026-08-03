import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";

interface SaveRecurringBeforeSendPromptProps {
  open: boolean;
  lineCount: number;
  supplierCount: number;
  onSendOnly: () => void;
  onSaveAndSend: () => void;
  onClose: () => void;
}

export function SaveRecurringBeforeSendPrompt({
  open,
  lineCount,
  supplierCount,
  onSendOnly,
  onSaveAndSend,
  onClose,
}: SaveRecurringBeforeSendPromptProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="לשמור כהזמנה קבועה?"
      subtitle={`${lineCount} מוצרים · ${supplierCount} ${supplierCount === 1 ? "ספק" : "ספקים"}`}
      icon="event_repeat"
      maxWidth={480}
      footer={
        <>
          <Button variant="secondary" onClick={onSendOnly} icon="send">
            שליחה בלבד
          </Button>
          <Button className="flex-1 !bg-ink" icon="bookmark_add" onClick={onSaveAndSend}>
            שמירה ושליחה
          </Button>
        </>
      }
    >
      <div className="odft-body">
        <p className="odft-note">
          <Icon name="info" size={14} />
          בפעם הבאה תוכלו להתחיל את אותה הזמנה בלחיצה אחת — עם המוצרים, הכמויות והספקים שבחרתם עכשיו.
        </p>
      </div>
    </Modal>
  );
}
