import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useBusiness } from "@/api/businesses";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useTheme } from "@/lib/theme";
import { Icon } from "@/components/ui";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { MobileSideDrawer } from "@/components/layout/MobileSideDrawer";
import { EASE_OUT } from "@/components/motion/shared-motion";
import { NAV_ITEMS, ROLE_LABELS } from "@/lib/constants";
import type { NavItem } from "@/lib/constants";

function initialsOf(name: string | null | undefined) {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

export function AppShell() {
  const { profile, hasFeature, signOut } = useAuth();
  const businessId = useBusinessId();
  const { data: business } = useBusiness(businessId);
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const reduce = useReducedMotion();

  const role = profile?.role ?? "employee";
  const isEmployeeMobile = role === "employee";

  const navItems: NavItem[] = useMemo(() => {
    const seen = new Set<string>();
    return NAV_ITEMS.filter((item) => {
      if (!item.roles.includes(role)) return false;
      if (item.feature && !hasFeature(item.feature)) return false;
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    });
  }, [role, hasFeature]);

  const isSuperAdmin = role === "super_admin";
  const currentKey = location.pathname.replace(/^\//, "").split("/")[0] || "dashboard";
  const pageTitle = navItems.find((i) => i.key === currentKey)?.label ?? "אביחי";

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

<<<<<<< HEAD
  const isNavActive = (key: string) =>
    currentKey === key || (key === "dashboard" && currentKey === "");
=======
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const navLinkClass = (key: string) => {
    const active = currentKey === key || (key === "dashboard" && currentKey === "");
    return `flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[14.5px] transition-[background-color,color] duration-[160ms] [transition-timing-function:var(--ease-out)] ${
      active ? "font-bold text-white [background:var(--accent)]" : "font-medium text-[#aeb4bf] hover:bg-white/[0.07]"
    }`;
  };
>>>>>>> 0da8c298dcac68eaedd310a6b1341c8017f1354f

  return (
    <div className="flex min-h-[100dvh]">
      {/* Sidebar — desktop only */}
      <aside
        className="sticky top-0 hidden h-[100dvh] w-[var(--sw)] flex-none flex-col border-l border-white/[0.06] md:flex"
        style={{ background: "linear-gradient(178deg, var(--sidebar-plum), var(--sidebar-plum-deep))" }}
      >
        <div className="flex items-center gap-3 px-[18px] pb-4 pt-5">
<<<<<<< HEAD
          <div className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] avatar-chip">
=======
          <div className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] [background:var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
>>>>>>> 0da8c298dcac68eaedd310a6b1341c8017f1354f
            <Icon name="hub" size={22} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[16px] font-extrabold tracking-tight text-white">
              {isSuperAdmin ? "אביחי" : business?.name ?? "—"}
            </div>
            <div className="text-[11.5px] text-white/45">ניהול עסקים</div>
          </div>
        </div>

        <div className="px-3.5 pb-2">
          <div className="flex items-center gap-2.5 rounded-[12px] border border-white/[0.09] bg-white/[0.06] px-3 py-2.5">
            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] avatar-chip">
              <Icon name={isSuperAdmin ? "apps" : "storefront"} size={18} className="text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold text-white">
                {profile?.full_name ?? "משתמש"}
              </div>
              <div className="text-[11px] text-white/45">{ROLE_LABELS[role]}</div>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-auto px-3 py-2">
          {navItems.map((item) => {
            const active = isNavActive(item.key);
            return (
              <NavLink
                key={item.key}
                to={`/${item.key}`}
                className="side-nav-item"
                data-active={active}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} size={21} fill={active} />
                <span className="flex-1 text-right">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.08] p-3">
          <button
            onClick={handleLogout}
<<<<<<< HEAD
            className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-right text-[14px] font-semibold text-white/60 transition hover:text-[#fda4af] hover:[background:color-mix(in_srgb,var(--danger)_16%,transparent)]"
=======
            className="btn-press flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-right text-[14px] font-semibold text-[#aeb4bf] transition-colors hover:[background:var(--danger-bg)] hover:text-danger"
>>>>>>> 0da8c298dcac68eaedd310a6b1341c8017f1354f
          >
            <Icon name="logout" size={21} />
            התנתקות
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
<<<<<<< HEAD
        {/* Topbar */}
        <header className="app-header sticky top-0 z-30 flex h-[66px] flex-none items-center gap-4 px-4 md:px-[26px]">
          {/* Mobile brand — fills the otherwise-empty header on phones */}
          <div className="flex min-w-0 items-center gap-2.5 md:hidden">
            <div className="grid h-9 w-9 flex-none place-items-center rounded-[10px] avatar-chip">
              <Icon name="hub" size={19} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[14.5px] font-extrabold leading-tight tracking-tight">
                {isSuperAdmin ? "אופק" : business?.name ?? "—"}
=======
        <header
          className="sticky top-0 z-30 flex flex-none items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-md md:gap-4 md:px-[26px]"
          style={{ paddingTop: "max(0px, var(--safe-top))", height: "calc(58px + var(--safe-top))" }}
        >
          {isEmployeeMobile && (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="פתח תפריט"
              aria-expanded={menuOpen}
              className="btn-press grid h-10 w-10 flex-none place-items-center rounded-[11px] border border-border bg-surface text-text-2 hover:bg-surface-2 md:hidden"
            >
              <Icon name="menu" size={22} />
            </button>
          )}

          <div className="flex min-w-0 flex-1 items-center gap-2.5 md:hidden">
            {!isEmployeeMobile && (
              <div className="grid h-9 w-9 flex-none place-items-center rounded-[10px] [background:var(--accent)]">
                <Icon name="hub" size={20} className="text-white" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-extrabold tracking-tight">{pageTitle}</div>
              <div className="truncate text-[11px] text-text-3">
                {isSuperAdmin ? "אביחי" : business?.name ?? ROLE_LABELS[role]}
>>>>>>> 0da8c298dcac68eaedd310a6b1341c8017f1354f
              </div>
            </div>
          </div>

          <div className="hidden flex-1 md:block" />

<<<<<<< HEAD
          <button onClick={toggle} title="מצב תצוגה" className="icon-btn">
            <Icon name={theme === "light" ? "dark_mode" : "light_mode"} size={21} />
          </button>

          <button className="icon-btn relative" title="התראות">
=======
          <button
            onClick={toggle}
            title="מצב תצוגה"
            className="btn-press grid h-10 w-10 flex-none place-items-center rounded-[11px] border border-border bg-surface text-text-2 hover:bg-surface-2"
          >
            <Icon name={theme === "light" ? "dark_mode" : "light_mode"} size={21} />
          </button>

          <button className="btn-press relative grid h-10 w-10 flex-none place-items-center rounded-[11px] border border-border bg-surface text-text-2 hover:bg-surface-2">
>>>>>>> 0da8c298dcac68eaedd310a6b1341c8017f1354f
            <Icon name="notifications" size={21} />
          </button>

          <div className="hidden h-7 w-px bg-border sm:block" />

          <div className="relative">
<<<<<<< HEAD
            <button onClick={() => setProfileOpen((v) => !v)} className="flex items-center gap-2.5 rounded-[10px] p-1 hover:bg-surface-2">
              <div className="avatar-chip h-9 w-9 rounded-[10px] text-[14px] font-bold">
=======
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="btn-press flex items-center gap-2 rounded-[10px] p-1 hover:bg-surface-2"
            >
              <div className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[14px] font-bold text-white [background:var(--ink)]">
>>>>>>> 0da8c298dcac68eaedd310a6b1341c8017f1354f
                {initialsOf(profile?.full_name)}
              </div>
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-[13.5px] font-bold">{profile?.full_name ?? "משתמש"}</div>
                <div className="text-[11.5px] text-text-3">{ROLE_LABELS[role]}</div>
              </div>
              <Icon name="expand_more" size={19} className="hidden text-text-3 sm:block" />
            </button>
            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <motion.div
                  initial={reduce ? false : { opacity: 0, transform: "scale(0.97) translateY(-4px)" }}
                  animate={{ opacity: 1, transform: "scale(1) translateY(0)" }}
                  transition={{ duration: 0.18, ease: EASE_OUT }}
                  className="absolute left-0 top-[52px] z-50 w-[min(230px,calc(100vw-2rem))] overflow-hidden rounded-[14px] border border-border bg-surface shadow-lg"
                  style={{ transformOrigin: "top left" }}
                >
                  <div className="border-b border-border px-4 py-3.5">
                    <div className="text-[14px] font-bold">{profile?.full_name}</div>
                    <div className="mt-px text-[12px] text-text-3">{ROLE_LABELS[role]}</div>
                  </div>
                  <div className="p-1.5">
                    <button
                      onClick={() => { setProfileOpen(false); navigate("/profile"); }}
                      className="btn-press flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-right text-[13.5px] hover:bg-surface-2"
                    >
                      <Icon name="person" size={19} /> הפרופיל שלי
                    </button>
                    <button
                      onClick={handleLogout}
                      className="btn-press flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-right text-[13.5px] text-danger hover:[background:var(--danger-bg)]"
                    >
                      <Icon name="logout" size={19} /> התנתקות
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </div>
        </header>

<<<<<<< HEAD
        <main className="flex-1 overflow-auto bg-bg px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[18px] md:px-[30px] md:pb-7 md:pt-7">
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
=======
        <main
          className={`flex-1 overflow-x-hidden overflow-y-auto px-4 pt-4 md:px-[30px] md:pb-7 md:pt-7 ${
            isEmployeeMobile ? "pb-[max(1rem,var(--safe-bottom))]" : "pb-[var(--mobile-nav-h)]"
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }}
              animate={{ opacity: 1, transform: "translateY(0)" }}
              exit={reduce ? undefined : { opacity: 0, transform: "translateY(-4px)" }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
>>>>>>> 0da8c298dcac68eaedd310a6b1341c8017f1354f
        </main>
      </div>

      {!isEmployeeMobile && <MobileBottomNav items={navItems} currentKey={currentKey} />}

      {isEmployeeMobile && (
        <MobileSideDrawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          items={navItems}
          currentKey={currentKey}
          businessName={business?.name}
          userName={profile?.full_name}
          role={role}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
