import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui";
import { BlurText, CountUp, InkStage } from "@/components/bits";

/**
 * Ink hero for /agreements. One shell, two audiences:
 *  - managers see how complete the team's paperwork is (staff with every
 *    required document) plus what's still missing;
 *  - employees see their own checklist progress.
 * The page's tab strip docks at the bottom of the hero (`tabs` slot).
 */

function Dial({ pct, center, label }: { pct: number; center: ReactNode; label: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="agx-dial" data-full={clamped >= 100 || undefined}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle className="agx-dial-track" cx="50" cy="50" r={r} />
        <circle
          className="agx-dial-arc"
          cx="50"
          cy="50"
          r={r}
          style={{ "--c": c, "--off": c * (1 - clamped / 100) } as CSSProperties}
        />
      </svg>
      <div className="agx-dial-face">
        <span className="agx-dial-val">{center}</span>
        <span className="agx-dial-lbl">{label}</span>
      </div>
    </div>
  );
}

export interface HeroStat {
  icon: string;
  value: number;
  label: string;
  suffix?: string;
  tone?: "warn" | "ok";
}

function Stats({ items }: { items: HeroStat[] }) {
  return (
    <div className="agx-stats" data-count={items.length}>
      {items.map((s, i) => (
        <div
          key={s.label}
          className="agx-stat"
          data-tone={s.tone}
          style={{ "--i": i } as CSSProperties}
        >
          <span className="agx-stat-icon">
            <Icon name={s.icon} size={17} />
          </span>
          <span className="agx-stat-val">
            <CountUp to={s.value} />
            {s.suffix && <small>{s.suffix}</small>}
          </span>
          <span className="agx-stat-lbl">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function AgreementsHero({
  title,
  sub,
  pct,
  dialCenter,
  dialLabel,
  stats,
  action,
  tabs,
}: {
  title: string;
  sub: string;
  pct: number;
  dialCenter: ReactNode;
  dialLabel: string;
  stats: HeroStat[];
  action?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <InkStage className="agx-hero">
      {action && <div className="srx-bar srx-bar--end">{action}</div>}

      <div className="agx-head">
        <Dial pct={pct} center={dialCenter} label={dialLabel} />
        <div className="agx-copy">
          <BlurText key={title} as="h1" text={title} className="agx-title" />
          <p className="agx-sub">{sub}</p>
        </div>
        <Stats items={stats} />
      </div>

      {tabs && <div className="agx-tabs">{tabs}</div>}
    </InkStage>
  );
}
