import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Icon } from "@/components/ui";
import { NAV_ITEMS, ROLE_LABELS } from "@/lib/constants";
import type { NavItem } from "@/lib/constants";

function initialsOf(name: string | null | undefined) {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

export function AppShell() {
  const { profile, hasFeature, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);

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

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  const navLinkClass = (key: string) => {
    const active = currentKey === key || (key === "dashboard" && currentKey === "");
    return `flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[14.5px] transition ${
      active ? "font-bold text-white [background:var(--accent)]" : "font-medium text-[#aeb4bf] hover:bg-white/[0.07]"
    }`;
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className="sticky top-0 hidden h-screen w-[var(--sw)] flex-none flex-col border-l border-border md:flex"
        style={{ background: "linear-gradient(178deg,#1d1432,#0f0a1a)" }}
      >
        <div className="flex items-center gap-3 px-[18px] pb-4 pt-5">
          <div className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] [background:var(--accent)]">
            <Icon name="hub" size={22} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[16px] font-extrabold tracking-tight text-white">אופק</div>
            <div className="text-[11.5px] text-[#8b919c]">ניהול עסקים</div>
          </div>
        </div>

        <div className="px-3.5 pb-2">
          <div className="flex items-center gap-2.5 rounded-[12px] border border-white/[0.09] bg-white/[0.06] px-3 py-2.5">
            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] [background:var(--accent)]">
              <Icon name={isSuperAdmin ? "apps" : "storefront"} size={18} className="text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold text-white">
                {isSuperAdmin ? "מסך פלטפורמה" : profile?.full_name ? "העסק שלי" : "—"}
              </div>
              <div className="text-[11px] text-[#8b919c]">{ROLE_LABELS[role]}</div>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-auto px-3 py-2">
          {navItems.map((item) => (
            <NavLink key={item.key} to={`/${item.key}`} className={navLinkClass(item.key)}>
              <Icon name={item.icon} size={21} />
              <span className="flex-1 text-right">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/[0.08] p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-right text-[14px] font-semibold text-[#aeb4bf] transition hover:[background:var(--danger-bg)] hover:text-danger"
          >
            <Icon name="logout" size={21} />
            התנתקות
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-[66px] flex-none items-center gap-4 border-b border-border bg-surface px-4 md:px-[26px]">
          <div className="relative hidden max-w-[420px] flex-1 sm:block">
            <Icon name="search" size={20} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-3" />
            <input placeholder="חיפוש עובדים, תקלות, משימות..." className="field pr-11 text-[13.5px]" />
          </div>
          <div className="flex-1" />

          <button onClick={toggle} title="מצב תצוגה" className="grid h-10 w-10 place-items-center rounded-[11px] border border-border bg-surface text-text-2 hover:bg-surface-2">
            <Icon name={theme === "light" ? "dark_mode" : "light_mode"} size={21} />
          </button>

          <button className="relative grid h-10 w-10 place-items-center rounded-[11px] border border-border bg-surface text-text-2 hover:bg-surface-2">
            <Icon name="notifications" size={21} />
          </button>

          <div className="h-7 w-px bg-border" />

          <div className="relative">
            <button onClick={() => setProfileOpen((v) => !v)} className="flex items-center gap-2.5 rounded-[10px] p-1 hover:bg-surface-2">
              <div className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[14px] font-bold text-white [background:var(--ink)]">
                {initialsOf(profile?.full_name)}
              </div>
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-[13.5px] font-bold">{profile?.full_name ?? "משתמש"}</div>
                <div className="text-[11.5px] text-text-3">{ROLE_LABELS[role]}</div>
              </div>
              <Icon name="expand_more" size={19} className="text-text-3" />
            </button>
            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <div className="absolute left-0 top-[52px] z-50 w-[230px] animate-pop overflow-hidden rounded-[14px] border border-border bg-surface shadow-lg">
                  <div className="border-b border-border px-4 py-3.5">
                    <div className="text-[14px] font-bold">{profile?.full_name}</div>
                    <div className="mt-px text-[12px] text-text-3">{ROLE_LABELS[role]}</div>
                  </div>
                  <div className="p-1.5">
                    <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-right text-[13.5px] text-danger hover:[background:var(--danger-bg)]">
                      <Icon name="logout" size={19} /> התנתקות
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto px-4 pb-24 pt-[18px] md:px-[30px] md:pb-7 md:pt-7">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-[66px] items-stretch justify-around border-t border-border bg-surface px-1.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:hidden">
        {navItems.slice(0, 5).map((item) => {
          const active = currentKey === item.key;
          return (
            <NavLink
              key={item.key}
              to={`/${item.key}`}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${active ? "text-text" : "text-text-3"}`}
            >
              <Icon name={item.icon} size={23} />
              <span className="text-[10.5px] font-semibold">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
