import { form101Template, isSigned } from "@/api/agreements";
import type { AgreementSignature, AgreementTemplate, EmployeeIdCard } from "@/types/database";

/** One row/cell in the manager's "document status" table. */
export type DocStatus = {
  label: string;
  done: boolean;
  optional: boolean;
  template?: AgreementTemplate;
  idCard?: EmployeeIdCard;
};

export type EmployeeDocs = {
  idCardDoc: DocStatus;
  form101Doc: DocStatus;
  /** Global work agreement (if any) + every personal agreement of the employee. */
  workDocs: DocStatus[];
  /** Global fixed documents (e.g. sexual harassment). */
  fixedDocs: DocStatus[];
  /** Flat list in display order — used by the mobile roster and the counters. */
  all: DocStatus[];
};

/**
 * Every agreement the employee must sign in the "work / personal" bucket:
 * the global work agreement (if any) plus *all* of their personal agreements.
 * An employee can hold several personal agreements — none of them replaces another.
 */
export function employeeWorkDocs({
  agreements,
  globalWork,
  signatures,
  employeeId,
}: {
  agreements: AgreementTemplate[];
  globalWork: AgreementTemplate | undefined;
  signatures: AgreementSignature[];
  employeeId: string;
}): DocStatus[] {
  const personal = agreements.filter((a) => a.employee_id === employeeId && a.type !== "form_101");
  const list = [...(globalWork ? [globalWork] : []), ...personal];
  if (list.length === 0) return [{ label: "הסכם עבודה", done: false, optional: true }];
  return list.map((a) => ({
    label: a.title,
    done: isSigned(signatures, a.id, employeeId),
    optional: false,
    template: a,
  }));
}

export function employeeDocs({
  agreements,
  globalFixed,
  globalWork,
  signatures,
  idCards,
  employeeId,
  taxYear,
}: {
  agreements: AgreementTemplate[];
  globalFixed: AgreementTemplate[];
  globalWork: AgreementTemplate | undefined;
  signatures: AgreementSignature[];
  idCards: EmployeeIdCard[];
  employeeId: string;
  taxYear: number;
}): EmployeeDocs {
  const form101Tpl = form101Template(agreements);
  const idCard = idCards.find((c) => c.employee_id === employeeId);
  const idCardDoc: DocStatus = { label: "תעודת זהות", done: !!idCard, optional: false, idCard };
  const form101Doc: DocStatus = {
    label: `טופס 101 (${taxYear})`,
    done: form101Tpl ? isSigned(signatures, form101Tpl.id, employeeId) : false,
    optional: !form101Tpl,
    template: form101Tpl,
  };
  const workDocs = employeeWorkDocs({ agreements, globalWork, signatures, employeeId });
  const fixedDocs: DocStatus[] = globalFixed.map((a) => ({
    label: a.title,
    done: isSigned(signatures, a.id, employeeId),
    optional: false,
    template: a,
  }));
  return {
    idCardDoc,
    form101Doc,
    workDocs,
    fixedDocs,
    all: [idCardDoc, form101Doc, ...workDocs, ...fixedDocs],
  };
}

/** Stable React key — two agreements with the same title must not collide. */
export function docKey(d: DocStatus, index: number): string {
  return d.template?.id ?? d.idCard?.id ?? `${d.label}-${index}`;
}
