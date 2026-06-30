import { useState } from "react";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";
import { EASE_OUT, SPRING } from "@/components/motion/shared-motion";
import type { NavItem } from "@/lib/constants";

const MOBILE_PRIMARY = 4;

interface MobileBottomNavProps {
  items: NavItem[];
  currentKey: string;
}

export function MobileBottomNav({ items, currentKey }: MobileBottomNavProps) {
  const reduce = useReducedMotion();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = items.slice(0, MOBILE_PRIMARY);
  const overflow = items.slice(MOBILE_PRIMARY);
  const hasMore = overflow.length > 0;
  const moreActive = overflow.some((i) => i.key === currentKey);

  return (
    <>
      <nav
        className="mobile-nav fixed inset-x-0 bottom-0 z-40 md:hidden"
        aria-label="ניווט ראשי"
      >
        <div className="mobile-nav-inner mx-auto flex max-w-lg items-stretch justify-around px-2">
          {primary.map((item) => (
            <NavTab key={item.key} item={item} active={currentKey === item.key} reduce={!!reduce} />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={`mobile-nav-tab ${moreActive ? "mobile-nav-tab-active" : ""}`}
              aria-label="עוד אפשרויות"
              aria-expanded={moreOpen}
            >
              <Icon name="apps" size={22} />
              <span className="mobile-nav-label">עוד</span>
              {moreActive && !reduce && (
                <motion.span
                  layoutId="mobile-nav-pill"
                  className="mobile-nav-pill"
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                />
              )}
            </button>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.button
              type="button"
              aria-label="סגור תפריט"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[3px] md:hidden"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="תפריט נוסף"
              initial={reduce ? false : { opacity: 0, transform: "translateY(100%)" }}
              animate={{ opacity: 1, transform: "translateY(0)" }}
              exit={reduce ? undefined : { opacity: 0, transform: "translateY(100%)" }}
              transition={reduce ? undefined : { duration: 0.32, ease: EASE_OUT }}
              className="mobile-sheet fixed inset-x-0 bottom-0 z-[60] md:hidden"
            >
              <div className="mobile-sheet-handle" aria-hidden />
              <div className="px-5 pb-2 pt-1">
                <div className="mb-4 text-[15px] font-extrabold tracking-tight text-text">כל התפריט</div>
                <div className="grid grid-cols-4 gap-2">
                  {overflow.map((item, i) => {
                    const active = currentKey === item.key;
                    return (
                      <motion.div
                        key={item.key}
                        initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }}
                        animate={{ opacity: 1, transform: "translateY(0)" }}
                        transition={{ delay: reduce ? 0 : i * 0.04, duration: 0.22, ease: EASE_OUT }}
                      >
                        <NavLink
                          to={`/${item.key}`}
                          onClick={() => setMoreOpen(false)}
                          className={`mobile-sheet-item ${active ? "mobile-sheet-item-active" : ""}`}
                        >
                          <Icon name={item.icon} size={22} />
                          <span className="mobile-sheet-label">{item.label}</span>
                        </NavLink>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function NavTab({
  item,
  active,
  reduce,
}: {
  item: NavItem;
  active: boolean;
  reduce: boolean;
}) {
  return (
    <NavLink to={`/${item.key}`} className={`mobile-nav-tab ${active ? "mobile-nav-tab-active" : ""}`}>
      <motion.span
        whileTap={reduce ? undefined : { scale: 0.88 }}
        transition={SPRING}
        className="relative flex flex-col items-center gap-0.5"
      >
        <Icon name={item.icon} size={22} />
        <span className="mobile-nav-label">{item.label}</span>
      </motion.span>
      {active && !reduce && (
        <motion.span
          layoutId="mobile-nav-pill"
          className="mobile-nav-pill"
          transition={{ duration: 0.22, ease: EASE_OUT }}
        />
      )}
    </NavLink>
  );
}
