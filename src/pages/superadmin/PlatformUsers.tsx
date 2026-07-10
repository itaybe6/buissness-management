import { useMemo, useState } from "react";
import { Badge, Button, Card, Icon, Input, PageHeader, PageLoader, ErrorState } from "@/components/ui";
import { useProfiles } from "@/api/users";
import { useBusinesses } from "@/api/businesses";
import { AddUserModal } from "@/components/AddUserModal";
import { ROLE_LABELS } from "@/lib/constants";
import { colorFor, initialsOf } from "@/lib/db";
import type { UserRole } from "@/types/database";

const ROLES: UserRole[] = ["super_admin", "manager", "shift_manager", "office_manager", "employee", "maintenance"];

export function PlatformUsers() {
  const { data: users, isLoading, isError, refetch } = useProfiles();
  const { data: businesses } = useBusinesses();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const bizName = useMemo(() => {
    const m = new Map<string, string>();
    (businesses ?? []).forEach((b) => m.set(b.id, b.name));
    return m;
  }, [businesses]);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const filtered = (users ?? []).filter((u) =>
    (u.full_name ?? "").includes(search) || (u.email ?? "").includes(search)
  );

  return (
    <div className="w-full animate-fadeUp">
      <PageHeader
        title="משתמשים"
        subtitle={`${users?.length ?? 0} משתמשים בכל הפלטפורמה`}
        actions={<Button icon="person_add" onClick={() => setOpen(true)}>הוספת משתמש</Button>}
      />
      <div className="mb-4 max-w-[360px]">
        <div className="relative">
          <Icon name="search" size={19} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3" />
          <Input className="pr-10" placeholder="חיפוש משתמש..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[2fr_1.3fr_1.4fr_1.8fr] gap-2 border-b border-border bg-surface-2 px-5 py-3 text-[12px] font-bold text-text-3">
              <span>משתמש</span><span>תפקיד</span><span>עסק</span><span>אימייל</span>
            </div>
            {filtered.map((u) => (
              <div key={u.id} className="grid grid-cols-[2fr_1.3fr_1.4fr_1.8fr] items-center gap-2 border-b border-border-2 px-5 py-3 text-[13.5px] hover:bg-surface-2">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[13px] font-bold text-white" style={{ background: colorFor(u.id) }}>
                    {initialsOf(u.full_name)}
                  </span>
                  <span className="truncate font-bold">{u.full_name}</span>
                </span>
                <span><Badge tone="neutral">{ROLE_LABELS[u.role]}</Badge></span>
                <span className="text-text-2">{u.business_id ? bizName.get(u.business_id) ?? "—" : "פלטפורמה"}</span>
                <span className="truncate text-text-2" style={{ direction: "ltr", textAlign: "right" }}>{u.email}</span>
              </div>
            ))}
            {filtered.length === 0 && <div className="px-5 py-10 text-center text-text-2">לא נמצאו משתמשים.</div>}
          </div>
        </div>
      </Card>

      <AddUserModal open={open} onClose={() => setOpen(false)} businessId={null} businesses={businesses ?? []} roles={ROLES} />
    </div>
  );
}
