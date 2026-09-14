import { useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ROLE_LABELS } from "@/lib/constants";
import { colorForDepartment } from "@/lib/db";
import type { Department, Profile } from "@/types/database";

/** "דנה, יוסי ועוד 2" — the names on a preview line or a submit button. */
export function namesSummary(names: string[], max = 2): string {
  if (names.length === 0) return "";
  if (names.length <= max) return names.join(" ו־");
  return `${names.slice(0, max).join(", ")} ועוד ${names.length - max}`;
}

/**
 * Pick one or many employees. Grouped by department so "all the bartenders
 * on shift" is a couple of taps, searchable so a long staff list stays
 * usable on a phone.
 *
 * - `max` caps the selection (staffing slots); the picker greys out the rest.
 * - `priorityDepartmentId` floats that department to the top — the natural
 *   candidates for a "2 × בר" request are the bar staff.
 * - `takenIds` marks people already placed elsewhere on the same request.
 */
export function EmployeeMultiPicker({
  users,
  departments,
  selected,
  onChange,
  max,
  priorityDepartmentId,
  takenIds,
}: {
  users: Profile[];
  departments: Department[];
  selected: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  priorityDepartmentId?: string | null;
  takenIds?: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d] as const)), [departments]);
  const full = max != null && selected.length >= max;

  const normalized = query.trim().toLocaleLowerCase("he");
  const filtered = useMemo(
    () =>
      normalized
        ? users.filter((u) => (u.full_name ?? "").toLocaleLowerCase("he").includes(normalized))
        : users,
    [users, normalized],
  );

  /** Department groups in the business's own order; the priority department first; unassigned staff last. */
  const groups = useMemo(() => {
    const byDept = new Map<string, Profile[]>();
    for (const u of filtered) {
      const key = u.department_id && deptById.has(u.department_id) ? u.department_id : "__none__";
      const list = byDept.get(key);
      if (list) list.push(u);
      else byDept.set(key, [u]);
    }
    const ordered: { key: string; label: string; color: string | null; members: Profile[]; priority: boolean }[] = [];
    const orderedDepts = [...departments].sort((a, b) =>
      a.id === priorityDepartmentId ? -1 : b.id === priorityDepartmentId ? 1 : 0,
    );
    for (const d of orderedDepts) {
      const members = byDept.get(d.id);
      if (members?.length)
        ordered.push({ key: d.id, label: d.name, color: d.color, members, priority: d.id === priorityDepartmentId });
    }
    const rest = byDept.get("__none__");
    if (rest?.length) ordered.push({ key: "__none__", label: "ללא מחלקה", color: null, members: rest, priority: false });
    return ordered;
  }, [filtered, departments, deptById, priorityDepartmentId]);

  function toggle(id: string) {
    if (selectedSet.has(id)) return onChange(selected.filter((x) => x !== id));
    if (full) return;
    onChange([...selected, id]);
  }

  function toggleGroup(members: Profile[]) {
    const ids = members.map((m) => m.id).filter((id) => !takenIds?.has(id));
    const allIn = ids.every((id) => selectedSet.has(id));
    if (allIn) return onChange(selected.filter((id) => !ids.includes(id)));
    const next = [...new Set([...selected, ...ids])];
    onChange(max != null ? next.slice(0, max) : next);
  }

  const selectedUsers = selected
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is Profile => !!u);

  return (
    <div className="evtp-picker">
      {selectedUsers.length > 0 && (
        <div className="evtp-chips" aria-label="עובדים שנבחרו">
          {selectedUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              className="evtp-chip"
              onClick={() => toggle(u.id)}
              aria-label={`הסרת ${u.full_name ?? "עובד"}`}
            >
              <UserAvatar userId={u.id} name={u.full_name} avatarUrl={u.avatar_url} size={18} rounded="circle" />
              <span className="evtp-chip-name">{u.full_name || "ללא שם"}</span>
              <Icon name="close" size={14} />
            </button>
          ))}
          <button type="button" className="evtp-chip evtp-chip--clear" onClick={() => onChange([])}>
            ניקוי
          </button>
        </div>
      )}

      <div className="evrq-search">
        <Icon name="search" size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש עובד…"
          aria-label="חיפוש עובד"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="ניקוי חיפוש">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {users.length === 0 ? (
        <p className="evrq-hint">אין עובדים פעילים בעסק.</p>
      ) : groups.length === 0 ? (
        <p className="evrq-hint">לא נמצא עובד בשם ״{query.trim()}״.</p>
      ) : (
        <div className="evtp-groups" role="listbox" aria-multiselectable="true" aria-label="עובדים">
          {groups.map((g) => {
            const pickable = g.members.filter((m) => !takenIds?.has(m.id));
            const allIn = pickable.length > 0 && pickable.every((m) => selectedSet.has(m.id));
            const someIn = !allIn && pickable.some((m) => selectedSet.has(m.id));
            return (
              <section key={g.key} className="evtp-group" data-priority={g.priority || undefined}>
                <button
                  type="button"
                  className="evtp-group-head"
                  onClick={() => toggleGroup(g.members)}
                  aria-pressed={allIn}
                  title={allIn ? `הסרת כל ${g.label}` : `בחירת כל ${g.label}`}
                >
                  <span
                    className="evtp-group-dot"
                    style={{ background: colorForDepartment(g.key === "__none__" ? null : g.key, g.color) }}
                    aria-hidden
                  />
                  <span className="evtp-group-name">{g.label}</span>
                  {g.priority && <span className="evtp-group-tag">המחלקה המבוקשת</span>}
                  <span className="evtp-group-count">{g.members.length}</span>
                  {max == null && (
                    <span className="evtp-group-all" data-state={allIn ? "all" : someIn ? "some" : "none"}>
                      {allIn ? "הכול נבחר" : "בחירת כולם"}
                    </span>
                  )}
                </button>
                <ul className="evtp-list">
                  {g.members.map((u) => {
                    const on = selectedSet.has(u.id);
                    const taken = !on && !!takenIds?.has(u.id);
                    const blocked = taken || (!on && full);
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={on}
                          className="evtp-row"
                          data-on={on || undefined}
                          data-blocked={blocked || undefined}
                          disabled={taken}
                          onClick={() => toggle(u.id)}
                        >
                          <UserAvatar
                            userId={u.id}
                            name={u.full_name}
                            avatarUrl={u.avatar_url}
                            size={30}
                            rounded="circle"
                          />
                          <span className="evtp-row-copy">
                            <span className="evtp-row-name">{u.full_name || "ללא שם"}</span>
                            <span className="evtp-row-sub">
                              {taken ? "כבר שובץ/ה בבקשה זו" : ROLE_LABELS[u.role]}
                            </span>
                          </span>
                          <span className="evtp-check" aria-hidden>
                            {on && <Icon name="check" size={15} />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
