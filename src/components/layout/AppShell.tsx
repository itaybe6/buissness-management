import { useEffect, useMemo, useState } from "react";

import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { useBusiness } from "@/api/businesses";

import { useAuth } from "@/lib/auth";

import { useBusinessId } from "@/lib/db";

import { useTheme } from "@/lib/theme";

import { Icon } from "@/components/ui";

import { UserAvatar } from "@/components/ui/UserAvatar";

import { MobileSideDrawer } from "@/components/layout/MobileSideDrawer";

import { EASE_OUT } from "@/components/motion/shared-motion";

import { NAV_ITEMS, ROLE_LABELS } from "@/lib/constants";

import type { NavItem } from "@/lib/constants";



export function AppShell() {

  const { profile, hasFeature, signOut } = useAuth();

  const businessId = useBusinessId();

  const { data: business } = useBusiness(businessId);

  const { theme, toggle } = useTheme();

  const location = useLocation();

  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);

  const reduce = useReducedMotion();



  const role = profile?.role ?? "employee";



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

  const currentNavItem = navItems.find((i) => i.key === currentKey);

  const pageTitle = currentNavItem?.label ?? "אביחי";

  const pageIcon = currentNavItem?.icon ?? "hub";

  const businessLabel = isSuperAdmin ? "אביחי" : business?.name ?? ROLE_LABELS[role];

  const isProfileActive = currentKey === "profile";



  async function handleLogout() {

    await signOut();

    navigate("/login", { replace: true });

  }



  useEffect(() => {

    setMenuOpen(false);

  }, [location.pathname]);



  const isNavActive = (key: string) =>

    currentKey === key || (key === "dashboard" && currentKey === "");



  return (

    <div className="flex min-h-[100dvh]">

      {/* Sidebar — desktop only */}

      <aside

        className="sticky top-0 hidden h-[100dvh] w-[var(--sw)] flex-none flex-col border-l border-white/[0.06] md:flex"

        style={{ background: "linear-gradient(178deg, var(--sidebar-plum), var(--sidebar-plum-deep))" }}

      >

        <div className="flex items-center justify-between gap-3 px-[18px] pb-4 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="avatar-chip h-[38px] w-[38px] rounded-[11px]">
              <Icon name="hub" size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[16px] font-extrabold tracking-tight text-white">
                {isSuperAdmin ? "אביחי" : business?.name ?? "—"}
              </div>
              <div className="text-[11.5px] text-white/45">ניהול עסקים</div>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "light" ? "מצב כהה" : "מצב בהיר"}
            className="btn-press grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-white/[0.1] bg-white/[0.06] text-white/60 transition hover:bg-white/[0.1] hover:text-white"
          >
            <Icon name={theme === "light" ? "dark_mode" : "light_mode"} size={20} />
          </button>
        </div>



        <div className="px-3.5 pb-2">
          <NavLink
            to="/profile"
            className="flex items-center gap-2.5 rounded-[12px] border border-white/[0.09] bg-white/[0.06] px-3 py-2.5 transition hover:bg-white/[0.1]"
            data-active={isProfileActive}
            aria-current={isProfileActive ? "page" : undefined}
          >
            {profile ? (
              <UserAvatar
                userId={profile.id}
                name={profile.full_name}
                avatarUrl={profile.avatar_url}
                size={30}
                rounded="square"
              />
            ) : (
              <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] avatar-chip">
                <Icon name={isSuperAdmin ? "apps" : "storefront"} size={18} className="text-white" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold text-white">
                {profile?.full_name ?? "משתמש"}
              </div>
              <div className="text-[11px] text-white/45">{ROLE_LABELS[role]}</div>
            </div>
          </NavLink>
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
            className="btn-press flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-right text-[14px] font-semibold text-white/60 transition hover:text-[#fda4af] hover:[background:color-mix(in_srgb,var(--danger)_16%,transparent)]"
          >
            <Icon name="logout" size={21} />
            התנתקות
          </button>
        </div>

      </aside>



      {/* Main column */}

      <div className="flex min-w-0 flex-1 flex-col">

        <header className="app-header mobile-header sticky top-0 z-30 flex flex-none items-center gap-3 px-4 md:h-[66px] md:gap-4 md:px-[26px]">

          <button

            type="button"

            onClick={() => setMenuOpen(true)}

            aria-label="פתח תפריט"

            aria-expanded={menuOpen}

            className="mobile-header-menu btn-press md:hidden"

          >

            <Icon name="menu" size={22} />

          </button>



          <div className="mobile-header-brand min-w-0 flex-1 md:hidden">

            <div className="mobile-header-icon" aria-hidden>

              <Icon name={pageIcon} size={20} fill />

            </div>

            <div className="min-w-0 flex-1">

              <div className="mobile-header-title truncate">{pageTitle}</div>

              <div className="mt-0.5 truncate">

                <span className="mobile-header-pill">{businessLabel}</span>

              </div>

            </div>

          </div>



          <NavLink

            to="/profile"

            aria-label="פרופיל"

            className="mobile-header-avatar btn-press md:hidden"

            data-active={isProfileActive}

            aria-current={isProfileActive ? "page" : undefined}

          >

            {profile ? (

              <UserAvatar

                userId={profile.id}

                name={profile.full_name}

                avatarUrl={profile.avatar_url}

                size={34}

                rounded="square"

              />

            ) : (

              <Icon name="person" size={20} />

            )}

          </NavLink>



          <div className="hidden flex-1 md:block" />

        </header>



        <main className="flex-1 overflow-auto bg-bg px-4 pb-[max(1rem,var(--safe-bottom))] pt-[18px] md:px-[30px] md:pb-7 md:pt-7">

          <AnimatePresence mode="wait" initial={false}>

            <motion.div

              key={location.pathname}

              className="w-full min-w-0"

              initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }}

              animate={{ opacity: 1, transform: "translateY(0)" }}

              exit={reduce ? undefined : { opacity: 0, transform: "translateY(-4px)" }}

              transition={{ duration: 0.22, ease: EASE_OUT }}

            >

              <Outlet />

            </motion.div>

          </AnimatePresence>

        </main>

      </div>



      <MobileSideDrawer

        open={menuOpen}

        onClose={() => setMenuOpen(false)}

        items={navItems}

        currentKey={currentKey}

        businessName={isSuperAdmin ? "אביחי" : business?.name}

        userName={profile?.full_name}

        userId={profile?.id}

        avatarUrl={profile?.avatar_url}

        role={role}

        isSuperAdmin={isSuperAdmin}

        theme={theme}

        onToggleTheme={toggle}

        onLogout={handleLogout}

      />

    </div>

  );

}


