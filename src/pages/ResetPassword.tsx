import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { usePageMobileChrome } from "@/hooks/useMobileChrome";
import { Icon, Spinner } from "@/components/ui";
import { EASE_OUT } from "@/components/motion/shared-motion";
import { BlurText } from "@/components/bits";
import { AuthScene } from "@/components/auth/AuthScene";

/** 0..4 — length, mixed case, digits, symbols. Only drives the meter. */
function strength(pw: string) {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
const STRENGTH_LABEL = ["", "חלשה", "סבירה", "טובה", "חזקה"];

export function ResetPassword() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  /* Same always-dark stage as the login screen. */
  usePageMobileChrome("authInk", "dark");

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

  const score = strength(password);

  return (
    <AuthScene>
      <motion.div
        className="lg-card rb-glow"
        initial={reduce ? false : { opacity: 0, y: 30, scale: 0.96, filter: "blur(14px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.9, delay: 0.15, ease: EASE_OUT }}
      >
        <div className="lg-card-sheen" aria-hidden />
        <div className="lg-card-head">
          <BlurText as="h2" text="סיסמה חדשה" className="lg-card-title" delay={0.3} />
        </div>

        {done ? (
          <div className="lg-alert lg-alert--ok" role="status">
            <Icon name="check_circle" size={20} />
            הסיסמה עודכנה! מעבירים אתכם להתחברות…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="lg-form">
            <div className="lg-field">
              <input
                id="reset-password"
                className="lg-input"
                type="password"
                required
                autoComplete="new-password"
                placeholder=" "
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label className="lg-label" htmlFor="reset-password">
                סיסמה חדשה
              </label>
              <Icon name="lock" size={19} className="lg-field-icon" />
              <span className="lg-field-ring" aria-hidden />
            </div>

            <div className="lg-meter" data-score={score} aria-hidden={!password}>
              {[1, 2, 3, 4].map((n) => (
                <i key={n} data-on={score >= n || undefined} />
              ))}
              <span>{password ? STRENGTH_LABEL[score] || "קצרה מדי" : "לפחות 6 תווים"}</span>
            </div>

            <div className="lg-field">
              <input
                id="reset-confirm"
                className="lg-input"
                type="password"
                required
                autoComplete="new-password"
                placeholder=" "
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <label className="lg-label" htmlFor="reset-confirm">
                אימות סיסמה
              </label>
              <Icon
                name={confirm && confirm === password ? "check_circle" : "verified_user"}
                size={19}
                className="lg-field-icon"
              />
              <span className="lg-field-ring" aria-hidden />
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  key={error}
                  role="alert"
                  className="lg-alert lg-alert--error lg-shake"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                >
                  <Icon name="error" size={18} /> {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="lg-submit-wrap">
              <button type="submit" className="lg-submit" data-spark data-busy={loading || undefined} disabled={loading}>
                <span className="lg-submit-stars" aria-hidden />
                <span className="lg-submit-face">
                  {loading ? <Spinner size={19} /> : <Icon name="key" size={19} />}
                  <span className="lg-submit-label">עדכון סיסמה</span>
                </span>
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </AuthScene>
  );
}
