import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";

const TABS = [
  { key: "list" as const, to: "/events", label: "לוח אירועים", icon: "event" },
  { key: "ideas" as const, to: "/events/ideas", label: "רעיונות", icon: "lightbulb" },
];

export function EventsSubNav({ active }: { active: "list" | "ideas" }) {
  const reduce = useReducedMotion();

  return (
    <nav className="evt-subnav" aria-label="ניווט אירועים">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
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
          </Link>
        );
      })}
    </nav>
  );
}
