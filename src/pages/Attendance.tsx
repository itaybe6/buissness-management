import { useMemo, useState } from "react";
import { Card, Icon, PageHeader, PageLoader, ErrorState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ATTENDANCE_RADIUS_M } from "@/lib/constants";
import { useBusinessId, initialsOf, colorFor } from "@/lib/db";
import { useBusiness } from "@/api/businesses";
import { useProfiles } from "@/api/users";
import { useAttendanceToday, useClockIn, useClockOut } from "@/api/attendance";

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function Attendance() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: biz, isLoading, isError, refetch } = useBusiness(businessId);
  const { data: records } = useAttendanceToday(businessId);
  const { data: users } = useProfiles(businessId);
  const clockIn = useClockIn(businessId);
  const clockOut = useClockOut(businessId);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const userById = useMemo(() => {
    const m = new Map<string, { name: string | null; role: string }>();
    (users ?? []).forEach((u) => m.set(u.id, { name: u.full_name, role: u.role }));
    return m;
  }, [users]);

  if (isLoading) return <PageLoader />;
  if (isError || !biz) return <ErrorState onRetry={refetch} />;

  const myOpen = (records ?? []).find((r) => r.employee_id === profile?.id && r.clock_in && !r.clock_out);

  async function handleClock() {
    setStatus(null);
    if (!biz) return;
    if (myOpen) {
      await clockOut.mutateAsync(myOpen.id);
      return;
    }
    if (biz.location_lat == null || biz.location_lng == null) {
      setStatus({ ok: false, text: "מיקום העסק לא הוגדר. פנו למנהל." });
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const d = distanceM(pos.coords.latitude, pos.coords.longitude, biz.location_lat!, biz.location_lng!);
        const radius = ATTENDANCE_RADIUS_M;
        const within = d <= radius;
        if (!within) {
          setStatus({ ok: false, text: `אתם במרחק ${Math.round(d)} מ׳ — מחוץ לרדיוס המותר (${radius} מ׳)` });
          setBusy(false);
          return;
        }
        await clockIn.mutateAsync({
          business_id: businessId!,
          employee_id: profile!.id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          within_radius: within,
        });
        setStatus({ ok: true, text: `הוחתמה כניסה · במרחק ${Math.round(d)} מ׳ מהעסק` });
        setBusy(false);
      },
      () => {
        setStatus({ ok: false, text: "לא ניתן לקבל מיקום מהדפדפן" });
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <PageHeader title="שעון נוכחות" subtitle="החתמה מותנית במיקום ליד מקום העבודה" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-6 text-center">
          <div className="relative mx-auto mt-1.5 grid h-[200px] w-[200px] place-items-center rounded-full" style={{ background: "radial-gradient(circle,var(--accent-tint),transparent 70%)" }}>
            <div className="absolute inset-[30px] rounded-full border-2 border-dashed border-accent-2" />
            <div className="grid h-[84px] w-[84px] place-items-center rounded-full [background:var(--ink)] shadow-lg">
              <Icon name="location_on" size={40} className="text-accent" />
            </div>
          </div>
          {status && (
            <div className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold ${status.ok ? "text-success [background:var(--success-bg)]" : "text-danger [background:var(--danger-bg)]"}`}>
              <Icon name={status.ok ? "check_circle" : "error"} size={17} /> {status.text}
            </div>
          )}
          <div className="mt-2.5 text-[13px] text-text-3">{new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}</div>
          <button
            onClick={handleClock}
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[13px] py-4 text-[16px] font-extrabold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
            style={{ background: myOpen ? "var(--danger)" : "var(--accent)" }}
          >
            <Icon name={myOpen ? "logout" : "login"} size={22} /> {myOpen ? "החתמת יציאה" : "החתמת כניסה"}
          </button>
        </Card>

        <Card className="p-5">
          <div className="mb-3.5 text-[16px] font-bold">נוכחות היום</div>
          <div className="flex flex-col gap-2.5">
            {(records ?? []).length === 0 && <div className="py-6 text-center text-[13px] text-text-3">אין החתמות היום.</div>}
            {(records ?? []).map((r) => {
              const u = userById.get(r.employee_id);
              const open = r.clock_in && !r.clock_out;
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-[12px] border border-border p-2.5">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[13px] font-bold text-white" style={{ background: colorFor(r.employee_id) }}>{initialsOf(u?.name)}</span>
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-bold">{u?.name}</div></div>
                  <div className="text-left">
                    <div className="text-[13px] font-bold">
                      {r.clock_in ? new Date(r.clock_in).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      <span className="font-normal text-text-3"> → {r.clock_out ? new Date(r.clock_out).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "…"}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] font-bold" style={{ color: open ? "var(--success)" : "var(--text-3)" }}>{open ? "● במשמרת" : "יצא/ה"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
