import { useEffect, useState } from "react";
import { Button, Field, Icon, Input, Switch } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  useCreateMenuCategory,
  useDeleteMenuCategory,
  useSaveMenuSettings,
  useUpdateMenuCategory,
} from "@/api/menu";
import { menuSaveError } from "@/lib/menuCosting";
import type { MenuCategory, MenuSettings } from "@/types/database";

export function MenuSettingsModal({
  open,
  onClose,
  businessId,
  settings,
  categories,
  dishCountByCategory,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
  settings: MenuSettings;
  categories: MenuCategory[];
  dishCountByCategory: Map<string, number>;
}) {
  const save = useSaveMenuSettings(businessId);
  const createCat = useCreateMenuCategory(businessId);
  const updateCat = useUpdateMenuCategory(businessId);
  const deleteCat = useDeleteMenuCategory(businessId);

  const [vat, setVat] = useState(String(settings.vat_pct));
  const [pricesIncl, setPricesIncl] = useState(settings.prices_include_vat);
  const [costsIncl, setCostsIncl] = useState(settings.costs_include_vat);
  const [target, setTarget] = useState(String(settings.target_food_cost_pct));
  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
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

  async function addCategory() {
    if (!newCat.trim()) return;
    try {
      await createCat.mutateAsync({ business_id: businessId, name: newCat });
      setNewCat("");
    } catch (e) {
      setError(menuSaveError(e));
    }
  }

  async function renameCategory() {
    if (!editing) return;
    try {
      await updateCat.mutateAsync({ id: editing.id, name: editing.name });
      setEditing(null);
    } catch (e) {
      setError(menuSaveError(e));
    }
  }

  async function move(cat: MenuCategory, dir: -1 | 1) {
    const idx = categories.findIndex((c) => c.id === cat.id);
    const other = categories[idx + dir];
    if (!other) return;
    try {
      await Promise.all([
        updateCat.mutateAsync({ id: cat.id, sort_order: other.sort_order }),
        updateCat.mutateAsync({ id: other.id, sort_order: cat.sort_order }),
      ]);
    } catch (e) {
      setError(menuSaveError(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="הגדרות תמחור" subtitle="מע״מ, יעד רווחיות וקטגוריות התפריט" icon="tune" maxWidth={560}>
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

        <section className="mnu-settings-block">
          <h4>קטגוריות התפריט</h4>
          <div className="flex gap-2">
            <Input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="ראשונות, עיקריות, קינוחים, שתייה..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCategory();
                }
              }}
            />
            <Button variant="secondary" icon="add" loading={createCat.isPending} onClick={addCategory} disabled={!newCat.trim()}>
              הוספה
            </Button>
          </div>
          {categories.length === 0 ? (
            <div className="text-[13px] text-text-3">עדיין אין קטגוריות. מנות בלי קטגוריה מופיעות תחת «כללי».</div>
          ) : (
            <ul className="mnu-cat-list">
              {categories.map((c, i) => (
                <li key={c.id}>
                  {editing?.id === c.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editing.name}
                        onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameCategory();
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                      <button type="button" className="icon-btn !h-9 !w-9" onClick={renameCategory} aria-label="שמירה">
                        <Icon name="check" size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate font-bold">{c.name}</span>
                      <span className="text-[12px] text-text-3">{dishCountByCategory.get(c.id) ?? 0} מנות</span>
                      <button type="button" className="icon-btn !h-8 !w-8" disabled={i === 0} onClick={() => move(c, -1)} aria-label="העלאה">
                        <Icon name="arrow_upward" size={16} />
                      </button>
                      <button type="button" className="icon-btn !h-8 !w-8" disabled={i === categories.length - 1} onClick={() => move(c, 1)} aria-label="הורדה">
                        <Icon name="arrow_downward" size={16} />
                      </button>
                      <button type="button" className="icon-btn !h-8 !w-8" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label="שינוי שם">
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn !h-8 !w-8 text-danger"
                        onClick={() => {
                          if (window.confirm(`למחוק את הקטגוריה «${c.name}»? המנות שבה יעברו ל«כללי».`)) deleteCat.mutate(c.id);
                        }}
                        aria-label="מחיקה"
                      >
                        <Icon name="delete" size={16} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
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
