import { useMemo, useState } from "react";
import { Button, Icon, Input, Select } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  inventoryUnitOptions,
  inventoryUnitIsBase,
  inventoryUnitSaveError,
  useCreateInventoryUnit,
  useInventoryUnits,
} from "@/api/inventoryUnits";

const ADD_UNIT_VALUE = "__add_unit__";

type InventoryUnitSelectProps = {
  businessId: string | null;
  value: string;
  onChange: (unit: string) => void;
  canManage?: boolean;
  className?: string;
};

export function InventoryUnitSelect({
  businessId,
  value,
  onChange,
  canManage = false,
  className = "ipf-select",
}: InventoryUnitSelectProps) {
  const { data: units } = useInventoryUnits(businessId);
  const createUnit = useCreateInventoryUnit(businessId);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const options = useMemo(() => inventoryUnitOptions(units, value), [units, value]);

  function handleSelect(next: string) {
    if (next === ADD_UNIT_VALUE) {
      setNewName("");
      setAddError(null);
      setAddOpen(true);
      return;
    }
    onChange(next);
  }

  async function submitNewUnit() {
    if (!businessId) return;
    setAddError(null);
    const name = newName.trim();
    if (!name) {
      setAddError("נא להזין שם יחידה");
      return;
    }
    try {
      const created = await createUnit.mutateAsync({ business_id: businessId, name });
      onChange(created.name);
      setAddOpen(false);
      setNewName("");
    } catch (e) {
      setAddError(inventoryUnitSaveError(e));
    }
  }

  return (
    <>
      <Select className={className} value={value} onChange={(e) => handleSelect(e.target.value)}>
        {options.map((u) => (
          <option key={u.id} value={u.name}>
            {u.name}
          </option>
        ))}
        {canManage && (
          <option value={ADD_UNIT_VALUE}>+ הוסף יחידה חדשה</option>
        )}
      </Select>

      <Modal
        open={addOpen}
        onClose={() => !createUnit.isPending && setAddOpen(false)}
        title="יחידת מידה חדשה"
        subtitle="יחידה שתופיע בכל מוצרי העסק"
        icon="straighten"
        maxWidth={420}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setAddOpen(false)} disabled={createUnit.isPending}>
              ביטול
            </Button>
            <Button className="flex-[2]" icon="add" loading={createUnit.isPending} onClick={() => void submitNewUnit()}>
              הוספה
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-text-2">שם היחידה</span>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="לדוגמה: שק, גלון, מארז"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitNewUnit();
              }
            }}
          />
        </label>
        {addError && (
          <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-[var(--danger)]" role="alert">
            <Icon name="error" size={16} />
            {addError}
          </p>
        )}
      </Modal>
    </>
  );
}

export { inventoryUnitIsBase };
