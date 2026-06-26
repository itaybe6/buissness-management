import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, Icon, Input, PageHeader, PageLoader, ErrorState, Select } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useForm101, useSaveForm101 } from "@/api/forms";

const YEARS = [new Date().getFullYear(), new Date().getFullYear() - 1];

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
const EMPTY: FormData = { id_number: "", address: "", city: "", phone: "", marital_status: "single", children: "0", bank_account: "", notes: "" };

export function Form101() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const [year, setYear] = useState(YEARS[0]);
  const { data: form, isLoading, isError, refetch } = useForm101(businessId, profile?.id, year);
  const save = useSaveForm101(businessId);
  const [values, setValues] = useState<FormData>(EMPTY);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    if (form?.data) setValues({ ...EMPTY, ...(form.data as Partial<FormData>) });
    else setValues(EMPTY);
  }, [form]);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function persist(submitted: boolean) {
    await save.mutateAsync({ business_id: businessId!, employee_id: profile!.id, tax_year: year, data: values as unknown as Record<string, unknown>, submitted });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  }

  return (
    <div className="mx-auto max-w-[760px] animate-fadeUp">
      <PageHeader
        title="טופס 101"
        subtitle="פרטים אישיים לצורכי מס · לכל שנת מס"
        actions={<Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="!w-[120px]">{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</Select>}
      />

      <Card className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[16px] font-bold"><Icon name="description" size={22} className="text-accent-2" /> שנת מס {year}</div>
          {form?.submitted ? <Badge tone="success">הוגש</Badge> : <Badge tone="warning">טיוטה</Badge>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="mt-6 flex items-center gap-2.5">
          <Button variant="secondary" icon="save" loading={save.isPending} onClick={() => persist(false)}>שמירת טיוטה</Button>
          <Button icon="send" loading={save.isPending} onClick={() => persist(true)}>הגשת הטופס</Button>
          {savedMsg && <span className="flex items-center gap-1 text-[13px] font-semibold text-success"><Icon name="check_circle" size={17} /> נשמר</span>}
        </div>
      </Card>
    </div>
  );
}
