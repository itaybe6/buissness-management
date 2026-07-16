import { useEffect, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useForm101, useSaveForm101 } from "@/api/forms";

interface FormData {
  id_number: string;
  address: string;
  city: string;
  phone: string;
  marital_status: string;
  children: string;
  bank_account: string;
  notes: string;
}

const FORM_EMPTY: FormData = {
  id_number: "",
  address: "",
  city: "",
  phone: "",
  marital_status: "single",
  children: "0",
  bank_account: "",
  notes: "",
};

export function Form101Modal({ employeeId, taxYear, onClose }: { employeeId: string; taxYear: number; onClose: () => void }) {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: form } = useForm101(businessId, employeeId, taxYear);
  const save = useSaveForm101(businessId);
  const [values, setValues] = useState<FormData>(FORM_EMPTY);

  useEffect(() => {
    if (form?.data) setValues({ ...FORM_EMPTY, ...(form.data as Partial<FormData>) });
  }, [form]);

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function persist(submitted: boolean) {
    await save.mutateAsync({
      business_id: businessId!,
      employee_id: employeeId,
      tax_year: taxYear,
      data: values as unknown as Record<string, unknown>,
      submitted,
    });
    if (submitted) onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`טופס 101 · ${taxYear}`}
      icon="description"
      maxWidth={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>סגירה</Button>
          <Button variant="secondary" loading={save.isPending} onClick={() => persist(false)}>שמירת טיוטה</Button>
          <Button className="flex-1" icon="send" loading={save.isPending} onClick={() => persist(true)}>הגשה</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="שם מלא"><Input value={profile?.full_name ?? ""} disabled /></Field>
        <Field label="תעודת זהות"><Input value={values.id_number} onChange={set("id_number")} style={{ direction: "ltr", textAlign: "right" }} /></Field>
        <Field label="כתובת"><Input value={values.address} onChange={set("address")} /></Field>
        <Field label="עיר"><Input value={values.city} onChange={set("city")} /></Field>
        <Field label="טלפון"><Input value={values.phone} onChange={set("phone")} style={{ direction: "ltr", textAlign: "right" }} /></Field>
        <Field label="מצב משפחתי">
          <Select value={values.marital_status} onChange={set("marital_status")}>
            <option value="single">רווק/ה</option>
            <option value="married">נשוי/אה</option>
            <option value="divorced">גרוש/ה</option>
            <option value="widowed">אלמן/ה</option>
          </Select>
        </Field>
        <Field label="מספר ילדים"><Input type="number" value={values.children} onChange={set("children")} /></Field>
        <Field label="חשבון בנק"><Input value={values.bank_account} onChange={set("bank_account")} style={{ direction: "ltr", textAlign: "right" }} /></Field>
        <div className="sm:col-span-2"><Field label="הערות"><Input value={values.notes} onChange={set("notes")} /></Field></div>
      </div>
    </Modal>
  );
}
