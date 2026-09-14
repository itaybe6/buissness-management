import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EmployeeMultiPicker } from "@/components/events/EmployeeMultiPicker";
import { parseEventDay } from "@/components/events/eventTime";
import { useDepartments } from "@/api/departments";
import { useProfiles } from "@/api/users";
import { colorForDepartment } from "@/lib/db";
import {
  EVENT_REQUEST_KIND_META,
  EVENT_REQUEST_STATUS_META,
  formatQty,
  formatRequestWhen,
  requestProgress,
  staffingLines,
  statusFromLines,
  supplyLines,
} from "@/lib/eventRequests";
import type {
  EventRequest,
  EventRequestStatus,
  EventStaffingLine,
  EventSupplyLine,
  Profile,
} from "@/types/database";

type LinesHandler = (id: string, lines: EventRequest["lines"], status: EventRequestStatus) => void;

/* ------------------------------------------------------------------ *
 * Staffing: one line = one role with N slots
 * ------------------------------------------------------------------ */
function StaffingSlots({
  request,
  usersById,
  deptColor,
  canHandle,
  onPick,
  onRemove,
}: {
  request: EventRequest;
  usersById: Map<string, Profile>;
  deptColor: (id: string | null) => string;
  canHandle: boolean;
  onPick: (lineIndex: number) => void;
  onRemove: (lineIndex: number, employeeId: string) => void;
}) {
  const lines = staffingLines(request);
  return (
    <div className="evrq-slotlines">
      {lines.map((line, i) => {
        const assigned = (line.assigned ?? []).slice(0, line.count);
        const empty = Math.max(0, line.count - assigned.length);
        return (
          <div key={`${line.department_id ?? "free"}:${line.label}:${i}`} className="evrq-slotline">
            <div className="evrq-slotline-head">
              <span className="evrq-slotline-dot" style={{ background: deptColor(line.department_id) }} aria-hidden />
              <span className="evrq-slotline-name">{line.label}</span>
              <span className="evrq-slotline-count" data-full={empty === 0 || undefined}>
                {assigned.length}/{line.count}
              </span>
            </div>
            <div className="evrq-slots">
              {assigned.map((id) => {
                const u = usersById.get(id);
                return (
                  <span key={id} className="evrq-slot evrq-slot--filled">
                    <UserAvatar
                      userId={id}
                      name={u?.full_name}
                      avatarUrl={u?.avatar_url}
                      size={22}
                      rounded="circle"
                    />
                    <span className="evrq-slot-name">{u?.full_name ?? "עובד"}</span>
                    {canHandle && (
                      <button
                        type="button"
                        className="evrq-slot-x"
                        onClick={() => onRemove(i, id)}
                        aria-label={`הסרת ${u?.full_name ?? "העובד"} מהשיבוץ`}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    )}
                  </span>
                );
              })}
              {Array.from({ length: empty }, (_, k) =>
                canHandle ? (
                  <button
                    key={`empty-${k}`}
                    type="button"
                    className="evrq-slot evrq-slot--empty"
                    onClick={() => onPick(i)}
                  >
                    <Icon name="person_add" size={15} />
                    שיבוץ
                  </button>
                ) : (
                  <span key={`empty-${k}`} className="evrq-slot evrq-slot--empty" data-readonly>
                    <Icon name="person" size={15} />
                    טרם שובץ
                  </span>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Supplies: a checklist the manager ticks as things get bought
 * ------------------------------------------------------------------ */
function SupplyChecklist({
  request,
  canHandle,
  onToggle,
}: {
  request: EventRequest;
  canHandle: boolean;
  onToggle: (lineIndex: number) => void;
}) {
  const lines = supplyLines(request);
  return (
    <ul className="evrq-checklist">
      {lines.map((l, i) => {
        const Row = canHandle ? "button" : "div";
        return (
          <li key={`${l.item_id ?? "free"}:${l.name}:${i}`}>
            <Row
              {...(canHandle ? { type: "button" as const, onClick: () => onToggle(i), "aria-pressed": !!l.done } : {})}
              className="evrq-check-row"
              data-done={l.done || undefined}
            >
              <span className="evrq-check-box" aria-hidden>
                {l.done && <Icon name="check" size={14} />}
              </span>
              <span className="evrq-check-qty">{formatQty(l.quantity)}</span>
              <span className="evrq-check-name">{l.name}</span>
              {l.unit && <span className="evrq-check-unit">{l.unit}</span>}
              {!l.item_id && <span className="evrq-free-tag">חופשי</span>}
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
export function EventRequestCard({
  request,
  canHandle,
  canDelete,
  showEvent = false,
  from,
  onStatus,
  onLines,
  onDelete,
}: {
  request: EventRequest;
  /** Manager side — fills slots, ticks items, moves status. */
  canHandle: boolean;
  /** Requester / manager — can remove a request that is still open. */
  canDelete: boolean;
  /** Inbox view — link the card to its event. */
  showEvent?: boolean;
  /** Where the event link should return to. */
  from?: { path: string; label: string };
  onStatus?: (id: string, status: EventRequestStatus) => void;
  onLines?: LinesHandler;
  onDelete?: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickLine, setPickLine] = useState<number | null>(null);
  const [draft, setDraft] = useState<string[]>([]);

  const { data: users = [] } = useProfiles(request.business_id);
  const { data: departments = [] } = useDepartments(request.business_id);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d] as const)), [departments]);
  const deptColor = (id: string | null) => colorForDepartment(id, id ? deptById.get(id)?.color : null);

  const kind = EVENT_REQUEST_KIND_META[request.kind];
  const status = EVENT_REQUEST_STATUS_META[request.status];
  const progress = requestProgress(request);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const progressLabel =
    request.kind === "staffing"
      ? `${progress.done}/${progress.total} שובצו`
      : `${progress.done}/${progress.total} נקנו`;

  const eventDate = request.event?.event_date ? parseEventDay(request.event.event_date) : null;
  const eventWhen = eventDate
    ? eventDate.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "short" })
    : null;

  /* ---- staffing edits ---- */
  const assignable = useMemo(
    () => users.filter((u) => u.active && u.role !== "super_admin"),
    [users],
  );

  function commitLines(lines: EventRequest["lines"]) {
    onLines?.(request.id, lines, statusFromLines(request, lines));
  }

  function openPicker(lineIndex: number) {
    const line = staffingLines(request)[lineIndex];
    setDraft((line?.assigned ?? []).slice(0, line?.count ?? 0));
    setPickLine(lineIndex);
  }

  function savePicker() {
    if (pickLine == null) return;
    const lines = staffingLines(request).map((l, i): EventStaffingLine =>
      i === pickLine ? { ...l, assigned: draft.slice(0, l.count) } : l,
    );
    commitLines(lines);
    setPickLine(null);
  }

  function removeAssignee(lineIndex: number, employeeId: string) {
    const lines = staffingLines(request).map((l, i): EventStaffingLine =>
      i === lineIndex ? { ...l, assigned: (l.assigned ?? []).filter((id) => id !== employeeId) } : l,
    );
    commitLines(lines);
  }

  function toggleSupply(lineIndex: number) {
    const lines = supplyLines(request).map((l, i): EventSupplyLine =>
      i === lineIndex ? { ...l, done: !l.done } : l,
    );
    commitLines(lines);
  }

  const pickTarget = pickLine != null ? staffingLines(request)[pickLine] : null;
  const takenElsewhere = useMemo(() => {
    if (pickLine == null) return new Set<string>();
    return new Set(staffingLines(request).flatMap((l, i) => (i === pickLine ? [] : l.assigned ?? [])));
  }, [request, pickLine]);

  return (
    <article className="evrq-card" data-kind={request.kind} data-status={request.status}>
      <header className="evrq-card-head">
        <span className="evrq-kind-icon" aria-hidden>
          <Icon name={kind.icon} size={20} />
        </span>
        <div className="evrq-head-copy">
          <span className="evrq-kind">{kind.label}</span>
          <span className="evrq-head-meta">
            <UserAvatar
              userId={request.requested_by ?? request.id}
              name={request.requester?.full_name ?? "מנהלת אירועים"}
              avatarUrl={request.requester?.avatar_url ?? null}
              size={16}
              rounded="circle"
            />
            <span className="evrq-meta-name">{request.requester?.full_name ?? "מנהלת אירועים"}</span>
            <span className="evrq-meta-dot" aria-hidden>·</span>
            <span>{formatRequestWhen(request.created_at)}</span>
          </span>
        </div>
        <span className="evrq-status" data-tone={status.tone}>
          <Icon name={status.icon} size={13} />
          {status.label}
        </span>
      </header>

      {showEvent && request.event && (
        <Link
          to={`/events/${request.event_id}`}
          state={from ? { from: from.path, fromLabel: from.label } : undefined}
          className="evrq-event"
        >
          <Icon name="celebration" size={14} />
          <span className="evrq-event-title">{request.event.title}</span>
          {eventWhen && <span className="evrq-event-when">· {eventWhen}</span>}
          <Icon name="chevron_left" size={16} className="evrq-event-go" />
        </Link>
      )}

      {request.shift_label && (
        <p className="evrq-shift">
          <Icon name="schedule" size={14} />
          {request.shift_label}
        </p>
      )}

      {progress.total > 0 && (
        <div className="evrq-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className="evrq-progress-track" aria-hidden>
            <i className="evrq-progress-fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="evrq-progress-label" data-full={pct === 100 || undefined}>
            {progressLabel}
          </span>
        </div>
      )}

      {request.kind === "staffing" ? (
        <StaffingSlots
          request={request}
          usersById={usersById}
          deptColor={deptColor}
          canHandle={canHandle && !!onLines}
          onPick={openPicker}
          onRemove={removeAssignee}
        />
      ) : (
        <SupplyChecklist request={request} canHandle={canHandle && !!onLines} onToggle={toggleSupply} />
      )}

      {request.note && <p className="evrq-note">{request.note}</p>}

      {(canHandle || (canDelete && request.status === "open")) && (
        <footer className="evrq-actions">
          {canHandle && request.status !== "closed" && (
            <Button
              variant="secondary"
              icon="check"
              className="evrq-action"
              onClick={() => onStatus?.(request.id, "closed")}
            >
              סימון כטופל
            </Button>
          )}
          {canHandle && request.status === "closed" && (
            <>
              <span className="evrq-closed-by">
                <Icon name="check_circle" size={14} />
                טופל{request.status_updater?.full_name ? ` ע״י ${request.status_updater.full_name}` : ""}
              </span>
              <Button
                variant="ghost"
                icon="undo"
                className="evrq-action"
                onClick={() => onStatus?.(request.id, "open")}
              >
                פתיחה מחדש
              </Button>
            </>
          )}

          {canDelete && request.status === "open" && (
            confirmDelete ? (
              <span className="evrq-confirm">
                <span>למחוק?</span>
                <Button variant="danger" className="evrq-action" onClick={() => onDelete?.(request.id)}>
                  כן
                </Button>
                <Button variant="ghost" className="evrq-action" onClick={() => setConfirmDelete(false)}>
                  לא
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                icon="delete"
                className="evrq-action evrq-action--del"
                aria-label="מחיקת הבקשה"
                onClick={() => setConfirmDelete(true)}
              />
            )
          )}
        </footer>
      )}

      {canHandle && (
        <Modal
          open={pickLine != null && !!pickTarget}
          onClose={() => setPickLine(null)}
          title={`שיבוץ ${pickTarget?.label ?? ""}`}
          subtitle={
            pickTarget
              ? `${request.event?.title ?? "האירוע"}${request.shift_label ? ` · ${request.shift_label}` : ""} · ${pickTarget.count} ${pickTarget.count === 1 ? "מקום" : "מקומות"}`
              : undefined
          }
          icon="person_add"
          maxWidth={520}
          fullScreenMobile
          footer={
            <>
              <Button variant="secondary" onClick={() => setPickLine(null)}>
                ביטול
              </Button>
              <Button className="flex-1" icon="check" onClick={savePicker}>
                {draft.length > 0 ? `שיבוץ ${draft.length}/${pickTarget?.count ?? 0}` : "שמירה"}
              </Button>
            </>
          }
        >
          {pickTarget && (
            <div className="flex flex-col gap-3">
              <div className="evrq-pick-meter" data-full={draft.length >= pickTarget.count || undefined}>
                {Array.from({ length: pickTarget.count }, (_, k) => {
                  const id = draft[k];
                  const u = id ? usersById.get(id) : null;
                  return (
                    <span key={k} className="evrq-pick-seat" data-filled={!!id || undefined}>
                      {u ? (
                        <UserAvatar userId={u.id} name={u.full_name} avatarUrl={u.avatar_url} size={28} rounded="circle" />
                      ) : (
                        <Icon name="person" size={16} />
                      )}
                    </span>
                  );
                })}
                <span className="evrq-pick-meter-label">
                  {draft.length >= pickTarget.count
                    ? "כל המקומות מולאו"
                    : `נותרו ${pickTarget.count - draft.length} מקומות`}
                </span>
              </div>
              <EmployeeMultiPicker
                users={assignable}
                departments={departments}
                selected={draft}
                onChange={setDraft}
                max={pickTarget.count}
                priorityDepartmentId={pickTarget.department_id}
                takenIds={takenElsewhere}
              />
            </div>
          )}
        </Modal>
      )}
    </article>
  );
}
