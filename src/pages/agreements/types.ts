import type { AgreementType, ReceiptType } from "@/types/database";

export const TYPE_LABELS: Record<AgreementType, string> = {
  work: "הסכם עבודה",
  sexual_harassment: "מניעת הטרדה",
  other: "אחר",
  form_101: "טופס 101",
};

export const TYPE_ICONS: Record<AgreementType, string> = {
  work: "work",
  sexual_harassment: "shield",
  other: "article",
  form_101: "description",
};

export const TYPE_ACCENTS: Record<AgreementType, string> = {
  work: "success",
  sexual_harassment: "violet",
  other: "info",
  form_101: "warning",
};

export const TAX_YEAR = new Date().getFullYear();

export type ManagerTab = "status" | "form101" | "templates" | "receipts";

export type DocsMgmtCategory = "all" | "sexual_harassment" | "form_101" | "personal";

export const MGMT_CATEGORIES: { key: DocsMgmtCategory; label: string; icon: string }[] = [
  { key: "all", label: "הכל", icon: "folder" },
  { key: "sexual_harassment", label: "הטרדה", icon: "shield" },
  { key: "form_101", label: "טופס 101", icon: "description" },
  { key: "personal", label: "אישיים", icon: "article" },
];

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
