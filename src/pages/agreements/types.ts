import type { AgreementType } from "@/types/database";

export const TYPE_LABELS: Record<AgreementType, string> = {
  work: "הסכם עבודה",
  sexual_harassment: "מניעת הטרדה",
  other: "אחר",
};

export const TAX_YEAR = new Date().getFullYear();

export type ManagerTab = "status" | "form101" | "templates";
