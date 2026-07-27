import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/ui";
import { useEvents } from "@/api/events";
import { daysUntilEvent, daysUntilLabel, parseEventDay } from "@/components/events/eventTime";
import {
  DailyTasksChecklist,
  tasksHeroSummary,
} from "@/components/tasks/DailyTasksChecklist";
import type { EventRecord, Task, TaskStatus } from "@/types/database";

type ChecklistVariant = "default" | "dashboard" | "employee";

type EventTaskGroup = {
  eventId: string;
  event: EventRecord | null;
  tasks: Task[];
};

function formatEventDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  return parseEventDay(dateStr).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function buildEventTaskGroups(tasks: Task[], eventsById: Map<string, EventRecord>): EventTaskGroup[] {
  const grouped = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.event_id) continue;
    const list = grouped.get(task.event_id) ?? [];
    list.push(task);
    grouped.set(task.event_id, list);
  }

  return [...grouped.entries()]
    .map(([eventId, groupTasks]) => ({
      eventId,
      event: eventsById.get(eventId) ?? null,
      tasks: groupTasks,
    }))
    .sort((a, b) => {
      const aDate = a.event?.event_date ?? "9999-12-31";
      const bDate = b.event?.event_date ?? "9999-12-31";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return (a.event?.title ?? "").localeCompare(b.event?.title ?? "", "he");
    });
}

export function EventTasksGroupedChecklist({
  tasks,
  businessId,
  onStatus,
  onMedia,
  variant = "employee",
  emptyTitle = "אין משימות אירוע פתוחות",
  emptyDescription = "כשישייכו אליך או למחלקה שלך משימות לאירוע — הן יופיעו כאן.",
}: {
  tasks: Task[];
  businessId: string;
  onStatus: (id: string, status: TaskStatus) => void;
  onMedia: (id: string, media_urls: string[]) => void;
  variant?: ChecklistVariant;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { data: events = [] } = useEvents(businessId);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e] as const)), [events]);
  const groups = useMemo(() => buildEventTaskGroups(tasks, eventsById), [tasks, eventsById]);

  const openCount = tasks.filter((t) => t.status === "open").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;

  if (tasks.length === 0) {
    return (
      <DailyTasksChecklist
        tasks={[]}
        businessId={businessId}
        onStatus={onStatus}
        onMedia={onMedia}
        variant={variant}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      />
    );
  }

  return (
    <section className="task-checklist">
      <header className="task-hero">
        <p className="task-hero__sub">{tasksHeroSummary(openCount, inProgressCount, tasks.length)}</p>
      </header>

      <div className="event-task-groups">
        {groups.map((group) => {
          const eventDate = group.event?.event_date;
          const dateLabel = formatEventDate(eventDate);
          const daysLabel = eventDate ? daysUntilLabel(daysUntilEvent(eventDate)) : null;
          const openInGroup = group.tasks.filter((t) => t.status !== "done").length;

          return (
            <article key={group.eventId} className="event-task-group">
              <header className="event-task-group__head">
                <span className="event-task-group__icon" aria-hidden>
                  <Icon name="celebration" size={20} />
                </span>
                <div className="event-task-group__copy min-w-0 flex-1">
                  <h3 className="event-task-group__title">{group.event?.title ?? "אירוע"}</h3>
                  {(dateLabel || daysLabel) && (
                    <p className="event-task-group__meta">
                      {dateLabel}
                      {dateLabel && daysLabel && <span aria-hidden> · </span>}
                      {daysLabel && <span>{daysLabel}</span>}
                    </p>
                  )}
                </div>
                <span className="event-task-group__count">
                  {openInGroup > 0 ? `${openInGroup} פתוחות` : "הושלם"}
                </span>
                <Link
                  to={`/events/${group.eventId}`}
                  className="event-task-group__link press"
                  aria-label={`מעבר לפרטי ${group.event?.title ?? "האירוע"}`}
                  title="פרטי האירוע"
                >
                  <Icon name="chevron_left" size={20} />
                </Link>
              </header>

              <DailyTasksChecklist
                tasks={group.tasks}
                businessId={businessId}
                onStatus={onStatus}
                onMedia={onMedia}
                variant={variant}
                embedded
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
