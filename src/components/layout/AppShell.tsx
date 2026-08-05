import { useEffect, useMemo, useRef, useState } from "react";

import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useBusiness } from "@/api/businesses";

import { useAuth } from "@/lib/auth";

import { useBusinessId } from "@/lib/db";

import { useTheme } from "@/lib/theme";

import { Icon } from "@/components/ui";

import { UserAvatar } from "@/components/ui/UserAvatar";

import { MobileSideDrawer } from "@/components/layout/MobileSideDrawer";

import { NavItemBadge } from "@/components/layout/NavItemBadge";

import { ROLE_LABELS, groupNavItems, visibleNavItems } from "@/lib/constants";

import { useMaintenanceNewFaultCount } from "@/hooks/useMaintenanceNewFaultCount";
import { useMobileChrome } from "@/hooks/useMobileChrome";
import { usePartialDeliveryOrderCount } from "@/hooks/usePartialDeliveryOrderCount";
import { useSalaryIssueBadgeCount } from "@/hooks/useSalaryIssueBadgeCount";

import type { NavItem } from "@/lib/constants";




export function AppShell() {

  const { profile, hasFeature, signOut } = useAuth();

  const businessId = useBusinessId();

  const { data: business } = useBusiness(businessId);

  const { theme, toggle } = useTheme();

  const location = useLocation();

  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [inkHeaderSolid, setInkHeaderSolid] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const { count: newFaultCount } = useMaintenanceNewFaultCount();
  const { count: partialDeliveryOrderCount } = usePartialDeliveryOrderCount();
  const { count: salaryIssueCount } = useSalaryIssueBadgeCount();

  const role = profile?.role ?? "employee";



  const navItems: NavItem[] = useMemo(() => visibleNavItems(role, hasFeature), [role, hasFeature]);



  const flatNav = role === "employee";
  const navGroups = useMemo(() => groupNavItems(navItems, { flat: flatNav }), [navItems, flatNav]);



  const isSuperAdmin = role === "super_admin";

  const currentKey = location.pathname.replace(/^\//, "").split("/")[0] || "dashboard";

  const isProfileActive = currentKey === "profile";

  const profileSubtitle = isSuperAdmin ? ROLE_LABELS[role] : business?.name ?? ROLE_LABELS[role];

  /** Pages with the dark ink hero — mobile top bar should match that shell. */
  const workerShellPage =
    (location.pathname === "/dashboard" &&
      (role === "employee" || role === "shift_manager")) ||
    location.pathname === "/salary-issues";

  const inkHeroHeader =
    workerShellPage ||
    location.pathname.startsWith("/inventory/items/new") ||
    /^\/inventory\/items\/[^/]+\/edit$/.test(location.pathname) ||
    location.pathname === "/suppliers" ||
    location.pathname.startsWith("/suppliers/") ||
    location.pathname === "/settings" ||
    /^\/businesses\/[^/]+$/.test(location.pathname) ||
    location.pathname === "/events" ||
    /^\/events\/[^/]+$/.test(location.pathname);



  async function handleLogout() {

    await signOut();

    navigate("/login", { replace: true });

  }



  useEffect(() => {

    setMenuOpen(false);

  }, [location.pathname]);

  useEffect(() => {
    setInkHeaderSolid(false);
    if (!inkHeroHeader) return;

    const main = mainRef.current;
    const header = main?.previousElementSibling;
    if (!main || !(header instanceof HTMLElement)) return;

    const mainEl = main;
    const headerEl = header;

    function update() {
      const hero = mainEl.querySelector(
        ".spf-hero, .evtd-hero, .evid-hero, .cbp-hero, .siq-hero, .stx-hero, .worker-hero",
      );
      /* Keep the ink/worker shell while the hero is still mounting (loader)
         so the status-bar strip doesn't flash white/surface. */
      if (!hero) {
        setInkHeaderSolid(false);
        return;
      }
      const headerBottom = headerEl.getBoundingClientRect().bottom;
      const heroBottom = hero.getBoundingClientRect().bottom;
      setInkHeaderSolid(heroBottom <= headerBottom + 1);
    }

    update();
    mainEl.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const ro = new ResizeObserver(update);
    ro.observe(mainEl);

    const mo = new MutationObserver(update);
    mo.observe(mainEl, { childList: true, subtree: true });

    return () => {
      mainEl.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [inkHeroHeader, location.pathname]);

  useMobileChrome({
    menuOpen,
    inkHero: inkHeroHeader,
    inkHeaderSolid,
    workerHero: workerShellPage,
    theme,
  });

  const isNavActive = (key: string) =>

    currentKey === key || (key === "dashboard" && currentKey === "");



  return (

    <div className="flex min-h-[100dvh]">

      {/* Sidebar — desktop only */}

      <aside

        className="app-sidebar sticky top-0 hidden h-[100dvh] w-[var(--sw)] flex-none flex-col border-l md:flex"

      >

        <div className="flex items-center justify-between gap-3 px-[18px] pb-4 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="avatar-chip h-[38px] w-[38px] rounded-[11px]">
              <Icon name="hub" size={22} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[16px] font-extrabold tracking-tight text-white">
                {isSuperAdmin ? "AMI" : business?.name ?? "—"}
              </div>
              <div className="text-[11.5px] text-white/45">Business Management</div>
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
                <Icon name={isSuperAdmin ? "apps" : "storefront"} size={18} />
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



        <nav className="side-nav-scroll flex flex-1 flex-col gap-1 overflow-auto px-3 py-2">

          {navGroups.map((group) => (

            <div key={group.id} className="side-nav-group" data-labeled={!!group.label}>

              {group.label ? (

                <div className="side-nav-group-label">{group.label}</div>

              ) : null}

              <div className="flex flex-col gap-0.5">

                {group.items.map((item) => {

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

                      {role === "maintenance" && item.key === "faults" ? (
                        <NavItemBadge
                          count={newFaultCount}
                          ariaLabel={`${newFaultCount} תקלות חדשות`}
                        />
                      ) : null}
                      {role === "office_manager" && item.key === "inventory" ? (
                        <NavItemBadge
                          count={partialDeliveryOrderCount}
                          ariaLabel={`${partialDeliveryOrderCount} הזמנות שלא הגיעו במלואן`}
                        />
                      ) : null}
                      {(role === "manager" || role === "office_manager") && item.key === "payroll" ? (
                        <NavItemBadge
                          count={salaryIssueCount}
                          ariaLabel={`${salaryIssueCount} בעיות שכר חדשות`}
                        />
                      ) : null}

                    </NavLink>

                  );

                })}

              </div>

            </div>

          ))}

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

      <div className="app-main-column flex min-w-0 flex-1 flex-col bg-bg">

        {/* Mobile-only top bar — desktop has the sidebar, so no empty header strip */}
        <header
          className={`app-header mobile-header sticky top-0 z-30 flex flex-none items-center gap-3 px-4 md:hidden${
            inkHeroHeader ? ` mobile-header--ink${inkHeaderSolid ? " mobile-header--ink-solid" : ""}` : ""
          }`}
        >

          <NavLink

            to="/profile"

            aria-label="פרופיל"

            className="mobile-header-profile btn-press"

            data-active={isProfileActive}

            aria-current={isProfileActive ? "page" : undefined}

          >

            <span className="mobile-header-profile-avatar">

              <UserAvatar

                userId={profile?.id ?? ""}

                name={profile?.full_name}

                avatarUrl={profile?.avatar_url}

                size={36}

                rounded="circle"

              />

            </span>

            <span className="mobile-header-profile-meta">

              <span className="mobile-header-name truncate">

                {profile?.full_name ?? "משתמש"}

              </span>

              <span className="mobile-header-role truncate">

                {profileSubtitle}

              </span>

            </span>

          </NavLink>



          <div className="flex-1" />



          <button

            type="button"

            onClick={() => setMenuOpen(true)}

            aria-label="פתח תפריט"

            aria-expanded={menuOpen}

            className="mobile-header-menu btn-press"

          >

            <Icon name="menu" size={22} />

          </button>

        </header>



        <main
          ref={mainRef}
          className={`app-main-scroll flex-1 overflow-auto bg-bg px-4 pb-[max(1rem,var(--safe-bottom))] pt-[18px] md:px-[30px] md:pb-7 md:pt-7${
            inkHeroHeader ? " main--ink-hero" : ""
          }`}
        >

          <div className="w-full min-w-0">
            <Outlet />
          </div>

        </main>

      </div>



      <MobileSideDrawer

        open={menuOpen}

        onClose={() => setMenuOpen(false)}

        items={navItems}

        currentKey={currentKey}

        businessName={isSuperAdmin ? "AMI" : business?.name}

        userName={profile?.full_name}

        userId={profile?.id}

        avatarUrl={profile?.avatar_url}

        role={role}

        isSuperAdmin={isSuperAdmin}

        theme={theme}

        onToggleTheme={toggle}

        onLogout={handleLogout}

        newFaultCount={newFaultCount}
        partialDeliveryOrderCount={partialDeliveryOrderCount}
        salaryIssueCount={salaryIssueCount}

      />

    </div>

  );

}


