import { useMemo, useState } from "react";
import {
  Button,
  EmptyState,
  Field,
  Icon,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { DailyTasksChecklist } from "@/components/tasks/DailyTasksChecklist";
import {
  useCreateTask,
  useDeleteTask,
  useEventTaskListActions,
  notifyTaskAssigned,
} from "@/api/tasks";
import { useDepartments } from "@/api/departments";
import { useProfiles } from "@/api/users";
import { EVENT_TASK_CREATE_ROLES } from "@/lib/constants";
import type { Department, EventRecord, UserRole } from "@/types/database";

type AssignMode = "employee" | "department";

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
      <option value="">בחר עובד</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.full_name || "ללא שם"}
        </option>
      ))}
    </Select>
  );
}

function DepartmentPicker({
  departments,
  value,
  onChange,
}: {
  departments: Department[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select aria-label="מחלקה" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">בחר מחלקה</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </Select>
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
  const { data: departments = [] } = useDepartments(businessId);
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask(businessId);
  const myDeptId = users.find((u) => u.id === profileId)?.department_id ?? null;
  const {
    tasks: eventTaskList,
    setStatus,
    setMedia,
    isLoading: tasksLoading,
  } = useEventTaskListActions(businessId, event.id, profileId, myDeptId, canCreate);

  const [addOpen, setAddOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<AssignMode>("employee");
  const [assignedTo, setAssignedTo] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(event.event_date.slice(0, 10));
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const deptById = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name] as const)),
    [departments],
  );

  const deptEmployees = useMemo(
    () =>
      departmentId
        ? users.filter((u) => u.active && u.department_id === departmentId)
        : [],
    [users, departmentId],
  );

  const openCount = eventTaskList.filter((t) => t.status !== "done").length;
  const doneCount = eventTaskList.length - openCount;

  const previewTarget =
    assignMode === "department"
      ? departmentId
        ? `כל מחלקת ${deptById.get(departmentId) ?? "מחלקה"}`
        : "בחר מחלקה"
      : assignedTo
        ? users.find((u) => u.id === assignedTo)?.full_name || "העובד"
        : "בחר עובד";

  const previewDue = dueDate
    ? new Date(dueDate + "T12:00:00").toLocaleDateString("he-IL")
    : "ללא תאריך יעד";

  function resetAddForm() {
    setAssignMode("employee");
    setAssignedTo("");
    setDepartmentId("");
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

    const isDept = assignMode === "department";
    if (isDept ? !departmentId : !assignedTo) {
      setAddError(isDept ? "נא לבחור מחלקה" : "נא לשייך עובד למשימה");
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
        department_id: isDept ? departmentId : null,
        assigned_to: isDept ? null : assignedTo,
        assigned_by: profileId,
        due_date: dueDate || event.event_date.slice(0, 10),
      });
      if (!isDept) notifyTaskAssigned(taskId);
      closeAddModal();
    } catch {
      setAddError("שמירת המשימה נכשלה. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  if (tasksLoading) return null;

  if (eventTaskList.length === 0 && !canCreate) return null;

  return (
    <>
      <section className="evtd-section evtd-tasks">
        <div className="evtd-tasks-head">
          <h2 className="evtd-label">
            <Icon name="checklist" size={15} />
            משימות האירוע
          </h2>
          {eventTaskList.length > 0 && (
            <span className="evtd-tasks-count">
              {openCount > 0 ? `${openCount} פתוחות` : "הכל בוצע"}
              {doneCount > 0 && openCount > 0 && ` · ${doneCount} הושלמו`}
            </span>
          )}
          {canCreate && (
            <button type="button" className="evtd-tasks-add" onClick={() => setAddOpen(true)}>
              <Icon name="add" size={18} />
              הוספה
            </button>
          )}
        </div>

        {eventTaskList.length === 0 ? (
          <EmptyState
            icon="checklist"
            title="אין משימות לאירוע זה"
            description="הוסיפו משימות ושייכו עובדים או מחלקה — הם יופיעו ברשימת המשימות ויוכלו לעדכן סטטוס ולהעלות תיעוד."
            action={
              canCreate ? (
                <Button icon="add" onClick={() => setAddOpen(true)}>
                  הוספת משימה ראשונה
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DailyTasksChecklist
            tasks={eventTaskList}
            businessId={businessId}
            onStatus={setStatus}
            onMedia={setMedia}
            onDelete={canCreate ? (id) => deleteTask.mutate(id) : undefined}
            variant="employee"
            emptyTitle="אין משימות לאירוע זה"
            emptyDescription="כשישירו אליך משימות לאירוע — הן יופיעו כאן."
          />
        )}
      </section>

      {canCreate && (
        <Modal
          open={addOpen}
          onClose={closeAddModal}
          title="הוספת משימה לאירוע"
          subtitle={`${event.title} · שיוך לעובד או למחלקה`}
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

            <Field label="שיוך">
              <div className="mb-2.5 flex gap-1 rounded-[12px] border border-border bg-surface-2 p-1">
                {(
                  [
                    ["employee", "עובד", "person"],
                    ["department", "מחלקה", "groups"],
                  ] as const
                ).map(([mode, label, icon]) => (
                  <button
                    key={mode}
                    type="button"
                    data-active={assignMode === mode}
                    className="evtd-assign-seg press flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-2 text-[13px] font-bold"
                    onClick={() => {
                      setAssignMode(mode);
                      setAddError(null);
                    }}
                  >
                    <Icon name={icon} size={16} />
                    {label}
                  </button>
                ))}
              </div>
              {assignMode === "employee" ? (
                <AssigneePicker users={users} value={assignedTo} onChange={setAssignedTo} />
              ) : (
                <DepartmentPicker
                  departments={departments}
                  value={departmentId}
                  onChange={setDepartmentId}
                />
              )}
              {assignMode === "department" && departmentId && (
                <p className="mt-2 text-[12px] font-semibold text-text-2">
                  {deptEmployees.length > 0
                    ? `תיווצר משימה אחת לכל המחלקה — ${deptEmployees.length} עובדים יראו אותה, וסימון ביצוע סוגר אותה לכולם`
                    : "אין עובדים פעילים במחלקה זו — המשימה תופיע כשיצטרפו עובדים"}
                </p>
              )}
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
                המשימה תופיע אצל <b>{previewTarget}</b> · <b>{previewDue}</b>
              </span>
            </div>

            {addError && <span className="text-[13px] font-semibold text-danger">{addError}</span>}
          </div>
        </Modal>
      )}
    </>
  );
}
