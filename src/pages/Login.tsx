import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { Icon, Spinner } from "@/components/ui";
import { EASE_OUT } from "@/components/motion/shared-motion";

export function Login() {
  const { signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) setError(error);
    else navigate("/", { replace: true });
  }

  async function handleReset() {
    if (!email.trim()) {
      setError("הזינו אימייל כדי לאפס סיסמה");
      return;
    }
    const { error } = await resetPassword(email.trim());
    if (error) setError(error);
    else setResetSent(true);
  }

  return (
    <div className="relative flex min-h-[100dvh] items-stretch overflow-hidden">
      {/* Brand panel — desktop */}
      <div
        className="relative hidden flex-1 flex-col justify-between overflow-hidden p-[60px] text-white md:flex"
        style={{ background: "linear-gradient(155deg,#251836,#0d0a16 80%)" }}
      >
        <div className="login-blob absolute -left-[90px] -top-[130px] h-[400px] w-[400px] rounded-full" style={{ background: "radial-gradient(circle,rgba(124,58,237,.18),transparent 70%)" }} />
        <div className="login-blob login-blob--slow absolute -bottom-[160px] -right-[80px] h-[340px] w-[340px] rounded-full bg-white/[0.04]" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-[46px] w-[46px] place-items-center avatar-chip rounded-[13px]">
            <Icon name="hub" size={26} className="text-white" />
          </div>
          <div>
            <div className="text-[21px] font-extrabold tracking-tight">AMI</div>
            <div className="-mt-px text-[12.5px] opacity-80">Business management platform</div>
          </div>
        </div>
        <div className="relative">
          <div className="max-w-[460px] text-[38px] font-extrabold leading-[1.18] tracking-tight">
            כל העסק שלך
            <br />
            במערכת אחת.
          </div>
          <div className="mt-[18px] max-w-[420px] text-[17px] leading-relaxed opacity-85">
            משמרות, שכר, מלאי, תקלות, הסכמים ונוכחות — לכל תפקיד המסך שמתאים לו בדיוק.
          </div>
          <div className="mt-[30px] flex flex-wrap gap-2.5">
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3.5 py-2 text-[13.5px] font-medium">
              <Icon name="verified_user" size={18} /> Multi-Tenant מאובטח
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3.5 py-2 text-[13.5px] font-medium">
              <Icon name="bolt" size={18} /> פעיל בכל מכשיר
            </span>
          </div>
        </div>
        <div className="relative text-[13px] opacity-70">© 2026 AMI · מערכת לניהול מסעדות, ברים ועסקי שירות</div>
      </div>

      {/* Form */}
      <div className="relative flex w-full flex-col items-center justify-center bg-surface px-5 py-8 sm:px-9 md:w-[clamp(360px,42%,560px)] md:flex-none">
        <div className="login-mesh md:hidden" aria-hidden>
          <div
            className="login-mesh-blob -right-16 -top-20 h-56 w-56 opacity-40"
            style={{ background: "radial-gradient(circle, rgba(124,58,237,0.35), transparent 70%)" }}
          />
          <div
            className="login-mesh-blob -bottom-24 -left-12 h-48 w-48 opacity-30"
            style={{ background: "radial-gradient(circle, rgba(109,40,217,0.25), transparent 70%)", animationDelay: "-3s" }}
          />
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, transform: "translateY(16px)" }}
          animate={{ opacity: 1, transform: "translateY(0)" }}
          transition={{ duration: 0.36, ease: EASE_OUT }}
          className="relative w-full max-w-[380px]"
        >
          <div className="mb-7 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-[11px] [background:var(--ink)]">
              <Icon name="hub" size={23} className="text-accent" />
            </div>
            <div className="text-[18px] font-extrabold">AMI</div>
          </div>
          <div className="text-[clamp(1.35rem,5vw,1.55rem)] font-extrabold tracking-tight">ברוכים השבים</div>
          <div className="mt-1.5 text-[14.5px] text-text-2">התחברו כדי להמשיך לחשבון העסק שלכם</div>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3.5">
            <label className="block">
              <span className="label-text">דוא״ל</span>
              <div className="relative mt-1.5">
                <Icon name="mail" size={19} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field pr-10"
                  style={{ direction: "ltr", textAlign: "right" }}
                  placeholder="name@business.co.il"
                />
              </div>
            </label>
            <label className="block">
              <span className="label-text">סיסמה</span>
              <div className="relative mt-1.5">
                <Icon name="lock" size={19} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3" />
                <input
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field pr-10 pl-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="btn-press absolute left-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2"
                  aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}
                >
                  <Icon name={showPw ? "visibility_off" : "visibility"} size={19} />
                </button>
              </div>
            </label>

            {error && (
              <motion.div
                initial={reduce ? false : { opacity: 0, transform: "translateY(4px)" }}
                animate={{ opacity: 1, transform: "translateY(0)" }}
                className="flex items-center gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger"
              >
                <Icon name="error" size={18} />
                {error}
              </motion.div>
            )}
            {resetSent && (
              <motion.div
                initial={reduce ? false : { opacity: 0, transform: "translateY(4px)" }}
                animate={{ opacity: 1, transform: "translateY(0)" }}
                className="flex items-center gap-2 rounded-[11px] [background:var(--success-bg)] px-3 py-2.5 text-[13px] font-semibold text-success"
              >
                <Icon name="mark_email_read" size={18} />
                נשלח אימייל לאיפוס סיסמה
              </motion.div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <label className="flex cursor-pointer items-center gap-1.5 text-text-2">
                <input type="checkbox" defaultChecked className="h-[15px] w-[15px]" style={{ accentColor: "var(--accent-2)" }} />
                זכור אותי
              </label>
              <button type="button" onClick={handleReset} className="font-semibold text-brand-700 hover:underline">
                שכחתי סיסמה
              </button>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
              className="ui-btn ui-btn--primary mt-1 flex w-full items-center justify-center gap-2 rounded-[11px] py-3.5 text-[15px] font-bold disabled:opacity-70"
            >
              {loading ? <Spinner size={20} /> : null}
              התחברות
            </motion.button>
          </form>

          <div className="mt-6 text-center text-[12.5px] text-text-3">
            אין לך חשבון? פנה למנהל העסק כדי לקבל גישה.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
