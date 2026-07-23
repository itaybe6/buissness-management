import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useAuth } from "@/lib/auth";
import { Icon, Spinner } from "@/components/ui";
import { EASE_OUT } from "@/components/motion/shared-motion";

const ROTATING = ["משמרות", "שכר", "מלאי", "תקלות", "נוכחות", "הסכמים"];

const FEATURES = [
  { icon: "calendar_month", label: "סידור עבודה" },
  { icon: "payments", label: "שכר ותלושים" },
  { icon: "inventory_2", label: "מלאי והזמנות" },
  { icon: "build", label: "תקלות ותחזוקה" },
  { icon: "fingerprint", label: "נוכחות בזמן אמת" },
  { icon: "description", label: "הסכמי העסקה" },
  { icon: "local_shipping", label: "ספקים" },
  { icon: "insights", label: "דוחות משמרת" },
];

const SPARK = [38, 62, 45, 88, 54, 72, 96];

function Marquee({ variant }: { variant: "brand" | "mobile" }) {
  return (
    <>
      {[0, 1].map((copy) => (
        <div className="auth-marquee-track" key={copy}>
          {FEATURES.map((f) => (
            <span className="auth-chip" key={f.label}>
              <Icon name={f.icon} size={variant === "brand" ? 16 : 15} />
              {f.label}
            </span>
          ))}
        </div>
      ))}
    </>
  );
}

export function Login() {
  const { signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  /* ── Pointer-driven ambience, scoped to the brand half ── */
  const brandRef = useRef<HTMLDivElement>(null);
  const px = useMotionValue(-1000);
  const py = useMotionValue(-1000);
  const spotX = useSpring(px, { stiffness: 90, damping: 22, mass: 0.6 });
  const spotY = useSpring(py, { stiffness: 90, damping: 22, mass: 0.6 });

  const tiltX = useSpring(0, { stiffness: 110, damping: 20 });
  const tiltY = useSpring(0, { stiffness: 110, damping: 20 });
  const rotateX = useTransform(tiltX, (v) => `${v}deg`);
  const rotateY = useTransform(tiltY, (v) => `${v}deg`);

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reduce || e.pointerType !== "mouse") return;
      const rect = brandRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      px.set(x);
      py.set(y);
      tiltX.set((0.5 - y / rect.height) * 10);
      tiltY.set((x / rect.width - 0.5) * 14);
    },
    [px, py, tiltX, tiltY, reduce]
  );

  const resetPointer = useCallback(() => {
    tiltX.set(0);
    tiltY.set(0);
  }, [tiltX, tiltY]);

  /* ── Rotating headline word ── */
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setWordIndex((i) => (i + 1) % ROTATING.length), 2200);
    return () => window.clearInterval(id);
  }, [reduce]);

  /* ── Payroll counter on the floating card ── */
  const payroll = useSpring(0, { stiffness: 46, damping: 22 });
  const payrollText = useTransform(payroll, (v) => `₪ ${Math.round(v).toLocaleString("he-IL")}`);
  useEffect(() => {
    if (reduce) {
      payroll.jump(48320);
      return;
    }
    const id = window.setTimeout(() => payroll.set(48320), 700);
    return () => window.clearTimeout(id);
  }, [payroll, reduce]);

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
    setSuccess(true);
    window.setTimeout(() => navigate("/", { replace: true }), reduce ? 0 : 620);
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
          transition: { duration: 0.55, delay, ease: EASE_OUT },
        };

  const fade = (delay: number, duration = 0.7) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration, delay, ease: EASE_OUT },
        };

  return (
    <div className="auth-root">
      <div className="auth-shell">
        {/* ══════════ Form half — sits on the app background ══════════ */}
        <div className="auth-pane auth-pane--form">
          <div className="auth-glow" aria-hidden>
            <div className="auth-glow-blob auth-glow-blob--a" />
            <div className="auth-glow-blob auth-glow-blob--b" />
            <div className="auth-glow-mesh" />
          </div>

          <motion.div
            className="auth-card"
            initial={reduce ? false : { opacity: 0, y: 26, scale: 0.97, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
          >
            {/* Mobile-only crest */}
            <div className="auth-crest">
              <motion.div className="auth-crest-mark" {...fadeUp(0.05)}>
                <Icon name="hub" size={25} />
              </motion.div>
              <motion.div className="text-center" {...fadeUp(0.1)}>
                <div className="auth-wordmark">AMI</div>
                <div className="auth-tagline">Business management platform</div>
              </motion.div>
            </div>

            <motion.h1 className="auth-title" {...fadeUp(0.14)}>
              ברוכים השבים
            </motion.h1>
            <motion.p className="auth-title-sub" {...fadeUp(0.19)}>
              התחברו כדי להמשיך לחשבון העסק שלכם.
            </motion.p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3.5">
              <motion.div className="auth-field" {...fadeUp(0.24)}>
                <input
                  id="auth-email"
                  className="auth-input"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder=" "
                  dir="ltr"
                  style={{ textAlign: "right" }}
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                />
                <label className="auth-label" htmlFor="auth-email">
                  דוא״ל
                </label>
                <Icon name="alternate_email" size={19} className="auth-field-icon" />
                <span className="auth-field-underline" aria-hidden />
              </motion.div>

              <motion.div {...fadeUp(0.29)}>
                <div className="auth-field">
                  <input
                    id="auth-password"
                    className="auth-input auth-input--reveal"
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
                  <label className="auth-label" htmlFor="auth-password">
                    סיסמה
                  </label>
                  <Icon name="lock" size={19} className="auth-field-icon" />
                  <span className="auth-field-underline" aria-hidden />
                  <button
                    type="button"
                    className="auth-eye"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={showPw ? "on" : "off"}
                        initial={reduce ? false : { opacity: 0, scale: 0.6, rotate: -25 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={reduce ? undefined : { opacity: 0, scale: 0.6, rotate: 25 }}
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
                      className="auth-caps"
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

              {/* The error alert animates opacity only — the `auth-shake`
                  keyframes own `transform` and would fight an inline y. */}
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    key={`err-${errorKey}`}
                    className="auth-alert auth-alert--error auth-shake"
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
                    className="auth-alert auth-alert--ok"
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

              <motion.div
                className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
                {...fadeUp(0.34)}
              >
                <label className="auth-check">
                  <input type="checkbox" defaultChecked />
                  <span className="auth-check-box">
                    <svg viewBox="0 0 24 24">
                      <path d="M4.5 12.5 10 18 19.5 6.5" />
                    </svg>
                  </span>
                  זכור אותי
                </label>
                <button type="button" className="auth-link" onClick={handleReset}>
                  שכחתי סיסמה
                </button>
              </motion.div>

              {/* The wrapper carries the entry animation so motion never
                  writes an inline transform onto the button — that would
                  override the `:active` press scale. */}
              <motion.div className="mt-1" {...fadeUp(0.39)}>
                <button
                  type="submit"
                  className="auth-submit"
                  data-busy={loading || undefined}
                  disabled={loading || success}
                >
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
                        התחברות
                        <Icon name="arrow_back" size={19} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </motion.div>
            </form>

            <motion.div className="auth-note" {...fadeUp(0.44)}>
              אין לך חשבון? פנו למנהל העסק כדי לקבל גישה.
            </motion.div>

            <motion.div className="auth-marquee auth-marquee--mobile" aria-hidden {...fadeUp(0.5)}>
              <Marquee variant="mobile" />
            </motion.div>
          </motion.div>
        </div>

        {/* ══════════ Brand half — dark ink canvas (desktop) ══════════ */}
        <div
          className="auth-pane auth-pane--brand"
          ref={brandRef}
          onPointerMove={handlePointer}
          onPointerLeave={resetPointer}
        >
          <div className="auth-backdrop" aria-hidden>
            <div className="auth-aurora auth-aurora--a" />
            <div className="auth-aurora auth-aurora--b" />
            <div className="auth-aurora auth-aurora--c" />
            <div className="auth-mesh" />
            <div className="auth-sweep" />
            {!reduce && <motion.div className="auth-spotlight" style={{ x: spotX, y: spotY }} />}
            <div className="auth-grain" />
          </div>

          <motion.div className="auth-logo" {...fadeUp(0.06)}>
            <div className="auth-logo-mark">
              <Icon name="hub" size={26} />
            </div>
            <div>
              <div className="auth-wordmark">AMI</div>
              <div className="auth-tagline">Business management platform</div>
            </div>
          </motion.div>

          <div className="auth-brand-body">
            <h2 className="auth-headline">
              <motion.span className="block" {...fadeUp(0.14)}>
                ניהול
              </motion.span>
              {/* No blur filter here — it would break background-clip:text. */}
              <motion.span
                className="auth-rotator"
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.2, ease: EASE_OUT }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={ROTATING[wordIndex]}
                    className="auth-rotator-word"
                    initial={reduce ? false : { y: "105%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    exit={reduce ? undefined : { y: "-105%", opacity: 0 }}
                    transition={{ duration: 0.5, ease: EASE_OUT }}
                  >
                    {ROTATING[wordIndex]}
                  </motion.span>
                </AnimatePresence>
              </motion.span>
              <motion.span className="block" {...fadeUp(0.26)}>
                במקום אחד.
              </motion.span>
            </h2>

            <motion.p className="auth-sub" {...fadeUp(0.32)}>
              משמרות, שכר, מלאי, תקלות, הסכמים ונוכחות — לכל תפקיד בעסק המסך שמתאים לו בדיוק,
              בכל מכשיר.
            </motion.p>

            {/* Floating product cards with pointer-driven 3D tilt.
                Opacity-only entry: `fadeUp` would write an inline transform
                and clobber the responsive scale in the stylesheet. */}
            <motion.div className="auth-stage" aria-hidden {...fade(0.4)}>
              <motion.div
                className="auth-stage-inner"
                style={reduce ? undefined : { rotateX, rotateY }}
              >
                <div className="auth-card3d auth-card3d--shift">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="auth-card-label">משמרת ערב · שישי</div>
                      <div className="auth-card-value">18:00 — 24:00</div>
                    </div>
                    <span className="auth-card-glyph">
                      <Icon name="restaurant" size={17} />
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="auth-avatars">
                      {["ל", "ד", "נ", "ע"].map((c) => (
                        <span key={c}>{c}</span>
                      ))}
                    </div>
                    <span className="auth-card-meta">4 עובדים · מאויש</span>
                  </div>
                </div>

                <div className="auth-card3d auth-card3d--pay">
                  <div className="auth-card-label">שכר לתשלום · יולי</div>
                  <motion.div className="auth-card-value">{payrollText}</motion.div>
                  <div className="auth-spark">
                    {SPARK.map((h, i) => (
                      <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 0.13}s` }} />
                    ))}
                  </div>
                </div>

                <div className="auth-card3d auth-card3d--live">
                  <div className="flex items-center gap-2">
                    <span className="auth-live-dot" />
                    <span className="auth-card-label">נוכחות עכשיו</span>
                  </div>
                  <div className="auth-card-value">12 מחוברים</div>
                  <div className="auth-card-meta mt-1">2 החתימו כניסה כעת</div>
                </div>
              </motion.div>
            </motion.div>

            <motion.div className="auth-marquee auth-marquee--brand" aria-hidden {...fadeUp(0.48)}>
              <Marquee variant="brand" />
            </motion.div>
          </div>

          <motion.div className="auth-foot" {...fadeUp(0.54)}>
            © 2026 AMI · מערכת לניהול מסעדות, ברים ועסקי שירות
          </motion.div>
        </div>
      </div>

      {/* ── Success wipe: plays once, then the route changes ── */}
      {success && (
        <div className="auth-wipe">
          <div className="auth-wipe-disc" />
          <div className="auth-wipe-check">
            <Icon name="check_circle" size={54} />
          </div>
        </div>
      )}
    </div>
  );
}
