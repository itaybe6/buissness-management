import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";
import { EASE_OUT, SPRING } from "@/components/motion/shared-motion";
import { useAuth } from "@/lib/auth";
import { useBusinessId, colorForDepartment, initialsOf } from "@/lib/db";
import { birthdayAge, profilesWithBirthdayToday } from "@/lib/birthdays";
import { useProfiles } from "@/api/users";
import { useDepartments } from "@/api/departments";
import type { Profile } from "@/types/database";

const CONFETTI_COLORS = ["#d97706", "#db2777", "#2563eb", "#16a34a", "#7c3aed", "#0891b2"] as const;

function ConfettiRain({ seed }: { seed: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: `${8 + ((seed * 17 + i * 23) % 84)}%`,
        delay: `${(i * 0.18) % 2.4}s`,
        duration: `${2.8 + (i % 4) * 0.35}s`,
        color: CONFETTI_COLORS[(seed + i) % CONFETTI_COLORS.length],
        size: 4 + (i % 3) * 2,
        rotate: (seed + i * 41) % 360,
      })),
    [seed],
  );

  return (
    <div className="tbday-confetti" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="tbday-confetti__bit"
          style={
            {
              "--left": p.left,
              "--delay": p.delay,
              "--dur": p.duration,
              "--color": p.color,
              "--size": `${p.size}px`,
              "--rot": `${p.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function BirthdayCard({
  profile,
  departmentName,
  departmentColor,
  isSelf,
  index,
}: {
  profile: Profile;
  departmentName: string | null;
  departmentColor: string | null;
  isSelf: boolean;
  index: number;
}) {
  const reduce = useReducedMotion();
  const age = profile.birth_date ? birthdayAge(profile.birth_date) : null;
  const avatarColor = colorForDepartment(profile.department_id, departmentColor);
  const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0] || "חבר/ה";
  const seed = profile.id.charCodeAt(0) + profile.id.charCodeAt(1);

  return (
    <motion.article
      className="tbday-card"
      data-self={isSelf || undefined}
      style={{ "--tbday-accent": isSelf ? "var(--accent)" : "#d97706" } as React.CSSProperties}
      initial={reduce ? false : { opacity: 0, transform: "translateY(18px) scale(0.97)" }}
      animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
      transition={{ ...SPRING, delay: index * 0.08 }}
      whileHover={reduce ? undefined : { transform: "translateY(-3px)" }}
    >
      <span className="tbday-card__texture" aria-hidden />
      <ConfettiRain seed={seed} />

      <div className="tbday-card__ribbon">
        <span className="tbday-card__ribbon-icon" aria-hidden>
          <Icon name={isSelf ? "stars" : "cake"} size={14} />
        </span>
        <span className="tbday-card__ribbon-text">
          {isSelf ? "היום שלך!" : "יום הולדת שמח"}
        </span>
        <span className="tbday-card__ribbon-shine" aria-hidden />
      </div>

      <div className="tbday-card__inner">
        <div className="tbday-card__visual">
          <span className="tbday-card__orbit" aria-hidden />
          <span className="tbday-card__orbit tbday-card__orbit--2" aria-hidden />

          <div className="tbday-card__avatar-frame">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="tbday-card__avatar" loading="lazy" />
            ) : (
              <span
                className="tbday-card__avatar tbday-card__avatar--initials"
                style={{ background: avatarColor }}
              >
                {initialsOf(profile.full_name)}
              </span>
            )}
          </div>

          {age != null && age > 0 && (
            <motion.span
              className="tbday-card__age"
              initial={reduce ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...SPRING, delay: 0.2 + index * 0.08 }}
            >
              <b>{age}</b>
              <i>שנים</i>
            </motion.span>
          )}

          <span className="tbday-card__cake-badge" aria-hidden>
            <Icon name="cake" size={16} />
          </span>
        </div>

        <div className="tbday-card__copy">
          <p className="tbday-card__wish">
            {isSelf ? "מזל טוב!" : "מאחלים ל"}
          </p>
          <h3 className="tbday-card__name">
            {isSelf ? firstName : profile.full_name ?? "עובד/ת"}
          </h3>
          <p className="tbday-card__sub">
            {isSelf
              ? "כל הצוות מאחל לך יום מלא בשמחה, אהבה, והרבה רגעים טובים."
              : age
                ? `חוגג/ת ${age} היום — בואו נאחל יום מושלם!`
                : "בואו נאחל יום מושלם!"}
          </p>

          <div className="tbday-card__meta">
            {departmentName && (
              <span className="tbday-card__dept">
                <span className="tbday-card__dept-dot" style={{ background: avatarColor }} aria-hidden />
                {departmentName}
              </span>
            )}
            <span className="tbday-card__today">
              <Icon name="celebration" size={13} />
              היום
            </span>
          </div>
        </div>
      </div>

      <div className="tbday-card__footer" aria-hidden>
        {["🎈", "🎉", "✨", "🎂", "🎈"].map((emoji, i) => (
          <span key={i} className="tbday-card__emoji" style={{ "--i": i } as React.CSSProperties}>
            {emoji}
          </span>
        ))}
      </div>
    </motion.article>
  );
}

/** Employees celebrating a birthday today — shown on home dashboards. */
export function TodayBirthdaysBanner() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: profiles = [] } = useProfiles(businessId);
  const { data: departments = [] } = useDepartments(businessId);
  const reduce = useReducedMotion();

  const deptById = useMemo(
    () => new Map(departments.map((d) => [d.id, d] as const)),
    [departments],
  );

  const birthdays = useMemo(() => profilesWithBirthdayToday(profiles), [profiles]);

  if (birthdays.length === 0) return null;

  return (
    <section
      className="tbday"
      aria-label={birthdays.length === 1 ? "יום הולדת היום" : "ימי הולדת היום"}
    >
      <motion.header
        className="tbday-head"
        initial={reduce ? false : { opacity: 0, transform: "translateY(6px)" }}
        animate={{ opacity: 1, transform: "translateY(0)" }}
        transition={{ duration: 0.28, ease: EASE_OUT }}
      >
        <span className="tbday-head__icon" aria-hidden>
          <Icon name="cake" size={16} />
        </span>
        <div>
          <p className="tbday-head__title">
            {birthdays.length === 1 ? "יום הולדת היום" : `${birthdays.length} חוגגים היום`}
          </p>
          <p className="tbday-head__sub">הגיע הזמן לאיחולים חמים</p>
        </div>
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
            />
          );
        })}
      </div>
    </section>
  );
}
