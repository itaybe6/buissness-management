import { useEffect } from "react";

import { NavLink } from "react-router-dom";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Icon } from "@/components/ui";

import { UserAvatar } from "@/components/ui/UserAvatar";

import { EASE_OUT } from "@/components/motion/shared-motion";

import { ROLE_LABELS, groupNavItems } from "@/lib/constants";

import { NavItemBadge } from "@/components/layout/NavItemBadge";

import type { NavItem } from "@/lib/constants";

import type { UserRole } from "@/types/database";



interface MobileSideDrawerProps {

  open: boolean;

  onClose: () => void;

  items: NavItem[];

  currentKey: string;

  businessName?: string | null;

  userName?: string | null;

  userId?: string;

  avatarUrl?: string | null;

  role: UserRole;

  isSuperAdmin?: boolean;

  theme: "light" | "dark";

  onToggleTheme: () => void;

  onLogout: () => void;

  newFaultCount?: number;

}



export function MobileSideDrawer({

  open,

  onClose,

  items,

  currentKey,

  businessName,

  userName,

  userId,

  avatarUrl,

  role,

  isSuperAdmin = false,

  theme,

  onToggleTheme,

  onLogout,

  newFaultCount = 0,

}: MobileSideDrawerProps) {

  const reduce = useReducedMotion();
  const isProfileActive = currentKey === "profile";
  const navGroups = groupNavItems(items, { flat: role === "employee" });



  useEffect(() => {

    if (!open) return;

    function onKey(e: KeyboardEvent) {

      if (e.key === "Escape") onClose();

    }

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);

  }, [open, onClose]);



  useEffect(() => {

    if (!open) return;

    const prev = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {

      document.body.style.overflow = prev;

    };

  }, [open]);



  const navLinkClass = (key: string) => {

    const active = currentKey === key || (key === "dashboard" && currentKey === "");

    return `mobile-drawer-link ${active ? "mobile-drawer-link-active" : ""}`;

  };



  return (

    <AnimatePresence>

      {open && (

        <>

          <motion.button

            type="button"

            aria-label="סגור תפריט"

            initial={{ opacity: 0 }}

            animate={{ opacity: 1 }}

            exit={{ opacity: 0 }}

            transition={{ duration: 0.2, ease: EASE_OUT }}

            className="mobile-drawer-backdrop fixed inset-0 z-50 md:hidden"

            onClick={onClose}

          />

          <motion.aside

            role="dialog"

            aria-modal="true"

            aria-label="תפריט ניווט"

            initial={reduce ? false : { opacity: 0, transform: "translateX(100%)" }}

            animate={{ opacity: 1, transform: "translateX(0)" }}

            exit={reduce ? undefined : { opacity: 0, transform: "translateX(100%)" }}

            transition={reduce ? undefined : { duration: 0.28, ease: EASE_OUT }}

            className="mobile-drawer fixed top-0 z-[60] flex h-[100dvh] w-[min(288px,calc(100vw-48px))] flex-col md:hidden"

            style={{

              paddingTop: "var(--safe-top)",

              paddingBottom: "var(--safe-bottom)",

            }}

          >

            <div className="flex items-center justify-between gap-3 px-[18px] pb-3 pt-4">

              <div className="flex min-w-0 items-center gap-3">

                <div className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] [background:var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">

                  <Icon name="hub" size={22} className="text-white" />

                </div>

                <div className="min-w-0">

                  <div className="truncate text-[16px] font-extrabold tracking-tight text-white">

                    {businessName ?? "—"}

                  </div>

                </div>

              </div>

              <div className="flex flex-none items-center gap-2">

                <button

                  type="button"

                  onClick={onToggleTheme}

                  aria-label={theme === "light" ? "מצב כהה" : "מצב בהיר"}

                  className="btn-press grid h-9 w-9 place-items-center rounded-[10px] border border-white/[0.1] bg-white/[0.06] text-[#aeb4bf] transition-colors hover:bg-white/[0.1] hover:text-white"

                >

                  <Icon name={theme === "light" ? "dark_mode" : "light_mode"} size={20} />

                </button>

                <button

                  type="button"

                  onClick={onClose}

                  aria-label="סגור"

                  className="btn-press grid h-9 w-9 place-items-center rounded-[10px] border border-white/[0.1] bg-white/[0.06] text-[#aeb4bf] transition-colors hover:bg-white/[0.1] hover:text-white"

                >

                  <Icon name="close" size={20} />

                </button>

              </div>

            </div>



            <div className="px-3.5 pb-2">
              <NavLink
                to="/profile"
                onClick={onClose}
                className={`flex items-center gap-2.5 rounded-[12px] border border-white/[0.09] bg-white/[0.06] px-3 py-2.5 transition hover:bg-white/[0.1] ${isProfileActive ? "ring-1 ring-white/20" : ""}`}
                aria-current={isProfileActive ? "page" : undefined}
              >
                {userId ? (
                  <UserAvatar userId={userId} name={userName} avatarUrl={avatarUrl} size={30} rounded="square" />
                ) : (
                  <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] [background:var(--accent)]">
                    <Icon name={isSuperAdmin ? "apps" : "storefront"} size={18} className="text-white" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-white">{userName ?? "משתמש"}</div>
                  <div className="text-[11px] text-[#8b919c]">{ROLE_LABELS[role]}</div>
                </div>
              </NavLink>
            </div>



            <nav className="flex flex-1 flex-col gap-1 overflow-auto px-3 py-2" aria-label="ניווט ראשי">

              {navGroups.map((group) => (

                <div key={group.id} className="side-nav-group">

                  {group.label ? (

                    <div className="side-nav-group-label">{group.label}</div>

                  ) : null}

                  <div className="flex flex-col gap-0.5">

                    {group.items.map((item) => (

                      <NavLink

                        key={item.key}

                        to={`/${item.key}`}

                        onClick={onClose}

                        className={navLinkClass(item.key)}

                      >

                        <Icon name={item.icon} size={21} />

                        <span className="flex-1 text-right">{item.label}</span>

                        {role === "maintenance" && item.key === "faults" ? (
                          <NavItemBadge count={newFaultCount} className="mobile-drawer-badge" />
                        ) : null}

                      </NavLink>

                    ))}

                  </div>

                </div>

              ))}

            </nav>



            <div className="border-t border-white/[0.08] p-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="btn-press flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-right text-[14px] font-semibold text-[#aeb4bf] transition-colors hover:[background:var(--danger-bg)] hover:text-danger"
              >
                <Icon name="logout" size={21} />
                התנתקות
              </button>
            </div>

          </motion.aside>

        </>

      )}

    </AnimatePresence>

  );

}


