import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { usePageMobileChrome } from "@/hooks/useMobileChrome";
import { Icon, Spinner } from "@/components/ui";
import { EASE_OUT } from "@/components/motion/shared-motion";
import { DecryptedText, useMagnet } from "@/components/bits";
import { AuthScene } from "@/components/auth/AuthScene";

export function Login() {
  const { signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  /* The auth stage is always dark — pin the dark status-bar chrome. */
  usePageMobileChrome("authInk", "dark");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [wipeAt, setWipeAt] = useState<{ x: number; y: number } | null>(null);

  const submitRef = useMagnet<HTMLButtonElement>(0.18, 60);

  function trackCaps(e: KeyboardEvent<HTMLInputElement>) {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  }

  function fail(message: string) {
    setError(message);
    setErrorKey((k) => k + 1);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      fail(error);
      return;
    }
    /* The success wipe grows out of the button that was pressed. */
    const r = submitRef.current?.getBoundingClientRect();
    setWipeAt(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setSuccess(true);
    window.setTimeout(() => navigate("/", { replace: true }), reduce ? 0 : 780);
  }

  async function handleReset() {
    if (!email.trim()) {
      fail("הזינו אימייל כדי לאפס סיסמה");
      return;
    }
    setError(null);
    const { error } = await resetPassword(email.trim());
    if (error) fail(error);
    else setResetSent(true);
  }

  const fadeUp = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.6, delay, ease: EASE_OUT },
        };

  return (
    <AuthScene>
      <motion.div
        className="lg-card rb-glow"
        data-success={success || undefined}
        initial={reduce ? false : { opacity: 0, y: 30, scale: 0.96, filter: "blur(14px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.9, delay: 0.15, ease: EASE_OUT }}
      >
        <div className="lg-card-sheen" aria-hidden />

        {/* Wrapper carries the entrance: motion's inline `filter` would
            otherwise wipe the wordmark's drop-shadow glow. */}
        <motion.div {...fadeUp(0.25)}>
          <h1 className="lg-wordmark">
            <DecryptedText text="AMI" delay={0.4} speed={55} />
          </h1>
        </motion.div>

        <form onSubmit={handleSubmit} className="lg-form">
          <motion.div className="lg-field" {...fadeUp(0.55)}>
            <input
              id="auth-email"
              className="lg-input"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder=" "
              dir="ltr"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
            <label className="lg-label" htmlFor="auth-email">
              דוא״ל
            </label>
            <Icon name="alternate_email" size={19} className="lg-field-icon" />
            <span className="lg-field-ring" aria-hidden />
          </motion.div>

          <motion.div {...fadeUp(0.62)}>
            <div className="lg-field">
              <input
                id="auth-password"
                className="lg-input lg-input--reveal"
                type={showPw ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder=" "
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                onKeyUp={trackCaps}
                onKeyDown={trackCaps}
                onBlur={() => setCapsOn(false)}
              />
              <label className="lg-label" htmlFor="auth-password">
                סיסמה
              </label>
              <Icon name="lock" size={19} className="lg-field-icon" />
              <span className="lg-field-ring" aria-hidden />
              <button
                type="button"
                className="lg-eye"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}
                data-spark="off"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={showPw ? "on" : "off"}
                    initial={reduce ? false : { opacity: 0, scale: 0.5, rotate: -30 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={reduce ? undefined : { opacity: 0, scale: 0.5, rotate: 30 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                    className="grid place-items-center"
                  >
                    <Icon name={showPw ? "visibility_off" : "visibility"} size={19} />
                  </motion.span>
                </AnimatePresence>
              </button>
            </div>

            <AnimatePresence>
              {capsOn && (
                <motion.div
                  className="lg-caps"
                  initial={reduce ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={reduce ? undefined : { opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                >
                  <Icon name="keyboard_capslock" size={15} />
                  Caps Lock מופעל
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Opacity-only: the `lg-shake` keyframes own `transform`. */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key={`err-${errorKey}`}
                role="alert"
                className="lg-alert lg-alert--error lg-shake"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.24, ease: EASE_OUT }}
              >
                <Icon name="error" size={18} />
                {error}
              </motion.div>
            )}
            {!error && resetSent && (
              <motion.div
                key="reset"
                role="status"
                className="lg-alert lg-alert--ok"
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: EASE_OUT }}
              >
                <Icon name="mark_email_read" size={18} />
                נשלח אימייל לאיפוס סיסמה
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div className="lg-row-between" {...fadeUp(0.68)}>
            <label className="lg-check">
              <input type="checkbox" defaultChecked />
              <span className="lg-check-box">
                <svg viewBox="0 0 24 24">
                  <path d="M4.5 12.5 10 18 19.5 6.5" />
                </svg>
              </span>
              זכור אותי
            </label>
            <button type="button" className="lg-link" onClick={handleReset}>
              שכחתי סיסמה
            </button>
          </motion.div>

          {/* Wrapper carries the entrance so motion never writes an inline
              transform on the button itself (magnet + press live in CSS). */}
          <motion.div className="lg-submit-wrap" {...fadeUp(0.74)}>
            <button
              ref={submitRef}
              type="submit"
              className="lg-submit"
              data-spark
              data-busy={loading || undefined}
              disabled={loading || success}
            >
              <span className="lg-submit-stars" aria-hidden />
              <span className="lg-submit-face">
                <AnimatePresence mode="wait" initial={false}>
                  {loading ? (
                    <motion.span
                      key="busy"
                      className="flex items-center gap-2"
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? undefined : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: EASE_OUT }}
                    >
                      <Spinner size={19} />
                      מתחברים…
                    </motion.span>
                  ) : (
                    <motion.span
                      key="idle"
                      className="flex items-center gap-2"
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? undefined : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: EASE_OUT }}
                    >
                      <span className="lg-submit-label">התחברות</span>
                      <Icon name="arrow_back" size={19} className="lg-submit-arrow" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </button>
          </motion.div>
        </form>

        <motion.div className="lg-note" {...fadeUp(0.82)}>
          <Icon name="support_agent" size={16} />
          אין לך חשבון? פנו למנהל העסק כדי לקבל גישה.
        </motion.div>
      </motion.div>

      {/* Success: a disc grows out of the button, then the route changes. */}
      {success && wipeAt && (
        <div className="lg-wipe" style={{ "--wx": `${wipeAt.x}px`, "--wy": `${wipeAt.y}px` } as React.CSSProperties}>
          <div className="lg-wipe-disc" />
          <div className="lg-wipe-check">
            <svg viewBox="0 0 52 52" aria-hidden>
              <circle cx="26" cy="26" r="24" />
              <path d="M15 27 L23 35 L38 18" />
            </svg>
            <span>מתחברים…</span>
          </div>
        </div>
      )}
    </AuthScene>
  );
}
