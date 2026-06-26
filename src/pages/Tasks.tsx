import { useMemo, useState } from "react";
import { Button, Card, EmptyState, Field, Icon, Input, PageHeader, PageLoader, ErrorState, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId, HE_DAYS, initialsOf, colorFor } from "@/lib/db";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/api/tasks";
import { useProfiles } from "@/api/users";
import type { TaskType } from "@/types/database";

export function Tasks() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: tasks, isLoading, isError, refetch } = useTasks(businessId);
  const { data: users } = useProfiles(businessId);
  const create = useCreateTask();
  const update = useUpdateTask(businessId);
  const del = useDeleteTask(businessId);
  const [tab, setTab] = useState<TaskType>("one_time");
  const [open, setOpen] = useState(false);

  const isManager = profile && ["manager", "department_manager", "shift_manager"].includes(profile.role);
  const userById = useMemo(() => {
    const m = new Map<string, string>();
    (users ?? []).forEach((u) => m.set(u.id, u.full_name ?? ""));
    return m;
  }, [users]);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  // employees see only their tasks; managers see all
  const visible = (tasks ?? []).filter((t) => (isManager ? true : t.assigned_to === profile?.id));
  const list = visible.filter((t) => t.type === tab);

  return (
    <div className="mx-auto max-w-[900px] animate-fadeUp">
      <PageHeader
        title="משימות"
        subtitle="חד-פעמיות וקבועות · משויכות בהיררכיה"
        actions={isManager ? <Button icon="add" onClick={() => setOpen(true)}>משימה חדשה</Button> : undefined}
      />

      <div className="mb-4 inline-flex gap-1 rounded-[12px] border border-border bg-surface-2 p-1">
        {([["one_time", "חד-פעמיות"], ["recurring", "קבועות"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-[10px] px-4 py-2 text-[14px] font-bold transition ${tab === k ? "text-white [background:var(--ink)]" : "text-text-2"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState icon="checklist" title="אין משימות" description={tab === "one_time" ? "אין משימות חד-פעמיות פתוחות." : "אין משימות קבועות."} />
      ) : (
        <Card className="overflow-hidden">
          {list.map((t) => {
            const done = t.status === "done";
            return (
              <div key={t.id} className="flex items-center gap-3.5 border-b border-border-2 px-4 py-3.5 last:border-0 hover:bg-surface-2">
                <button
                  onClick={() => update.mutate({ id: t.id, status: done ? "open" : "done", completed_at: done ? null : new Date().toISOString() })}
                >
                  <Icon name={done ? "check_circle" : "radio_button_unchecked"} size={24} style={{ color: done ? "var(--success)" : "var(--text-3)" }} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-[14.5px] font-semibold ${done ? "text-text-3 line-through" : ""}`}>{t.title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-text-3">
                    {t.assigned_to && (
                      <>
                        <span className="grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold text-white" style={{ background: colorFor(t.assigned_to) }}>{initialsOf(userById.get(t.assigned_to))}</span>
                        {userById.get(t.assigned_to)}
                        <span>·</span>
                      </>
                    )}
                    {t.type === "recurring" && t.recurrence_weekday != null ? `כל יום ${HE_DAYS[t.recurrence_weekday]}` : t.due_date ? new Date(t.due_date).toLocaleDateString("he-IL") : "ללא תאריך"}
                  </div>
                </div>
                {isManager && (
                  <button onClick={() => del.mutate(t.id)} className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:[background:var(--danger-bg)] hover:text-danger">
                    <Icon name="delete" size={19} />
                  </button>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {open && (
        <NewTaskModal
          users={users ?? []}
          defaultType={tab}
          onClose={() => setOpen(false)}
          saving={create.isPending}
          onSave={async (input) => {
            await create.mutateAsync({ business_id: businessId!, assigned_by: profile?.id, ...input });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NewTaskModal({
  users,
  defaultType,
  onClose,
  onSave,
  saving,
}: {
  users: { id: string; full_name: string | null }[];
  defaultType: TaskType;
  onClose: () => void;
  onSave: (input: { title: string; description: string | null; type: TaskType; assigned_to: string | null; due_date: string | null; recurrence_weekday: number | null }) => Promise<void>;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TaskType>(defaultType);
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [weekday, setWeekday] = useState("0");
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title="משימה חדשה"
      icon="add_task"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button
            className="flex-1"
            loading={saving}
            onClick={async () => {
              if (!title.trim()) return setError("נא להזין כותרת");
              await onSave({
                title: title.trim(),
                description: description || null,
                type,
                assigned_to: assignedTo || null,
                due_date: type === "one_time" ? dueDate || null : null,
                recurrence_weekday: type === "recurring" ? Number(weekday) : null,
              });
            }}
          >
            יצירת משימה
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="כותרת המשימה"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: ספירת מלאי בר" /></Field>
        <Field label="תיאור (אופציונלי)"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="h-20" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="שיוך ל-">
            <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">— לא משויך —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </Select>
          </Field>
          <Field label="סוג">
            <Select value={type} onChange={(e) => setType(e.target.value as TaskType)}>
              <option value="one_time">חד-פעמית</option>
              <option value="recurring">קבועה</option>
            </Select>
          </Field>
        </div>
        {type === "one_time" ? (
          <Field label="תאריך יעד"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        ) : (
          <Field label="חוזר ביום">
            <Select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
              {HE_DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </Select>
          </Field>
        )}
        {error && <div className="text-[13px] font-semibold text-danger">{error}</div>}
      </div>
    </Modal>
  );
}
