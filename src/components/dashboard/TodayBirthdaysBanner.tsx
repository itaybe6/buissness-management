import { useEffect, useMemo, useState } from "react";
import {
  animate,
  motion,
  useReducedMotion,
  type Transition,
  type Variants,
} from "motion/react";
import { EASE_OUT, SPRING } from "@/components/motion/shared-motion";
import { useAuth } from "@/lib/auth";
import { useBusinessId, colorForDepartment, initialsOf } from "@/lib/db";
import { birthdayAge, profilesWithBirthdayToday } from "@/lib/birthdays";
import { useProfiles } from "@/api/users";
import { useDepartments } from "@/api/departments";
import type { Profile } from "@/types/database";

const CONFETTI_COLORS = ["#e8b45a", "#f5d08a", "#ffffff", "#7dd3fc", "#f472b6"] as const;

const HEAD_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.22 } },
};

const HEAD_ITEM: Variants = {
  hidden: { opacity: 0, y: 8, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.45, ease: EASE_OUT },
  },
};

const MARK_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.4, rotate: -24 },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { type: "spring", stiffness: 420, damping: 14 },
  },
};

const COPY_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.28 } },
};

const COPY_ITEM: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(5px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.42, ease: EASE_OUT },
  },
};

function CakeGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.2 20.6h15.6" />
      <path d="M5.9 20.6v-5.1a1.8 1.8 0 0 1 1.8-1.8h8.6a1.8 1.8 0 0 1 1.8 1.8v5.1" />
      <path d="M12 13.7V8.2" />
      <circle cx="12" cy="6.1" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SparkGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 1.6l1.75 7.15a1 1 0 0 0 .72.72L21.6 11.2a.85.85 0 0 1 0 1.6l-7.13 1.73a1 1 0 0 0-.72.72L12 22.4a.85.85 0 0 1-1.6 0L8.65 15.25a1 1 0 0 0-.72-.72L.8 12.8a.85.85 0 0 1 0-1.6l7.13-1.73a1 1 0 0 0 .72-.72Z" />
    </svg>
  );
}

type ConfettiPiece = {
  id: number;
  left: number;
  color: string;
  size: number;
  shape: "strip" | "dot" | "square";
  rotate: number;
  sway: number;
  duration: number;
  delay: number;
  repeatDelay: number;
};

function buildConfetti(seed: number, count: number): ConfettiPiece[] {
  const shapes: ConfettiPiece["shape"][] = ["strip", "dot", "square"];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: 4 + ((seed * 17 + i * 31) % 92),
    color: CONFETTI_COLORS[(seed + i * 3) % CONFETTI_COLORS.length],
    size: 3 + (i % 4) * 2,
    shape: shapes[(seed + i) % shapes.length],
    rotate: (seed * 13 + i * 53) % 360,
    sway: -18 + ((seed + i * 11) % 36),
    duration: 2.6 + (i % 5) * 0.55,
    delay: 0.05 + ((seed + i * 5) % 18) / 10,
    repeatDelay: 0.4 + (i % 4) * 0.35,
  }));
}

function ConfettiField({ seed, cardDelay }: { seed: number; cardDelay: number }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(() => buildConfetti(seed, 20), [seed]);

  if (reduce) return null;

  return (
    <span className="tbday-confetti" aria-hidden>
      <motion.span
        className="tbday-flash"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.85, 0], scale: [0.6, 1.35, 1.6] }}
        transition={{ duration: 0.9, delay: cardDelay + 0.08, ease: EASE_OUT }}
      />
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className={`tbday-confetti__bit tbday-confetti__bit--${p.shape}`}
          style={{
            left: `${p.left}%`,
            background: p.color,
            ["--w" as string]: `${p.size}px`,
          }}
          initial={{
            opacity: 0,
            y: -40,
            x: 0,
            rotate: p.rotate,
            scale: 0,
          }}
          animate={{
            opacity: [0, 1, 1, 0.8, 0],
            y: [-40, 10, 70, 130, 170],
            x: [0, p.sway * 0.4, p.sway, p.sway * 1.3],
            rotate: [p.rotate, p.rotate + 120, p.rotate + 280, p.rotate + 420],
            scale: [0, 1.15, 1, 0.75, 0.4],
          }}
          transition={
            {
              duration: p.duration,
              delay: cardDelay + p.delay,
              repeat: Infinity,
              repeatDelay: p.repeatDelay,
              ease: EASE_OUT,
            } satisfies Transition
          }
        />
      ))}
    </span>
  );
}

function FloatingSpark({
  className,
  size,
  delay,
}: {
  className: string;
  size: number;
  delay: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <span className={className} aria-hidden>
        <SparkGlyph size={size} />
      </span>
    );
  }

  return (
    <motion.span
      className={className}
      aria-hidden
      animate={{
        opacity: [0.2, 1, 0.2],
        scale: [0.75, 1.15, 0.75],
        y: [0, -5, 0],
        rotate: [0, 18, 0],
      }}
      transition={{
        duration: 2.8,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    >
      <SparkGlyph size={size} />
    </motion.span>
  );
}

function OrbitSpark({
  radius,
  duration,
  delay,
  size,
}: {
  radius: number;
  duration: number;
  delay: number;
  size: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <motion.span
      className="tbday-orbit-spark"
      style={{ width: radius * 2, height: radius * 2, ["--orbit-r" as string]: `${radius}px` }}
      animate={{ rotate: 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear", delay }}
      aria-hidden
    >
      <motion.span
        className="tbday-orbit-spark__dot"
        animate={{ scale: [0.85, 1.2, 0.85], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <SparkGlyph size={size} />
      </motion.span>
    </motion.span>
  );
}

function AgeReveal({ age, delay }: { age: number; delay: number }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? age : 0);

  useEffect(() => {
    if (reduce) {
      setDisplay(age);
      return;
    }
    setDisplay(0);
    const controls = animate(0, age, {
      duration: 1.15,
      delay,
      ease: EASE_OUT,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [age, delay, reduce]);

  return (
    <motion.span
      className="tbday-card__age-num"
      initial={reduce ? false : { opacity: 0, scale: 0.15, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 220, damping: 16, delay }}
    >
      {display}
    </motion.span>
  );
}

function BirthdayCard({
  profile,
  departmentName,
  departmentColor,
  isSelf,
  index,
  stacked,
}: {
  profile: Profile;
  departmentName: string | null;
  departmentColor: string | null;
  isSelf: boolean;
  index: number;
  stacked: boolean;
}) {
  const reduce = useReducedMotion();
  const age = profile.birth_date ? birthdayAge(profile.birth_date) : 0;
  const avatarColor = colorForDepartment(profile.department_id, departmentColor);
  const fullName = profile.full_name?.trim() || "עובד/ת";
  const firstName = fullName.split(/\s+/)[0];
  const seed = (profile.id.charCodeAt(0) || 7) + (profile.id.charCodeAt(3) || 3);
  const cardDelay = 0.12 + index * 0.1;

  return (
    <motion.article
      className="tbday-card"
      data-self={isSelf || undefined}
      data-stacked={stacked || undefined}
      initial={reduce ? false : { opacity: 0, y: 22, scale: 0.96, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.58, ease: EASE_OUT, delay: cardDelay }}
      whileHover={
        reduce
          ? undefined
          : {
              y: -4,
              scale: 1.008,
              transition: SPRING,
            }
      }
    >
      <ConfettiField seed={seed} cardDelay={cardDelay} />

      {!reduce && (
        <motion.span
          className="tbday-card__sweep"
          aria-hidden
          initial={{ x: "-130%", opacity: 0.75 }}
          animate={{ x: "230%", opacity: 0 }}
          transition={{ duration: 1.05, delay: cardDelay + 0.18, ease: EASE_OUT }}
        />
      )}

      <div className="tbday-card__body">
        <motion.div
          className="tbday-card__portrait"
          initial={reduce ? false : { scale: 0.55, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 20, delay: cardDelay + 0.1 }}
        >
          <span className="tbday-card__halo" aria-hidden />
          <motion.span
            className="tbday-card__ring"
            aria-hidden
            animate={
              reduce
                ? undefined
                : {
                    scale: [1, 1.06, 1],
                    opacity: [0.55, 1, 0.55],
                  }
            }
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="tbday-card__ring tbday-card__ring--outer" aria-hidden />

          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="tbday-card__avatar" loading="lazy" />
          ) : (
            <span
              className="tbday-card__avatar tbday-card__avatar--initials"
              style={{ background: avatarColor }}
              aria-hidden
            >
              {initialsOf(fullName)}
            </span>
          )}

          <OrbitSpark radius={38} duration={9} delay={0} size={8} />
          <OrbitSpark radius={46} duration={14} delay={0.4} size={6} />

          <FloatingSpark className="tbday-card__twinkle tbday-card__twinkle--a" size={13} delay={0} />
          <FloatingSpark className="tbday-card__twinkle tbday-card__twinkle--b" size={9} delay={1.2} />
        </motion.div>

        <motion.div
          className="tbday-card__copy"
          initial="hidden"
          animate="visible"
          variants={COPY_VARIANTS}
        >
          <motion.p className="tbday-card__eyebrow" variants={COPY_ITEM}>
            <SparkGlyph size={10} />
            {isSelf ? "יום הולדת שמח לך" : "חוגגים היום"}
          </motion.p>

          <motion.h3 className="tbday-card__name" title={fullName} variants={COPY_ITEM}>
            {isSelf ? firstName : fullName}
          </motion.h3>

          <motion.p className="tbday-card__msg" variants={COPY_ITEM}>
            {isSelf
              ? "כל הצוות מאחל לך שנה מלאה בבריאות, בהצלחה והרבה רגעים טובים."
              : `אפשר לעצור לרגע ולאחל ל${firstName} מזל טוב.`}
          </motion.p>

          <motion.div className="tbday-card__chips" variants={COPY_ITEM}>
            {departmentName && (
              <span className="tbday-card__chip">
                <span
                  className="tbday-card__chip-dot"
                  style={{ background: avatarColor }}
                  aria-hidden
                />
                {departmentName}
              </span>
            )}
            {age > 0 && <span className="tbday-card__chip tbday-card__chip--age">גיל {age}</span>}
          </motion.div>
        </motion.div>

        {age > 0 && (
          <motion.div
            className="tbday-card__age"
            aria-hidden
            initial={reduce ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT, delay: cardDelay + 0.32 }}
          >
            <AgeReveal age={age} delay={cardDelay + 0.38} />
            <motion.span
              className="tbday-card__age-label"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: cardDelay + 0.55 }}
            >
              שנים
            </motion.span>
          </motion.div>
        )}
      </div>
    </motion.article>
  );
}

/** Employees celebrating a birthday today — shown on the home dashboards. */
export function TodayBirthdaysBanner() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: profiles = [] } = useProfiles(businessId);
  const { data: departments = [] } = useDepartments(businessId);
  const reduce = useReducedMotion();

  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d] as const)), [departments]);
  const birthdays = useMemo(() => profilesWithBirthdayToday(profiles), [profiles]);

  if (birthdays.length === 0) return null;

  const today = new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long" });
  const stacked = birthdays.length > 1;

  return (
    <section className="tbday" aria-label="ימי הולדת היום">
      <motion.div
        className="tbday-shell"
        initial={reduce ? false : { opacity: 0, y: 32, scale: 0.93, filter: "blur(12px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.78, ease: EASE_OUT }}
      >
        <div className="tbday-fx" aria-hidden>
          <span className="tbday-aurora tbday-aurora--1" />
          <span className="tbday-aurora tbday-aurora--2" />
          <span className="tbday-grid" />
          <span className="tbday-grain" />
          {!reduce && <span className="tbday-shimmer" />}
        </div>

        <motion.header
          className="tbday-head"
          initial="hidden"
          animate="visible"
          variants={HEAD_VARIANTS}
        >
          <motion.span className="tbday-head__mark" variants={MARK_VARIANTS}>
            <motion.span
              animate={reduce ? undefined : { rotate: [0, -8, 8, -4, 0] }}
              transition={{ duration: 0.7, delay: 0.55, ease: EASE_OUT }}
            >
              <CakeGlyph size={15} />
            </motion.span>
          </motion.span>
          <motion.span className="tbday-head__title" variants={HEAD_ITEM}>
            {birthdays.length === 1 ? "יום הולדת היום" : `${birthdays.length} ימי הולדת היום`}
          </motion.span>
          <motion.span className="tbday-head__rule" variants={HEAD_ITEM} aria-hidden />
          <motion.span className="tbday-head__date" variants={HEAD_ITEM}>
            {today}
          </motion.span>
        </motion.header>

        <div className="tbday-list">
          {birthdays.map((p, i) => {
            const dept = p.department_id ? deptById.get(p.department_id) : null;
            return (
              <BirthdayCard
                key={p.id}
                profile={p}
                departmentName={dept?.name ?? null}
                departmentColor={dept?.color ?? null}
                isSelf={p.id === profile?.id}
                index={i}
                stacked={stacked}
              />
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}
