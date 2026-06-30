import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button, Field, Icon, Input, Select } from "@/components/ui";
import { useCreateUser } from "@/api/users";
import { useDepartments } from "@/api/departments";
import { ROLE_LABELS, WAGE_TYPE_LABELS } from "@/lib/constants";
import type { Business, UserRole, WageType } from "@/types/database";

interface Props {
  open: boolean;
  onClose: () => void;
  /** when set, user is created for this business (manager flow / chosen business) */
  businessId: string | null;
  /** super-admin only: list of businesses to choose from */
  businesses?: Business[];
  /** roles selectable in this context */
  roles: UserRole[];
}

export function AddUserModal({ open, onClose, businessId, businesses, roles }: Props) {
  const create = useCreateUser();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(roles[0] ?? "employee");
  const [bizId, setBizId] = useState<string>(businessId ?? businesses?.[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [wageType, setWageType] = useState<WageType>("hourly");
  const [hourlyRate, setHourlyRate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const effectiveBiz = businessId ?? bizId;
  const { data: departments } = useDepartments(effectiveBiz || null);

  async function submit() {
    setError(null);
    if (!fullName || !email || !password) return setError("נא למלא שם, אימייל וסיסמה");
    try {
      await create.mutateAsync({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role,
        business_id: effectiveBiz || null,
        department_id: role === "employee" ? departmentId || null : null,
        phone: phone || undefined,
        hourly_rate: hourlyRate ? Number(hourlyRate) : 0,
        wage_type: wageType,
      });
      onClose();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה ביצירת המשתמש");
    }
  }

  function reset() {
    setFullName(""); setEmail(""); setPhone(""); setPassword(""); setHourlyRate(""); setDepartmentId(""); setWageType("hourly");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="הוספת משתמש"
      subtitle="יצירת חשבון לעובד חדש"
      icon="person_add"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button className="flex-1" loading={create.isPending} onClick={submit}>יצירת משתמש</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="שם מלא">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="לדוגמה: דנה כהן" />
        </Field>
        {businesses && !businessId && (
          <Field label="עסק">
            <Select value={bizId} onChange={(e) => setBizId(e.target.value)}>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <div className={role === "employee" ? "grid grid-cols-2 gap-3" : undefined}>
          <Field label="הרשאה">
            <Select
              value={role}
              onChange={(e) => {
                const next = e.target.value as UserRole;
                setRole(next);
                if (next !== "employee") setDepartmentId("");
              }}
            >
              {roles.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </Field>
          {role === "employee" && (
            <Field label="מחלקה">
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">— ללא —</option>
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label="אימייל">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ direction: "ltr", textAlign: "right" }} placeholder="name@business.co.il" />
        </Field>
        <Field label="טלפון">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ direction: "ltr", textAlign: "right" }} placeholder="050-0000000" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="סוג שכר">
            <Select value={wageType} onChange={(e) => setWageType(e.target.value as WageType)}>
              {(Object.keys(WAGE_TYPE_LABELS) as WageType[]).map((w) => (
                <option key={w} value={w}>{WAGE_TYPE_LABELS[w]}</option>
              ))}
            </Select>
          </Field>
          <Field label={wageType === "tips" ? "מינימום לשעה (₪)" : "שכר שעתי (₪)"}>
            <Input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="0" />
          </Field>
        </div>
        {wageType === "tips" && (
          <div className="-mt-1.5 text-[12px] text-text-2">
            עובד טיפים מקבל את חלקו מקופת הטיפים. אם בחישוב המשמרת התעריף השעתי יוצא נמוך מהמינימום — משלימים לו עד המינימום שהוזן.
          </div>
        )}
        <Field label="סיסמה ראשונית">
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="לפחות 6 תווים" />
        </Field>
        {error && (
          <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Icon name="error" size={18} /> {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
