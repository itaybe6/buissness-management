import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT, SPRING } from "@/components/motion/shared-motion";
import { useAuth } from "@/lib/auth";
import { useBusinessId, colorForDepartment, initialsOf } from "@/lib/db";
import { birthdayAge, profilesWithBirthdayToday } from "@/lib/birthdays";
import { useProfiles } from "@/api/users";
import { useDepartments } from "@/api/departments";
import type { Profile } from "@/types/database";

const CONFETTI_COLORS = ["#bf7419", "#c2557b", "#3f72c4", "#3f9a72"] as const;

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

function CardDeco() {
  return (
    <span className="tbday-card__deco" aria-hidden>
      <svg viewBox="0 0 160 92" fill="none">
        <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="4 8">
          <path d="M-2 4c26 16 36 40 31 70" />
          <path d="M22-8c33 18 47 40 43 68" />
          <path d="M50-12c35 16 49 32 53 54" />
        </g>
        <g fill="currentColor">
          <circle cx="112" cy="16" r="2.2" />
          <circle cx="90" cy="58" r="1.5" />
          <circle cx="134" cy="41" r="1.9" />
          <circle cx="146" cy="12" r="1.4" />
        </g>
      </svg>
    </span>
  );
}

function Confetti({ seed }: { seed: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: i,
        left: `${6 + ((seed * 13 + i * 29) % 88)}%`,
        delay: `${((seed + i * 7) % 26) / 10}s`,
        duration: `${3.2 + (i % 4) * 0.45}s`,
        color: CONFETTI_COLORS[(seed + i) % CONFETTI_COLORS.length],
        width: 5 + (i % 3) * 3,
        rotate: (seed * 11 + i * 47) % 180,
      })),
    [seed],
  );

  return (
    <span className="tbday-confetti" aria-hidden>
      {bits.map((b) => (
        <span
          key={b.id}
          className="tbday-confetti__bit"
          style={
            {
              "--left": b.left,
              "--delay": b.delay,
              "--dur": b.duration,
              "--color": b.color,
              "--w": `${b.width}px`,
              "--rot": `${b.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
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
  const age = profile.birth_date ? birthdayAge(profile.birth_date) : 0;
  const avatarColor = colorForDepartment(profile.department_id, departmentColor);
  const fullName = profile.full_name?.trim() || "עובד/ת";
  const firstName = fullName.split(/\s+/)[0];
  const seed = (profile.id.charCodeAt(0) || 7) + (profile.id.charCodeAt(3) || 3);

  return (
    <motion.article
      className="tbday-card"
      data-self={isSelf || undefined}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: index * 0.07 }}
    >
      <CardDeco />
      {!reduce && <Confetti seed={seed} />}

      <div className="tbday-card__body">
        <div className="tbday-card__portrait">
          <span className="tbday-card__ring" aria-hidden />
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

          <span className="tbday-card__twinkle tbday-card__twinkle--a" aria-hidden>
            <SparkGlyph size={13} />
          </span>
          <span className="tbday-card__twinkle tbday-card__twinkle--b" aria-hidden>
            <SparkGlyph size={9} />
          </span>
        </div>

        <div className="tbday-card__copy">
          <p className="tbday-card__eyebrow">
            <SparkGlyph size={10} />
            {isSelf ? "יום הולדת שמח לך" : "חוגגים היום"}
          </p>

          <h3 className="tbday-card__name" title={fullName}>
            {isSelf ? firstName : fullName}
          </h3>

          <p className="tbday-card__msg">
            {isSelf
              ? "כל הצוות מאחל לך שנה מלאה בבריאות, בהצלחה והרבה רגעים טובים."
              : `אפשר לעצור לרגע ולאחל ל${firstName} מזל טוב.`}
          </p>

          <div className="tbday-card__chips">
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
          </div>
        </div>

        {age > 0 && (
          <div className="tbday-card__age" aria-hidden>
            <span className="tbday-card__age-num">{age}</span>
            <span className="tbday-card__age-label">שנים</span>
          </div>
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

  return (
    <section className="tbday" aria-label="ימי הולדת היום">
      <motion.header
        className="tbday-head"
        initial={reduce ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
      >
        <span className="tbday-head__mark">
          <CakeGlyph size={15} />
        </span>
        <span className="tbday-head__title">
          {birthdays.length === 1 ? "יום הולדת היום" : `${birthdays.length} ימי הולדת היום`}
        </span>
        <span className="tbday-head__rule" aria-hidden />
        <span className="tbday-head__date">{today}</span>
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
