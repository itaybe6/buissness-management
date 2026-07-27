import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Icon,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  DailyTasksChecklist,
  STATUS_META,
  taskMedia,
} from "@/components/tasks/DailyTasksChecklist";
import {
  useAssignedEventTaskActions,
  useCreateTask,
  useDeleteTask,
  useEventTasks,
  notifyTaskAssigned,
} from "@/api/tasks";
import { useProfiles } from "@/api/users";
import { EVENT_TASK_CREATE_ROLES } from "@/lib/constants";
import type { EventRecord, Task, UserRole } from "@/types/database";

function AssigneePicker({
  users,
  value,
  onChange,
}: {
  users: { id: string; full_name: string | null }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      aria-label="שיוך לעובד"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      searchable
      searchPlaceholder="חיפוש עובד..."
    >
      <option value="">לא משויך</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.full_name || "ללא שם"}
        </option>
      ))}
    </Select>
  );
}

function EventTaskManageRow({
  task,
  assigneeName,
  onDelete,
}: {
  task: Task;
  assigneeName: string | null;
  onDelete: () => void;
}) {
  const meta = STATUS_META[task.status];
  const media = taskMedia(task);
  const done = task.status === "done";

  return (
    <div className="evtd-task-row" data-done={done || undefined}>
      <div className="evtd-task-row__main">
        <div className="evtd-task-row__title">{task.title}</div>
        <div className="evtd-task-row__meta">
          {assigneeName && (
            <>
              <span>{assigneeName}</span>
              <span aria-hidden>·</span>
            </>
          )}
          {task.due_date && (
            <>
              <span>{new Date(task.due_date).toLocaleDateString("he-IL")}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <Badge tone={meta.tone === "success" ? "success" : meta.tone === "warning" ? "warning" : "neutral"}>
            {meta.short}
          </Badge>
        </div>
        {task.description && <p className="evtd-task-row__desc">{task.description}</p>}
      </div>
      {media.length > 0 && (
        <div className="evtd-task-row__media">
          {media.slice(0, 3).map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="evtd-task-row__thumb">
              <img src={url} alt="" loading="lazy" />
            </a>
          ))}
          {media.length > 3 && <span className="evtd-task-row__media-more">+{media.length - 3}</span>}
        </div>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="evtd-task-row__delete"
        aria-label="מחיקת משימה"
      >
        <Icon name="delete" size={18} />
      </button>
    </div>
  );
}

export function EventTasksPanel({
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
  const canCreate = EVENT_TASK_CREATE_ROLES.includes(role);
  const { data: users = [] } = useProfiles(businessId);
  const { data: eventTasks = [], isLoading: tasksLoading } = useEventTasks(businessId, event.id);
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask(businessId);
  const {
    tasks: myEventTasks,
    setStatus,
    setMedia,
    isLoading: myTasksLoading,
  } = useAssignedEventTaskActions(businessId, event.id, profileId);

  const [addOpen, setAddOpen] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(event.event_date.slice(0, 10));
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const userById = useMemo(
    () => new Map(users.map((u) => [u.id, u.full_name ?? ""] as const)),
    [users],
  );

  const openCount = eventTasks.filter((t) => t.status !== "done").length;
  const doneCount = eventTasks.length - openCount;
  const showMyTasks = myEventTasks.length > 0;
  const previewAssignee = assignedTo
    ? users.find((u) => u.id === assignedTo)?.full_name || "העובד"
    : "ללא שיוך";
  const previewDue = dueDate
    ? new Date(dueDate + "T12:00:00").toLocaleDateString("he-IL")
    : "ללא תאריך יעד";

  function resetAddForm() {
    setAssignedTo("");
    setTitle("");
    setDescription("");
    setDueDate(event.event_date.slice(0, 10));
    setAddError(null);
  }

  function closeAddModal() {
    setAddOpen(false);
    resetAddForm();
  }

  async function handleAdd() {
    setAddError(null);
    if (!title.trim()) {
      setAddError("נא להזין שם משימה");
      return;
    }
    if (!assignedTo) {
      setAddError("נא לשייך עובד למשימה");
      return;
    }
    setSaving(true);
    try {
      const taskId = await createTask.mutateAsync({
        business_id: businessId,
        event_id: event.id,
        title: title.trim(),
        description: description.trim() || null,
        type: "one_time",
        assigned_to: assignedTo,
        assigned_by: profileId,
        due_date: dueDate || event.event_date.slice(0, 10),
      });
      notifyTaskAssigned(taskId);
      closeAddModal();
    } catch {
      setAddError("שמירת המשימה נכשלה. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  if (tasksLoading || myTasksLoading) return null;

  return (
    <>
      {canCreate && (
        <section className="evtd-section evtd-tasks">
          <div className="evtd-tasks-head">
            <h2 className="evtd-label">
              <Icon name="checklist" size={15} />
              משימות האירוע
            </h2>
            {eventTasks.length > 0 && (
              <span className="evtd-tasks-count">
                {openCount > 0 ? `${openCount} פתוחות` : "הכל בוצע"}
                {doneCount > 0 && openCount > 0 && ` · ${doneCount} הושלמו`}
              </span>
            )}
            <button type="button" className="evtd-tasks-add" onClick={() => setAddOpen(true)}>
              <Icon name="add" size={18} />
              הוספה
            </button>
          </div>

          {eventTasks.length === 0 ? (
            <EmptyState
              icon="checklist"
              title="אין משימות לאירוע זה"
              description="הוסיפו משימות ושייכו עובדים — הם יופיעו ברשימת המשימות שלהם ויוכלו לעדכן סטטוס ולהעלות תיעוד."
              action={
                <Button icon="add" onClick={() => setAddOpen(true)}>
                  הוספת משימה ראשונה
                </Button>
              }
            />
          ) : (
            <div className="evtd-tasks-list">
              {eventTasks.map((t) => (
                <EventTaskManageRow
                  key={t.id}
                  task={t}
                  assigneeName={t.assigned_to ? userById.get(t.assigned_to) ?? null : null}
                  onDelete={() => deleteTask.mutate(t.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {showMyTasks && (
        <section className="evtd-section evtd-tasks-my">
          <h2 className="evtd-label">
            <Icon name="assignment_ind" size={15} />
            המשימות שלי באירוע
          </h2>
          <DailyTasksChecklist
            tasks={myEventTasks}
            businessId={businessId}
            onStatus={setStatus}
            onMedia={setMedia}
            variant="employee"
            emptyTitle="אין משימות משויכות אליך באירוע זה"
            emptyDescription="כשישירו אליך משימות לאירוע — הן יופיעו כאן."
          />
        </section>
      )}

      <Modal
        open={addOpen}
        onClose={closeAddModal}
        title="הוספת משימה לאירוע"
        subtitle={`${event.title} · משויכת לעובד ומופיעה ברשימת המשימות שלו`}
        icon="checklist"
        maxWidth={560}
        footer={
          <>
            <Button variant="secondary" onClick={closeAddModal}>
              ביטול
            </Button>
            <Button className="flex-1" icon="add" loading={saving} onClick={handleAdd}>
              הוספת משימה
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="שם המשימה">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: סידור שולחנות, הכנת בר"
              autoFocus
            />
          </Field>

          <Field label="שיוך לעובד">
            <AssigneePicker users={users} value={assignedTo} onChange={setAssignedTo} />
          </Field>

          <Field label="תאריך יעד">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>

          <Field label="תיאור (אופציונלי)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="פרטים, הוראות ביצוע, דגשים…"
              rows={4}
              className="max-h-[240px] min-h-[96px] resize-y overflow-y-auto leading-relaxed"
            />
          </Field>

          <div className="ftp-preview">
            <Icon name="auto_awesome" size={18} />
            <span>
              המשימה תופיע אצל <b>{previewAssignee}</b> · <b>{previewDue}</b>
            </span>
          </div>

          {addError && <span className="text-[13px] font-semibold text-danger">{addError}</span>}
        </div>
      </Modal>
    </>
  );
}
