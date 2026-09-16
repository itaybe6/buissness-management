import { useEffect, useState } from "react";
import { Button, Field, Icon, Input, Switch } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useSaveMenuSettings } from "@/api/menu";
import { menuSaveError } from "@/lib/menuCosting";
import type { MenuSettings } from "@/types/database";

export function MenuSettingsModal({
  open,
  onClose,
  businessId,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
  settings: MenuSettings;
}) {
  const save = useSaveMenuSettings(businessId);

  const [vat, setVat] = useState(String(settings.vat_pct));
  const [pricesIncl, setPricesIncl] = useState(settings.prices_include_vat);
  const [costsIncl, setCostsIncl] = useState(settings.costs_include_vat);
  const [target, setTarget] = useState(String(settings.target_food_cost_pct));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVat(String(settings.vat_pct));
    setPricesIncl(settings.prices_include_vat);
    setCostsIncl(settings.costs_include_vat);
    setTarget(String(settings.target_food_cost_pct));
    setError(null);
  }, [open, settings]);

  async function submit() {
    setError(null);
    const vatNum = Number(vat);
    const targetNum = Number(target);
    if (!Number.isFinite(vatNum) || vatNum < 0 || vatNum > 50) return setError("מע״מ חייב להיות בין 0 ל-50");
    if (!Number.isFinite(targetNum) || targetNum <= 0 || targetNum >= 100) return setError("יעד Food Cost חייב להיות בין 1 ל-99");
    try {
      await save.mutateAsync({
        business_id: businessId,
        vat_pct: vatNum,
        prices_include_vat: pricesIncl,
        costs_include_vat: costsIncl,
        target_food_cost_pct: targetNum,
      });
      onClose();
    } catch (e) {
      setError(menuSaveError(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="הגדרות תמחור" subtitle="מע״מ ויעד רווחיות" icon="tune" maxWidth={560}>
      <div className="flex flex-col gap-5">
        <section className="mnu-settings-block">
          <h4>מע״מ ומחירים</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="אחוז מע״מ">
              <Input type="number" inputMode="decimal" min={0} max={50} step="0.5" value={vat} onChange={(e) => setVat(e.target.value)} />
            </Field>
            <Field label="יעד Food Cost (%)">
              <Input type="number" inputMode="decimal" min={1} max={99} step="1" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
          </div>
          <label className="mnu-switch-row">
            <span>
              <b>מחירי התפריט כוללים מע״מ</b>
              <small>המחיר שהלקוח רואה. הרווח מחושב על הנטו אחרי הפרשת המע״מ.</small>
            </span>
            <Switch checked={pricesIncl} onChange={setPricesIncl} />
          </label>
          <label className="mnu-switch-row">
            <span>
              <b>מחירי הספקים כוללים מע״מ</b>
              <small>אם המחירונים הוזנו ברוטו — המערכת תנטרל את המע״מ מהעלות (מע״מ תשומות מוחזר).</small>
            </span>
            <Switch checked={costsIncl} onChange={setCostsIncl} />
          </label>
          <div className="mnu-note">
            <Icon name="lightbulb" size={17} fill />
            <span>
              יעד Food Cost מקובל במסעדות: 28–35%. בבר / קפה נהוג 18–25%. אפשר לקבוע יעד שונה לכל מנה בנפרד.
            </span>
          </div>
        </section>

        {error && <div className="text-[12.5px] font-semibold text-danger">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            סגירה
          </Button>
          <Button icon="save" loading={save.isPending} onClick={submit}>
            שמירת הגדרות
          </Button>
        </div>
      </div>
    </Modal>
  );
}
