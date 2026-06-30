import type { AgreementType, ReceiptType } from "@/types/database";

export const TYPE_LABELS: Record<AgreementType, string> = {
  work: "הסכם עבודה",
  sexual_harassment: "מניעת הטרדה",
  other: "אחר",
  form_101: "טופס 101",
};

export const TAX_YEAR = new Date().getFullYear();

export type ManagerTab = "status" | "form101" | "templates" | "receipts";

export const RECEIPT_TYPE_LABELS: Record<ReceiptType, string> = {
  tax_invoice: "חשבונית מס",
  tax_invoice_receipt: "חשבונית מס קבלה",
  receipt: "קבלה",
};

export const RECEIPT_TYPE_ICONS: Record<ReceiptType, string> = {
  tax_invoice: "receipt_long",
  tax_invoice_receipt: "request_quote",
  receipt: "payments",
};

export const RECEIPT_TYPES: ReceiptType[] = ["tax_invoice", "tax_invoice_receipt", "receipt"];
