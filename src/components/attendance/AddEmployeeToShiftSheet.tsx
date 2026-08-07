import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useForceClockIn } from "@/api/attendance";
import { employeesAvailableToAddToShift, filterEmployeesBySearch } from "@/lib/addEmployeeToShift";
import { ROLE_LABELS } from "@/lib/constants";
import type { Department, Profile } from "@/types/database";

type EligibleEmployee = Pick<
  Profile,
  "id" | "full_name" | "role" | "active" | "department_id" | "avatar_url"
>;

export function AddEmployeeToShiftSheet({
  open,
  onClose,
  businessId,
  users,
  departments,
  onShiftEmployeeIds,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string | null;
  users: EligibleEmployee[];
  departments: Pick<Department, "id" | "name">[];
  onShiftEmployeeIds: Iterable<string>;
}) {
  const forceClockIn = useForceClockIn(businessId);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [successName, setSuccessName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const successTimer = useRef<number | null>(null);

  const deptNameById = useMemo(() => {
    const m = new Map<string, string>();
    departments.forEach((d) => m.set(d.id, d.name));
    return m;
  }, [departments]);

  const available = useMemo(
    () => employeesAvailableToAddToShift(users, onShiftEmployeeIds),
    [users, onShiftEmployeeIds],
  );

  const filtered = useMemo(
    () =>
      filterEmployeesBySearch(available, query, (e) => ROLE_LABELS[e.role] ?? e.role),
    [available, query],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPendingId(null);
      setSuccessName(null);
      setError(null);
      return;
    }
    const id = window.setTimeout(() => searchRef.current?.focus(), 280);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    return () => {
      if (successTimer.current != null) window.clearTimeout(successTimer.current);
    };
  }, []);

  async function handleAdd(employee: EligibleEmployee) {
    if (!businessId || pendingId) return;
    setError(null);
    setPendingId(employee.id);
    try {
      await forceClockIn.mutateAsync({
        business_id: businessId,
        employee_id: employee.id,
      });
      const name = employee.full_name?.trim() || "העובד/ת";
      setSuccessName(name);
      if (successTimer.current != null) window.clearTimeout(successTimer.current);
      successTimer.current = window.setTimeout(() => setSuccessName(null), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא הצלחנו להוסיף למשמרת");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="הוספה למשמרת"
      subtitle={`${available.length} לא במשמרת כרגע`}
      icon="person_add"
      maxWidth={440}
    >
      <div className="add-to-shift">
        <label className="add-to-shift__search">
          <Icon name="search" size={20} />
          <input
            ref={searchRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="חיפוש לפי שם…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="חיפוש עובדים"
          />
          {query && (
            <button
              type="button"
              className="add-to-shift__search-clear"
              aria-label="נקה חיפוש"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </label>

        {error && <p className="add-to-shift__error">{error}</p>}
        {successName && (
          <p className="add-to-shift__success" role="status">
            <Icon name="check_circle" size={18} />
            <span>{successName} נוסף/ה למשמרת</span>
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="add-to-shift__empty">
            <span className="add-to-shift__empty-icon" aria-hidden>
              <Icon name={query ? "search_off" : "group"} size={28} />
            </span>
            <p className="add-to-shift__empty-title">
              {query ? "אין תוצאות לחיפוש" : "כולם כבר במשמרת"}
            </p>
            <p className="add-to-shift__empty-hint">
              {query ? "נסו שם אחר או נקו את החיפוש" : "אין עובדים פנויים להוספה כרגע"}
            </p>
          </div>
        ) : (
          <ul className="add-to-shift__list" role="list">
            {filtered.map((employee, index) => {
              const dept =
                employee.department_id != null
                  ? deptNameById.get(employee.department_id)
                  : null;
              const roleLabel = ROLE_LABELS[employee.role] ?? employee.role;
              const meta = [dept, roleLabel].filter(Boolean).join(" · ");
              const busy = pendingId === employee.id;

              return (
                <li
                  key={employee.id}
                  className="add-to-shift__row-wrap"
                  style={{ ["--row-i" as string]: index } as React.CSSProperties}
                >
                  <button
                    type="button"
                    className="add-to-shift__row"
                    disabled={!!pendingId}
                    data-busy={busy}
                    onClick={() => handleAdd(employee)}
                    aria-label={`הוסף את ${employee.full_name ?? "עובד/ת"} למשמרת`}
                  >
                    <UserAvatar
                      userId={employee.id}
                      name={employee.full_name}
                      avatarUrl={employee.avatar_url}
                      size={44}
                      rounded="circle"
                    />
                    <span className="add-to-shift__row-copy">
                      <span className="add-to-shift__row-name">
                        {employee.full_name || "ללא שם"}
                      </span>
                      {meta && <span className="add-to-shift__row-meta">{meta}</span>}
                    </span>
                    <span className="add-to-shift__row-action" aria-hidden>
                      {busy ? (
                        <span className="add-to-shift__spinner" />
                      ) : (
                        <>
                          <Icon name="add" size={18} />
                          <span>הוסף</span>
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
