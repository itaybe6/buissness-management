import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button, Field, Icon, Input, PageLoader } from "@/components/ui";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useBusinessId, formatCurrency } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/constants";
import { uploadProfileAvatar, useUpdateProfile } from "@/api/users";
import { useAttendanceMonth } from "@/api/attendance";
import { useTips } from "@/api/payroll";
import { useDepartments } from "@/api/departments";
import type { Attendance, Profile as ProfileType } from "@/types/database";

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

function monthLabel(monthISO: string) {
  const d = new Date(`${monthISO}-01T12:00:00`);
  return d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

function shiftHours(a: Attendance): number {
  if (!a.clock_in || !a.clock_out) return 0;
  return (new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) / 3.6e6;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "short" });
}

const reveal = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export function Profile() {
  const { profile, refresh } = useAuth();
  const businessId = useBusinessId();
  const reduceMotion = useReducedMotion();
  const [month, setMonth] = useState(monthNow());

  const { data: attendance, isLoading: attendanceLoading } = useAttendanceMonth(businessId, month);
  const { data: tips } = useTips(businessId, month);
  const { data: departments } = useDepartments(businessId);

  const departmentName = useMemo(() => {
    if (!profile?.department_id || !departments) return null;
    return departments.find((d) => d.id === profile.department_id)?.name ?? null;
  }, [profile?.department_id, departments]);

  const myAttendance = useMemo(
    () =>
      (attendance ?? [])
        .filter((a) => a.employee_id === profile?.id && a.clock_in)
        .sort((a, b) => new Date(b.clock_in!).getTime() - new Date(a.clock_in!).getTime()),
    [attendance, profile?.id]
  );

  const payroll = useMemo(() => {
    const hours = myAttendance.filter((a) => a.clock_in && a.clock_out).reduce((sum, a) => sum + shiftHours(a), 0);
    const rate = Number(profile?.hourly_rate ?? 0);
    const base = hours * rate;
    const tipSum = (tips ?? []).filter((t) => t.employee_id === profile?.id).reduce((s, t) => s + Number(t.amount), 0);
    return { hours, rate, base, tips: tipSum, total: base + tipSum };
  }, [myAttendance, profile?.hourly_rate, profile?.id, tips]);

  const openShift = myAttendance.find((a) => !a.clock_out);
  const motionProps = reduceMotion
    ? {}
    : {
        initial: "hidden" as const,
        animate: "show" as const,
        variants: reveal,
        transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] as const },
      };

  if (!profile) return <PageLoader />;

  return (
    <div className="profile-page w-full animate-fadeUp">
      <motion.header className="page-hero profile-hero" {...motionProps}>
        <div className="profile-hero-glow" />
        <div className="page-hero-inner">
          <div className="profile-hero-main">
            <ProfileAvatarUpload profile={profile} onSaved={refresh} />
            <div className="min-w-0">
              <h1 className="page-hero-title">{profile.full_name ?? "משתמש"}</h1>
              <p className="page-hero-sub">
                {ROLE_LABELS[profile.role]}
                {departmentName ? ` · ${departmentName}` : ""}
              </p>
              <div className="profile-hero-meta">
                {profile.email && (
                  <span className="profile-meta-chip">
                    <Icon name="mail" size={15} />
                    <span dir="ltr">{profile.email}</span>
                  </span>
                )}
                {profile.phone && (
                  <span className="profile-meta-chip">
                    <Icon name="phone" size={15} />
                    <span dir="ltr">{profile.phone}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="page-hero-stats">
            {businessId && (
              <>
                <div className="page-hero-stat">
                  <Icon name="schedule" size={18} style={{ color: "var(--accent-2)" }} />
                  <span>
                    <strong>{payroll.hours.toFixed(1)}</strong> שעות
                  </span>
                </div>
                <div className="page-hero-stat profile-hero-stat--pay">
                  <Icon name="account_balance_wallet" size={18} style={{ color: "var(--accent-2)" }} />
                  <span>
                    <strong>{formatCurrency(payroll.total)}</strong> צפוי
                  </span>
                </div>
              </>
            )}
            {openShift && (
              <div className="page-hero-stat profile-hero-stat--live">
                <span className="profile-live-dot" />
                <span>במשמרת פעילה</span>
              </div>
            )}
          </div>
        </div>
      </motion.header>

      {businessId ? (
        <>
          <div className="profile-toolbar">
            <div>
              <h2 className="page-section-label">
                שעות ושכר
                <span>{monthLabel(month)}</span>
              </h2>
              <p className="profile-toolbar-desc">חישוב לפי נוכחות בפועל + טיפים</p>
            </div>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="profile-month-input"
            />
          </div>

          <motion.div
            className="profile-bento"
            {...(reduceMotion
              ? {}
              : {
                  initial: "hidden",
                  whileInView: "show",
                  viewport: { once: true, amount: 0.15 },
                  variants: { hidden: {}, show: { transition: { staggerChildren: 0.07 } } },
                })}
          >
            <ProfileStatCard
              reduceMotion={!!reduceMotion}
              hero
              icon="account_balance_wallet"
              label="שכר צפוי"
              value={formatCurrency(payroll.total)}
              sub={payroll.tips > 0 ? `כולל ${formatCurrency(payroll.tips)} טיפים` : undefined}
            />
            <ProfileStatCard reduceMotion={!!reduceMotion} icon="schedule" label="שעות החודש" value={payroll.hours.toFixed(1)} unit="שע׳" />
            <ProfileStatCard reduceMotion={!!reduceMotion} icon="payments" label="תעריף שעתי" value={formatCurrency(payroll.rate)} />
            <ProfileStatCard reduceMotion={!!reduceMotion} icon="account_balance" label="שכר בסיס" value={formatCurrency(payroll.base)} />
            <ProfileStatCard reduceMotion={!!reduceMotion} icon="savings" label="טיפים" value={formatCurrency(payroll.tips)} tone="tips" />
          </motion.div>

          <motion.section
            className="profile-shifts"
            {...(reduceMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 20 },
                  whileInView: { opacity: 1, y: 0 },
                  viewport: { once: true, amount: 0.1 },
                  transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] },
                })}
          >
            <div className="profile-shifts-head">
              <div className="profile-shifts-title">
                <Icon name="history" size={20} />
                רשימת משמרות
              </div>
              <span className="profile-shifts-count">{myAttendance.length} רשומות</span>
            </div>

            {attendanceLoading ? (
              <div className="profile-shifts-empty">טוען...</div>
            ) : myAttendance.length === 0 ? (
              <div className="profile-shifts-empty">
                <Icon name="event_busy" size={32} className="mb-2 opacity-40" />
                <div>אין רשומות נוכחות לחודש זה</div>
              </div>
            ) : (
              <div className="profile-shifts-list">
                {myAttendance.map((a, i) => {
                  const hrs = shiftHours(a);
                  const open = !a.clock_out;
                  const clockIn = a.clock_in!;
                  return (
                    <motion.div
                      key={a.id}
                      className="profile-shift-row"
                      data-open={open}
                      style={{ "--i": i } as React.CSSProperties}
                      {...(reduceMotion
                        ? {}
                        : {
                            initial: { opacity: 0, x: 12 },
                            whileInView: { opacity: 1, x: 0 },
                            viewport: { once: true, amount: 0.5 },
                            transition: { duration: 0.35, delay: Math.min(i * 0.04, 0.32), ease: [0.23, 1, 0.32, 1] },
                          })}
                    >
                      <div className="profile-shift-date">
                        <span className="profile-shift-day">{formatDate(clockIn)}</span>
                        <span className="profile-shift-time">
                          {formatTime(clockIn)} - {a.clock_out ? formatTime(a.clock_out) : "במשמרת"}
                        </span>
                      </div>
                      <div className="profile-shift-bar-wrap">
                        <div
                          className="profile-shift-bar"
                          style={{ width: open ? "100%" : `${Math.min(100, (hrs / 12) * 100)}%` }}
                        />
                      </div>
                      <div className="profile-shift-hours" data-open={open}>
                        {open ? "פעיל" : `${hrs.toFixed(1)} שע׳`}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.section>
        </>
      ) : (
        <motion.div
          className="profile-no-business"
          {...motionProps}
        >
          <Icon name="info" size={28} />
          <div>אין נתוני שעות ושכר. המשתמש לא משויך לעסק.</div>
        </motion.div>
      )}

      <div className="profile-forms">
        <EditDetailsCard profile={profile} onSaved={refresh} reduceMotion={!!reduceMotion} />
        <ChangePasswordCard reduceMotion={!!reduceMotion} />
      </div>
    </div>
  );
}

function ProfileAvatarUpload({
  profile,
  onSaved,
}: {
  profile: ProfileType;
  onSaved: () => Promise<void>;
}) {
  const updateProfile = useUpdateProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFileChange(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const avatar_url = await uploadProfileAvatar(profile.id, file);
      await updateProfile.mutateAsync({ id: profile.id, avatar_url });
      await onSaved();
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "שגיאה בהעלאת התמונה");
    } finally {
      setUploading(false);
    }
  }

  const displayUrl = preview ?? profile.avatar_url;

  return (
    <div className="profile-avatar-wrap">
      <div className="profile-avatar-ring" />
      <div className="profile-avatar-ring profile-avatar-ring--inner" />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="profile-avatar profile-avatar-btn"
        aria-label="העלאת תמונת פרופיל"
      >
        {displayUrl ? (
          <img src={displayUrl} alt={profile.full_name ?? "משתמש"} className="profile-avatar-img" />
        ) : (
          <UserAvatar userId={profile.id} name={profile.full_name} size={88} rounded="circle" />
        )}
        <span className="profile-avatar-overlay">
          {uploading ? <Icon name="hourglass_top" size={22} /> : <Icon name="add_a_photo" size={22} />}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          void handleFileChange(file);
          e.target.value = "";
        }}
      />
      {error && <p className="profile-avatar-error">{error}</p>}
    </div>
  );
}

function ProfileStatCard({
  icon,
  label,
  value,
  unit,
  sub,
  hero,
  tone,
  reduceMotion,
}: {
  icon: string;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  hero?: boolean;
  tone?: "tips";
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      className={`profile-stat-shell ${hero ? "profile-stat-shell--hero" : ""}`}
      variants={reduceMotion ? undefined : reveal}
    >
      <div className={`profile-stat-card ${hero ? "profile-stat-card--hero" : ""}`} data-tone={tone ?? "default"}>
        <div className="profile-stat-icon">
          <Icon name={icon} size={hero ? 26 : 20} />
        </div>
        <div className="profile-stat-value">
          {value}
          {unit && <span className="profile-stat-unit">{unit}</span>}
        </div>
        <div className="profile-stat-label">{label}</div>
        {sub && <div className="profile-stat-sub">{sub}</div>}
      </div>
    </motion.div>
  );
}

function ProfileSection({
  icon,
  tone = "accent",
  title,
  desc,
  children,
  reduceMotion,
}: {
  icon: string;
  tone?: "accent" | "info" | "success" | "warning";
  title: string;
  desc: string;
  children: ReactNode;
  reduceMotion: boolean;
}) {
  return (
    <motion.section
      className="settings-section profile-section"
      {...(reduceMotion
        ? {}
        : {
            initial: { opacity: 0, y: 18 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, amount: 0.2 },
            transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] },
          })}
    >
      <div className="settings-section-head">
        <div className="settings-section-icon" data-tone={tone}>
          <Icon name={icon} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="settings-section-title">{title}</h2>
          <p className="settings-section-desc">{desc}</p>
        </div>
      </div>
      <div className="settings-section-body">{children}</div>
    </motion.section>
  );
}

function EditDetailsCard({
  profile,
  onSaved,
  reduceMotion,
}: {
  profile: ProfileType;
  onSaved: () => Promise<void>;
  reduceMotion: boolean;
}) {
  const updateProfile = useUpdateProfile();
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await updateProfile.mutateAsync({ id: profile.id, full_name: fullName.trim() || null, phone: phone.trim() || null });
      await onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בעדכון הפרטים");
    }
  }

  return (
    <ProfileSection icon="person" title="פרטים אישיים" desc="עדכון שם וטלפון" reduceMotion={reduceMotion}>
      <form onSubmit={handleSubmit} className="profile-form">
        <Field label="שם מלא">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="טלפון">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-0000000" dir="ltr" />
        </Field>
        <Field label="אימייל">
          <Input value={profile.email ?? ""} disabled className="opacity-60" dir="ltr" />
        </Field>

        {error && (
          <div className="profile-feedback" data-ok="false">
            <Icon name="error" size={17} /> {error}
          </div>
        )}
        {saved && (
          <div className="profile-feedback" data-ok="true">
            <Icon name="check_circle" size={17} /> הפרטים נשמרו
          </div>
        )}

        <Button type="submit" loading={updateProfile.isPending} icon="save" className="profile-submit">
          שמירת פרטים
        </Button>
      </form>
    </ProfileSection>
  );
}

function ChangePasswordCard({ reduceMotion }: { reduceMotion: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (password.length < 6) return setError("הסיסמה חייבת להכיל לפחות 6 תווים");
    if (password !== confirm) return setError("הסיסמאות אינן תואמות");
    setLoading(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (authError) {
      setError("לא ניתן לעדכן סיסמה. נסו שוב.");
    } else {
      setPassword("");
      setConfirm("");
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    }
  }

  return (
    <ProfileSection icon="lock" tone="info" title="שינוי סיסמה" desc="בחרו סיסמה חדשה לחשבונכם" reduceMotion={reduceMotion}>
      <form onSubmit={handleSubmit} className="profile-form">
        <Field label="סיסמה חדשה">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Field label="אימות סיסמה">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </Field>

        {error && (
          <div className="profile-feedback" data-ok="false">
            <Icon name="error" size={17} /> {error}
          </div>
        )}
        {done && (
          <div className="profile-feedback" data-ok="true">
            <Icon name="check_circle" size={17} /> הסיסמה עודכנה בהצלחה
          </div>
        )}

        <Button type="submit" loading={loading} icon="lock_reset" variant="secondary" className="profile-submit">
          עדכון סיסמה
        </Button>
      </form>
    </ProfileSection>
  );
}
