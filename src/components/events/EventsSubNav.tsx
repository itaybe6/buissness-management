import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";
import { useEventRequestBadgeCount } from "@/hooks/useEventRequestBadgeCount";

type TabKey = "list" | "ideas" | "requests";

const TABS: { key: TabKey; to: string; label: string; icon: string }[] = [
  { key: "list", to: "/events", label: "לוח אירועים", icon: "event" },
  { key: "ideas", to: "/events/ideas", label: "רעיונות", icon: "lightbulb" },
  { key: "requests", to: "/events/requests", label: "בקשות", icon: "outgoing_mail" },
];

export function EventsSubNav({
  active,
  variant = "plain",
}: {
  active: TabKey;
  /** `ink` = glass segmented control sitting on a dark hero. */
  variant?: "plain" | "ink";
}) {
  const reduce = useReducedMotion();
  const { count: requestBadge, isHandler } = useEventRequestBadgeCount();

  // The requests inbox is the manager's — everyone else keeps the two tabs.
  const tabs = TABS.filter((t) => t.key !== "requests" || isHandler);

  return (
    <nav className="evt-subnav" data-ink={variant === "ink" || undefined} aria-label="ניווט אירועים">
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        const badge = tab.key === "requests" && !isActive ? requestBadge : 0;
        return (
          <Link
            key={tab.key}
            to={tab.to}
            className="evt-subnav-link"
            data-active={isActive || undefined}
          >
            {isActive &&
              (reduce ? (
                <span className="evt-subnav-pill" aria-hidden />
              ) : (
                <motion.span
                  layoutId="evt-subnav-pill"
                  className="evt-subnav-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  aria-hidden
                />
              ))}
            <Icon name={tab.icon} size={17} />
            {tab.label}
            {badge > 0 && (
              <span className="evt-subnav-badge" aria-label={`${badge} חדשות`}>
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
