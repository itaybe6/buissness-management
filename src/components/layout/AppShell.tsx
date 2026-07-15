import { useEffect, useMemo, useState } from "react";

import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useBusiness } from "@/api/businesses";

import { useAuth } from "@/lib/auth";

import { useBusinessId } from "@/lib/db";

import { useTheme } from "@/lib/theme";

import { Icon } from "@/components/ui";

import { UserAvatar } from "@/components/ui/UserAvatar";

import { MobileSideDrawer } from "@/components/layout/MobileSideDrawer";

import { NAV_ITEMS, ROLE_LABELS, groupNavItems } from "@/lib/constants";

import type { NavItem } from "@/lib/constants";




export function AppShell() {

  const { profile, hasFeature, signOut } = useAuth();

  const businessId = useBusinessId();

  const { data: business } = useBusiness(businessId);

  const { theme, toggle } = useTheme();

  const location = useLocation();

  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);

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



  const flatNav = role === "employee";
  const navGroups = useMemo(() => groupNavItems(navItems, { flat: flatNav }), [navItems, flatNav]);



  const isSuperAdmin = role === "super_admin";

  const currentKey = location.pathname.replace(/^\//, "").split("/")[0] || "dashboard";

  const isProfileActive = currentKey === "profile";

  const profileSubtitle = isSuperAdmin ? ROLE_LABELS[role] : business?.name ?? ROLE_LABELS[role];



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

        className="app-sidebar sticky top-0 hidden h-[100dvh] w-[var(--sw)] flex-none flex-col border-l md:flex"

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



        <nav className="flex flex-1 flex-col gap-1 overflow-auto px-3 py-2">

          {navGroups.map((group) => (

            <div key={group.id} className="side-nav-group">

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

      <div className="flex min-w-0 flex-1 flex-col">

        <header className="app-header mobile-header sticky top-0 z-30 flex flex-none items-center gap-3 px-4 md:h-[66px] md:gap-4 md:px-[26px]">

          <NavLink

            to="/profile"

            aria-label="פרופיל"

            className="mobile-header-profile btn-press md:hidden"

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



          <div className="flex-1 md:hidden" />



          <button

            type="button"

            onClick={() => setMenuOpen(true)}

            aria-label="פתח תפריט"

            aria-expanded={menuOpen}

            className="mobile-header-menu btn-press md:hidden"

          >

            <Icon name="menu" size={22} />

          </button>



          <div className="hidden flex-1 md:block" />

        </header>



        <main className="flex-1 overflow-auto bg-bg px-4 pb-[max(1rem,var(--safe-bottom))] pt-[18px] md:px-[30px] md:pb-7 md:pt-7">

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


