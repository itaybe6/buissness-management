import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ActionToast } from "@/components/ui/ActionToast";
import { Button, Field, Icon, Input, Select } from "@/components/ui";
import { PositionsEditor } from "@/components/users/PositionsEditor";
import { useCreateUser } from "@/api/users";
import { useDepartments } from "@/api/departments";
import { useReplaceEmployeePositions } from "@/api/employeePositions";
import { DEFAULT_HOURLY_RATE } from "@/lib/constants";
import {
  accessRoleForPositions,
  findDuplicatePositionDraft,
  newPositionDraft,
  type PositionDraft,
} from "@/lib/employeePositions";
import type { Business, UserRole } from "@/types/database";

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

function initialDrafts(roles: UserRole[]): PositionDraft[] {
  return [newPositionDraft({ role: roles[0] ?? "employee", hourly_rate: String(DEFAULT_HOURLY_RATE) })];
}

/** The draft the DB will treat as primary (highest role, then list order) — sent as create-user metadata. */
function primaryDraft(drafts: PositionDraft[]): PositionDraft {
  const role = accessRoleForPositions(drafts);
  return drafts.find((d) => d.role === role) ?? drafts[0];
}

export function AddUserModal({ open, onClose, businessId, businesses, roles }: Props) {
  const create = useCreateUser();
  const replacePositions = useReplaceEmployeePositions();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [bizId, setBizId] = useState<string>(businessId ?? businesses?.[0]?.id ?? "");
  const [drafts, setDrafts] = useState<PositionDraft[]>(() => initialDrafts(roles));
  const [pensionActive, setPensionActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Success pill shown after the modal closes — lives here so every host page gets it.
  const [successText, setSuccessText] = useState<string | null>(null);
  const successTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(successTimer.current), []);

  const effectiveBiz = businessId ?? bizId;
  const { data: departments } = useDepartments(effectiveBiz || null);

  async function submit() {
    setError(null);
    if (!fullName || !email || !password) return setError("נא למלא שם, אימייל וסיסמה");
    if (drafts.length === 0) return setError("יש להגדיר לפחות תפקיד אחד");
    const dup = findDuplicatePositionDraft(drafts);
    if (dup) return setError("יש שני תפקידים זהים (אותה הרשאה ומחלקה) — מחקו אחד מהם");

    const primary = primaryDraft(drafts);
    try {
      const created = (await create.mutateAsync({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role: accessRoleForPositions(drafts, primary.role),
        business_id: effectiveBiz || null,
        department_id: primary.role === "employee" ? primary.department_id || null : null,
        phone: phone || undefined,
        hourly_rate: primary.hourly_rate.trim() ? Number(primary.hourly_rate) : DEFAULT_HOURLY_RATE,
        wage_type: primary.wage_type,
        pension_active: pensionActive,
      })) as { user?: { id?: string } } | undefined;

      const newId = created?.user?.id;
      if (newId && effectiveBiz) {
        // The DB trigger already created the primary position from the metadata;
        // replace it with the full list so every extra role is stored too.
        await replacePositions.mutateAsync({
          business_id: effectiveBiz,
          employee_id: newId,
          positions: drafts,
        });
      }
      const name = fullName.trim();
      onClose();
      reset();
      setSuccessText(`${name} נוסף/ה בהצלחה`);
      window.clearTimeout(successTimer.current);
      successTimer.current = window.setTimeout(() => setSuccessText(null), 3600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה ביצירת המשתמש");
    }
  }

  function reset() {
    setFullName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setDrafts(initialDrafts(roles));
    setPensionActive(false);
  }

  return (
    <>
    <ActionToast text={successText} />
    <Modal
      open={open}
      onClose={onClose}
      title="הוספת משתמש"
      subtitle="יצירת חשבון לעובד חדש"
      icon="person_add"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button className="flex-1" loading={create.isPending || replacePositions.isPending} onClick={submit}>
            יצירת משתמש
          </Button>
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
        <Field label="אימייל">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ direction: "ltr", textAlign: "right" }} placeholder="name@business.co.il" />
        </Field>
        <Field label="טלפון">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ direction: "ltr", textAlign: "right" }} placeholder="050-0000000" />
        </Field>

        <div>
          <span className="label-text">תפקידים והרשאות</span>
          <div className="mt-1.5">
            <PositionsEditor drafts={drafts} onChange={setDrafts} roles={roles} departments={departments ?? []} />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-[11px] border border-border px-3.5 py-3">
          <input
            type="checkbox"
            checked={pensionActive}
            onChange={(e) => setPensionActive(e.target.checked)}
            className="h-[17px] w-[17px]"
            style={{ accentColor: "var(--accent-2)" }}
          />
          <span className="text-[14px] font-semibold">פנסיה פעילה</span>
        </label>
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
    </>
  );
}
