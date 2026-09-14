import { useState } from "react";
import { Icon } from "@/components/ui";
import { EventRequestCard } from "@/components/events/EventRequestCard";
import { StaffingRequestModal } from "@/components/events/StaffingRequestModal";
import { SuppliesRequestModal } from "@/components/events/SuppliesRequestModal";
import { daysUntilEvent } from "@/components/events/eventTime";
import {
  useDeleteEventRequest,
  useEventRequests,
  useUpdateEventRequestLines,
  useUpdateEventRequestStatus,
} from "@/api/eventRequests";
import { EVENT_REQUEST_CREATE_ROLES, EVENT_REQUEST_HANDLER_ROLES } from "@/lib/constants";
import { EVENT_REQUEST_KIND_META } from "@/lib/eventRequests";
import type { EventRecord, EventRequestKind, UserRole } from "@/types/database";

/**
 * "What do I need from the manager for this event?" — staffing and supplies
 * requests. The event manager opens them here; the manager sees them here
 * and in the requests inbox, and moves them through treatment.
 */
export function EventRequestsPanel({
  businessId,
  event,
  profileId,
  role,
}: {
  businessId: string;
  event: EventRecord;
  profileId: string;
  role: UserRole;
}) {
  const canCreate = EVENT_REQUEST_CREATE_ROLES.includes(role);
  const canHandle = EVENT_REQUEST_HANDLER_ROLES.includes(role);
  const canView = canCreate || canHandle || role === "shift_manager" || role === "office_manager";

  const { data: requests = [], isLoading } = useEventRequests(canView ? businessId : null, {
    eventId: event.id,
  });
  const updateStatus = useUpdateEventRequestStatus(businessId);
  const updateLines = useUpdateEventRequestLines(businessId);
  const remove = useDeleteEventRequest(businessId);
  const [openKind, setOpenKind] = useState<EventRequestKind | null>(null);

  if (!canView || isLoading) return null;
  if (requests.length === 0 && !canCreate) return null;

  const openCount = requests.filter((r) => r.status !== "closed").length;
  const isPast = daysUntilEvent(event.event_date) < 0;

  return (
    <>
      <section className="evtd-section evrq" aria-label="בקשות לאירוע">
        <div className="evtd-tasks-head">
          <h2 className="evtd-label">
            <Icon name="outgoing_mail" size={15} />
            בקשות למנהל
          </h2>
          {requests.length > 0 && (
            <span className="evtd-tasks-count">
              {openCount > 0 ? `${openCount} ממתינות` : "הכול טופל"}
            </span>
          )}
        </div>

        {canCreate && (
          <div className="evrq-launch">
            {(["staffing", "supplies"] as EventRequestKind[]).map((kind) => {
              const meta = EVENT_REQUEST_KIND_META[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  className="evrq-launch-btn press"
                  data-kind={kind}
                  onClick={() => setOpenKind(kind)}
                >
                  <span className="evrq-launch-icon" aria-hidden>
                    <Icon name={meta.icon} size={20} />
                  </span>
                  <span className="evrq-launch-copy">
                    <span className="evrq-launch-title">{meta.verb}</span>
                    <span className="evrq-launch-sub">{meta.hint}</span>
                  </span>
                  <Icon name="add_circle" size={20} className="evrq-launch-go" />
                </button>
              );
            })}
          </div>
        )}

        {requests.length === 0 ? (
          canCreate && (
            <p className="evrq-empty">
              {isPast
                ? "לא נשלחו בקשות לאירוע זה."
                : "עוד לא נשלחו בקשות — כשתבקשו שיבוץ או מצרכים, המנהל יקבל התראה וזה יופיע כאן."}
            </p>
          )
        ) : (
          <div className="evrq-list">
            {requests.map((r) => (
              <EventRequestCard
                key={r.id}
                request={r}
                canHandle={canHandle}
                canDelete={canHandle || r.requested_by === profileId}
                onStatus={(id, status) => updateStatus.mutate({ id, status })}
                onLines={(id, lines, status) => updateLines.mutate({ id, lines, status })}
                onDelete={(id) => remove.mutate(id)}
              />
            ))}
          </div>
        )}
      </section>

      {canCreate && (
        <>
          <StaffingRequestModal
            open={openKind === "staffing"}
            onClose={() => setOpenKind(null)}
            businessId={businessId}
            event={event}
          />
          <SuppliesRequestModal
            open={openKind === "supplies"}
            onClose={() => setOpenKind(null)}
            businessId={businessId}
            event={event}
          />
        </>
      )}
    </>
  );
}
