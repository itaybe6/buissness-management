import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Card, Icon } from "@/components/ui";
import { NAV_ITEMS } from "@/lib/constants";
import { ManagerDashboard } from "@/components/dashboard/ManagerDashboard";

export function Dashboard() {
  const { profile, hasFeature, features } = useAuth();
  const role = profile?.role ?? "employee";

  if (role === "manager" && profile?.business_id) {
    return <ManagerDashboard />;
  }

  const quickLinks = NAV_ITEMS.filter(
    (i) =>
      i.roles.includes(role) &&
      !["dashboard", "platform"].includes(i.key) &&
      (!i.feature || hasFeature(i.feature))
  ).filter((i, idx, arr) => arr.findIndex((x) => x.key === i.key) === idx);

  return (
    <div className="mx-auto max-w-[1220px] animate-fadeUp">
      {role === "super_admin" ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {[
            { to: "/platform", icon: "space_dashboard", label: "סקירת פלטפורמה", desc: "מבט על כל העסקים" },
            { to: "/businesses", icon: "store", label: "ניהול עסקים", desc: "יצירה והפעלת מודולים" },
            { to: "/platform-users", icon: "group", label: "משתמשים", desc: "כל המשתמשים בפלטפורמה" },
          ].map((c) => (
            <Link key={c.to} to={c.to}>
              <Card className="flex flex-col gap-3 p-5 transition hover:shadow">
                <span className="grid h-11 w-11 place-items-center rounded-[12px] [background:var(--accent-tint)]">
                  <Icon name={c.icon} size={24} className="text-accent-2" />
                </span>
                <div>
                  <div className="text-[14.5px] font-bold">{c.label}</div>
                  <div className="text-[12.5px] text-text-2">{c.desc}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 text-[13px] font-bold uppercase tracking-wide text-text-3">גישה מהירה</div>
          {quickLinks.length === 0 ? (
            <Card className="p-6 text-center text-text-2">
              לא הופעלו מודולים עבור העסק שלך עדיין. פנו למנהל המערכת.
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
              {quickLinks.map((item) => (
                <Link key={item.key} to={`/${item.key}`}>
                  <Card className="flex flex-col gap-3 p-5 transition hover:shadow">
                    <span className="grid h-11 w-11 place-items-center rounded-[12px] [background:var(--accent-tint)]">
                      <Icon name={item.icon} size={24} className="text-accent-2" />
                    </span>
                    <div className="text-[14.5px] font-bold">{item.label}</div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
          {profile?.business_id && features.size === 0 && role !== "manager" && (
            <div className="mt-4 text-[12.5px] text-text-3">* התפריט נבנה דינמית לפי המודולים שהופעלו לעסק.</div>
          )}
        </>
      )}
    </div>
  );
}
