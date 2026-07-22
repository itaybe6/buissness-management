import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button, Icon } from "@/components/ui";

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("הסיסמה חייבת להכיל לפחות 6 תווים");
    if (password !== confirm) return setError("הסיסמאות אינן תואמות");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setError("לא ניתן לעדכן סיסמה. ייתכן שהקישור פג תוקף.");
    else {
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 1800);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg p-5">
      <div className="w-full max-w-[400px] rounded-[18px] border border-border bg-surface p-8 shadow-lg">
        <div className="mb-5 flex items-center gap-3">
          <div className="avatar-chip h-11 w-11 rounded-[12px]">
            <Icon name="lock_reset" size={24} />
          </div>
          <div>
            <div className="text-[19px] font-extrabold">איפוס סיסמה</div>
            <div className="text-[12.5px] text-text-3">בחרו סיסמה חדשה לחשבונכם</div>
          </div>
        </div>

        {done ? (
          <div className="flex items-center gap-2 rounded-[11px] [background:var(--success-bg)] px-3 py-3 text-[13.5px] font-semibold text-success">
            <Icon name="check_circle" size={20} />
            הסיסמה עודכנה! מעבירים אתכם להתחברות...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <label className="block">
              <span className="label-text">סיסמה חדשה</span>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="field mt-1.5" />
            </label>
            <label className="block">
              <span className="label-text">אימות סיסמה</span>
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field mt-1.5" />
            </label>
            {error && (
              <div className="flex items-center gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
                <Icon name="error" size={18} /> {error}
              </div>
            )}
            <Button type="submit" loading={loading} className="mt-1 w-full">
              עדכון סיסמה
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
