import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { Icon, Switch } from "@/components/ui";
import { ALL_FEATURES } from "@/lib/constants";
import type { FeatureKey } from "@/types/database";

const SPRING = { stiffness: 280, damping: 28, mass: 0.6 };
const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

const MODULE_GROUPS: { id: string; label: string; keys: FeatureKey[] }[] = [
  { id: "hr", label: "עובדים ומסמכים", keys: ["agreements"] },
  { id: "shifts", label: "משמרות ושכר", keys: ["shifts", "shift_reports", "payroll", "attendance"] },
  { id: "ops", label: "מלאי ותפעול", keys: ["inventory", "waste", "faults", "events", "tasks"] },
];

type ModuleLayout = "cinema" | "portrait" | "orbit";

const MODULE_ART: Record<
  FeatureKey,
  {
    layout: ModuleLayout;
    span: string;
    decor: string;
  }
> = {
  agreements: { layout: "cinema", span: "module-capsule--half", decor: "decor-rings" },
  shifts: { layout: "cinema", span: "module-capsule--lead", decor: "decor-grid" },
  shift_reports: { layout: "portrait", span: "module-capsule--tail", decor: "decor-wave" },
  payroll: { layout: "orbit", span: "module-capsule--third", decor: "decor-dots" },
  attendance: { layout: "cinema", span: "module-capsule--wide", decor: "decor-arc" },
  inventory: { layout: "cinema", span: "module-capsule--hero", decor: "decor-stripe" },
  waste: { layout: "orbit", span: "module-capsule--third", decor: "decor-rings" },
  faults: { layout: "portrait", span: "module-capsule--third", decor: "decor-grid" },
  events: { layout: "orbit", span: "module-capsule--third", decor: "decor-wave" },
  tasks: { layout: "portrait", span: "module-capsule--third", decor: "decor-lines" },
};

const featureByKey = new Map(ALL_FEATURES.map((f) => [f.key, f]));

function ModuleCapsule({
  featureKey,
  enabled,
  icon,
  label,
  desc,
  index,
  onToggle,
}: {
  featureKey: FeatureKey;
  enabled: boolean;
  icon: string;
  label: string;
  desc: string;
  index: number;
  onToggle: () => void;
}) {
  const art = MODULE_ART[featureKey];
  const reduce = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [7, -7]), SPRING);
  const rotateY = useSpring(useTransform(px, [0, 1], [-7, 7]), SPRING);

  const onMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    px.set(x);
    py.set(y);
    el.style.setProperty("--spot-x", `${x * 100}%`);
    el.style.setProperty("--spot-y", `${y * 100}%`);
  };

  const onLeave = () => {
    px.set(0.5);
    py.set(0.5);
    ref.current?.style.setProperty("--spot-x", "50%");
    ref.current?.style.setProperty("--spot-y", "50%");
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      layout
      initial={reduce ? false : { opacity: 0, transform: "translateY(18px) scale(0.97)" }}
      animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
      transition={{ duration: 0.55, delay: reduce ? 0 : index * 0.07, ease: EASE }}
      onClick={onToggle}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      data-enabled={enabled}
      data-module={featureKey}
      data-layout={art.layout}
      style={
        {
          "--spot-x": "50%",
          "--spot-y": "50%",
          perspective: 900,
        } as CSSProperties
      }
      className={`module-capsule group ${art.span}`}
      aria-pressed={enabled}
    >
      <motion.span
        className="module-capsule-tilt"
        style={
          reduce
            ? undefined
            : {
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
              }
        }
      >
        <span className="module-capsule-frame">
          <span className={`module-capsule-decor ${art.decor}`} aria-hidden />
          <span className="module-capsule-spotlight" aria-hidden />
          <span className="module-capsule-watermark" aria-hidden>
            <Icon name={icon} size={120} />
          </span>

          {art.layout === "cinema" && (
            <span className="module-capsule-inner module-capsule-inner--cinema">
              <span className="module-capsule-stage">
                <span className="module-capsule-icon-ring">
                  <Icon name={icon} size={28} />
                </span>
              </span>
              <span className="module-capsule-content">
                <span className="module-capsule-head">
                  <Switch checked={enabled} />
                </span>
                <span className="module-capsule-title">{label}</span>
                <p className="module-capsule-desc">{desc}</p>
              </span>
            </span>
          )}

          {art.layout === "portrait" && (
            <span className="module-capsule-inner module-capsule-inner--portrait">
              <span className="module-capsule-head">
                <span className="module-capsule-icon-ring module-capsule-icon-ring--sm">
                  <Icon name={icon} size={24} />
                </span>
                <Switch checked={enabled} />
              </span>
              <span className="module-capsule-title">{label}</span>
              <p className="module-capsule-desc">{desc}</p>
            </span>
          )}

          {art.layout === "orbit" && (
            <span className="module-capsule-inner module-capsule-inner--orbit">
              <span className="module-capsule-orbit-wrap">
                <span className="module-capsule-orbit-ring" aria-hidden />
                <span className="module-capsule-icon-ring module-capsule-icon-ring--orbit">
                  <Icon name={icon} size={22} />
                </span>
              </span>
              <span className="module-capsule-content module-capsule-content--orbit">
                <span className="module-capsule-head">
                  <Switch checked={enabled} />
                </span>
                <span className="module-capsule-title">{label}</span>
                <p className="module-capsule-desc">{desc}</p>
              </span>
            </span>
          )}

          <span className="module-capsule-shine" aria-hidden />
        </span>
      </motion.span>
    </motion.button>
  );
}

export function ActiveModulesPanel({
  enabledSet,
  onToggle,
}: {
  enabledSet: Set<FeatureKey>;
  onToggle: (key: FeatureKey, enabled: boolean) => void;
}) {
  const total = ALL_FEATURES.length;
  const enabled = enabledSet.size;
  const [activeGroup, setActiveGroup] = useState(MODULE_GROUPS[0].id);
  const reduce = useReducedMotion();

  return (
    <section className="module-rack mb-6">
      <header className="module-rack-head">
        <div className="module-rack-head-glow" aria-hidden />
        <div className="module-rack-head-main">
          <h2 className="module-rack-title">מודולים פעילים</h2>
          <p className="module-rack-lede">כל מודול הוא עולם משלו. הקש כדי להדליק או לכבות.</p>
        </div>
        <div className="module-rack-meter" aria-label={`${enabled} מתוך ${total} מודולים פעילים`}>
          <span className="module-rack-meter-value">{enabled}</span>
          <span className="module-rack-meter-sep">/</span>
          <span className="module-rack-meter-total">{total}</span>
        </div>
      </header>

      <div className="module-rack-shell">
        <nav className="module-rack-nav" aria-label="קטגוריות מודולים">
          {MODULE_GROUPS.map((group) => {
            const on = activeGroup === group.id;
            const lit = group.keys.filter((k) => enabledSet.has(k)).length;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveGroup(group.id)}
                className={`module-rack-nav-item ${on ? "is-active" : ""}`}
              >
                {on && !reduce && (
                  <motion.span
                    layoutId="module-rack-nav-mark"
                    className="module-rack-nav-mark"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                {on && reduce && <span className="module-rack-nav-mark" />}
                <span className="module-rack-nav-label">{group.label}</span>
                <span className="module-rack-nav-count">{lit}</span>
              </button>
            );
          })}
        </nav>

        <div className="module-rack-stage">
          <div className="module-rack-stage-mesh" aria-hidden />
          {MODULE_GROUPS.filter((g) => g.id === activeGroup).map((group) => (
            <motion.div
              key={group.id}
              initial={reduce ? false : { opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.45, ease: EASE }}
              className="module-rack-grid"
            >
              {group.keys.map((key, idx) => {
                const f = featureByKey.get(key);
                if (!f) return null;
                const on = enabledSet.has(key);
                return (
                  <ModuleCapsule
                    key={key}
                    featureKey={key}
                    enabled={on}
                    icon={f.icon}
                    label={f.label}
                    desc={f.desc}
                    index={idx}
                    onToggle={() => onToggle(key, !on)}
                  />
                );
              })}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
