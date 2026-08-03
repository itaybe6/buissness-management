import { useEffect, useMemo, useState } from "react";
import { Button, Icon, Input, Select } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  UNIT_KINDS,
  guessInventoryUnitKind,
  inventoryUnitOptions,
  inventoryUnitSaveError,
  pieceUnitOptions,
  useCreateInventoryUnit,
  useInventoryUnits,
} from "@/api/inventoryUnits";
import type { InventoryUnitKind } from "@/types/database";

const ADD_UNIT_VALUE = "__add_unit__";

/** Singles first, then containers, then measures — the order managers think in. */
const KIND_RANK: Record<InventoryUnitKind, number> = { single: 0, package: 1, measure: 2 };

type InventoryUnitSelectProps = {
  businessId: string | null;
  value: string;
  onChange: (unit: string) => void;
  canManage?: boolean;
  className?: string;
  /** Limit the list to units that can sit inside a package (single items only). */
  pieceOnly?: boolean;
};

export function InventoryUnitSelect({
  businessId,
  value,
  onChange,
  canManage = false,
  className = "ipf-select",
  pieceOnly = false,
}: InventoryUnitSelectProps) {
  const { data: units } = useInventoryUnits(businessId);
  const createUnit = useCreateInventoryUnit(businessId);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<InventoryUnitKind>("single");
  const [addError, setAddError] = useState<string | null>(null);

  const options = useMemo(() => {
    const list = pieceOnly ? pieceUnitOptions(units, value) : inventoryUnitOptions(units, value);
    return [...list].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  }, [units, value, pieceOnly]);

  /* Guess the kind from what the manager types, until they pick one themselves. */
  const [kindTouched, setKindTouched] = useState(false);
  useEffect(() => {
    if (kindTouched) return;
    setNewKind(pieceOnly ? "single" : guessInventoryUnitKind(newName));
  }, [newName, kindTouched, pieceOnly]);

  function handleSelect(next: string) {
    if (next === ADD_UNIT_VALUE) {
      setNewName("");
      setKindTouched(false);
      setNewKind("single");
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
      const created = await createUnit.mutateAsync({ business_id: businessId, name, kind: newKind });
      onChange(created.name);
      setAddOpen(false);
      setNewName("");
    } catch (e) {
      setAddError(inventoryUnitSaveError(e));
    }
  }

  const addOption = canManage ? (
    <option value={ADD_UNIT_VALUE}>+ הוסף יחידה חדשה</option>
  ) : null;

  return (
    <>
      <Select className={className} value={value} onChange={(e) => handleSelect(e.target.value)}>
        {options.map((u) => (
          <option key={u.id} value={u.name}>
            {u.name}
          </option>
        ))}
        {addOption}
      </Select>

      <Modal
        open={addOpen}
        onClose={() => !createUnit.isPending && setAddOpen(false)}
        title="יחידת מידה חדשה"
        subtitle="יחידה שתופיע בכל מוצרי העסק"
        icon="straighten"
        maxWidth={460}
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
            placeholder="לדוגמה: בקבוק, מארז, גרם"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitNewUnit();
              }
            }}
          />
        </label>

        {!pieceOnly && (
          <div className="mt-4 flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-text-2">איך היחידה מתנהגת?</span>
            <div className="grid gap-2">
              {UNIT_KINDS.map((k) => {
                const active = newKind === k.value;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => {
                      setKindTouched(true);
                      setNewKind(k.value);
                    }}
                    aria-pressed={active}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-right transition-colors ${
                      active
                        ? "border-accent bg-accent-tint text-text"
                        : "border-border bg-surface hover:bg-surface-2"
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 flex-none place-items-center rounded-lg ${
                        active ? "bg-accent text-white" : "bg-surface-2 text-text-3"
                      }`}
                      aria-hidden
                    >
                      <Icon name={k.icon} size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold">{k.label}</span>
                      <span className="block text-[12px] text-text-3">{k.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
