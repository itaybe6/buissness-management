import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent } from "react";
import { Button, Field, Icon, Input, PageLoader } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/db";
import { ROLE_LABELS, WAGE_TYPE_LABELS } from "@/lib/constants";
import { uploadProfileAvatar, useUpdateProfile } from "@/api/users";
import { useDepartments } from "@/api/departments";
import type { Profile as ProfileType } from "@/types/database";

export function Profile() {
  const { profile, refresh } = useAuth();
  const { data: departments } = useDepartments(profile?.business_id ?? null);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [wageOpen, setWageOpen] = useState(false);

  const departmentName = useMemo(() => {
    if (!profile?.department_id || !departments) return null;
    return departments.find((d) => d.id === profile.department_id)?.name ?? null;
  }, [profile?.department_id, departments]);

  if (!profile) return <PageLoader />;

  return (
    <div className="profile-page animate-fadeUp">
      <ProfileHero
        profile={profile}
        departmentName={departmentName}
        onSaved={refresh}
        onEdit={() => setEditOpen(true)}
      />

      <div className="profile-body">
        <div className="profile-card">
          {profile.business_id && (
            <ProfileActionRow
              icon="payments"
              tone="accent"
              title="שכר"
              desc={wageSummary(profile)}
              onClick={() => setWageOpen(true)}
            />
          )}
          <ProfileActionRow
            icon="lock"
            tone="info"
            title="שינוי סיסמה"
            desc="עדכון סיסמת הכניסה לחשבון"
            onClick={() => setPasswordOpen(true)}
            last
          />
        </div>
      </div>

      <EditDetailsModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        profile={profile}
        onSaved={refresh}
      />

      <WageInfoModal open={wageOpen} onClose={() => setWageOpen(false)} profile={profile} />

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

function ProfileHero({
  profile,
  departmentName,
  onSaved,
  onEdit,
}: {
  profile: ProfileType;
  departmentName: string | null;
  onSaved: () => Promise<void>;
  onEdit: () => void;
}) {
  return (
    <header className="profile-hero">
      <div className="profile-hero-inner">
        <button
          type="button"
          className="profile-hero-edit"
          aria-label="עריכת פרטים אישיים"
          onClick={onEdit}
        >
          <Icon name="edit" size={20} />
        </button>

        <div className="profile-hero-user">
          <ProfileAvatarUpload profile={profile} onSaved={onSaved} size={76} />
          <div className="profile-hero-text">
            <span className="profile-hero-role">
              {ROLE_LABELS[profile.role]}
              {departmentName ? ` · ${departmentName}` : ""}
            </span>
            <h1 className="profile-hero-name">{profile.full_name ?? "משתמש"}</h1>
            {profile.email && (
              <p className="profile-hero-contact" dir="ltr">
                {profile.email}
              </p>
            )}
            {profile.phone && (
              <p className="profile-hero-contact" dir="ltr">
                {profile.phone}
              </p>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function wageSummary(profile: ProfileType): string {
  const wageType = profile.wage_type ?? "hourly";
  const rate = Number(profile.hourly_rate ?? 0);
  return `${WAGE_TYPE_LABELS[wageType]} · ${formatCurrency(rate)}`;
}

function ProfileActionRow({
  icon,
  tone = "accent",
  title,
  desc,
  onClick,
  last,
}: {
  icon: string;
  tone?: "accent" | "info";
  title: string;
  desc: string;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      className={`profile-action-row ${last ? "profile-action-row--last" : ""}`}
      onClick={onClick}
    >
      <span className="profile-action-row-icon" data-tone={tone}>
        <Icon name={icon} size={20} />
      </span>
      <span className="profile-action-row-text">
        <span className="profile-action-row-title">{title}</span>
        <span className="profile-action-row-desc">{desc}</span>
      </span>
      <Icon name="chevron_left" size={22} className="profile-action-row-chevron" />
    </button>
  );
}

function WageInfoModal({
  open,
  onClose,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: ProfileType;
}) {
  const wageType = profile.wage_type ?? "hourly";
  const isTips = wageType === "tips";
  const rate = Number(profile.hourly_rate ?? 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="שכר"
      subtitle="מודל התשלום והתעריף שלך"
      icon="payments"
      footer={
        <Button variant="secondary" onClick={onClose} className="flex-1">
          סגירה
        </Button>
      }
    >
      <div className="profile-wage-rows">
        <div className="profile-wage-row">
          <span className="profile-wage-label">סוג שכר</span>
          <span className="profile-wage-value">{WAGE_TYPE_LABELS[wageType]}</span>
        </div>
        <div className="profile-wage-row">
          <span className="profile-wage-label">{isTips ? "מינימום שעתי" : "שכר שעתי"}</span>
          <span className="profile-wage-value">{formatCurrency(rate)}</span>
        </div>
      </div>
      {isTips && (
        <p className="profile-wage-note">השכר מחושב מקופת הטיפים, עם רצפת מינימום זו לשעה.</p>
      )}
    </Modal>
  );
}

const ProfileAvatarUpload = forwardRef(function ProfileAvatarUpload(
  {
    profile,
    onSaved,
    size = 76,
  }: {
    profile: ProfileType;
    onSaved: () => Promise<void>;
    size?: number;
  },
  ref: React.ForwardedRef<{ openFilePicker: () => void }>,
) {
  const updateProfile = useUpdateProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    openFilePicker: () => fileRef.current?.click(),
  }));

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
    <div className="profile-avatar-wrap" style={{ width: size, height: size }}>
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
          <UserAvatar userId={profile.id} name={profile.full_name} size={size} rounded="circle" />
        )}
        <span className="profile-avatar-overlay">
          {uploading ? <Icon name="hourglass_top" size={20} /> : <Icon name="add_a_photo" size={20} />}
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
});

function EditDetailsModal({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: ProfileType;
  onSaved: () => Promise<void>;
}) {
  const updateProfile = useUpdateProfile();
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setError(null);
  }, [open, profile.full_name, profile.phone]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateProfile.mutateAsync({
        id: profile.id,
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בעדכון הפרטים");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="פרטים אישיים"
      subtitle="עדכון שם וטלפון"
      icon="person"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={updateProfile.isPending}>
            ביטול
          </Button>
          <Button
            type="submit"
            form="edit-details-form"
            loading={updateProfile.isPending}
            icon="save"
            className="flex-1"
          >
            שמירת פרטים
          </Button>
        </>
      }
    >
      <form id="edit-details-form" onSubmit={handleSubmit} className="profile-form">
        <Field label="שם מלא">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="טלפון">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-0000000"
            dir="ltr"
          />
        </Field>
        <Field label="אימייל">
          <Input value={profile.email ?? ""} disabled className="opacity-60" dir="ltr" />
        </Field>

        {error && (
          <div className="profile-feedback" data-ok="false">
            <Icon name="error" size={17} /> {error}
          </div>
        )}
      </form>
    </Modal>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirm("");
    setError(null);
    setDone(false);
  }, [open]);

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
      setTimeout(() => {
        setDone(false);
        onClose();
      }, 1200);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="שינוי סיסמה"
      subtitle="בחרו סיסמה חדשה וחזקה לחשבונכם"
      icon="lock"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            ביטול
          </Button>
          <button
            type="submit"
            form="change-password-form"
            disabled={loading}
            className="profile-action-btn flex-1"
          >
            {loading ? (
              <Icon name="hourglass_top" size={20} />
            ) : (
              <>
                <Icon name="lock_reset" size={20} />
                עדכון סיסמה
              </>
            )}
          </button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={handleSubmit} className="profile-form">
        <Field label="סיסמה חדשה">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="אימות סיסמה">
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
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
      </form>
    </Modal>
  );
}
