import type { ReactNode } from "react";
import { Icon } from "@/components/ui";
import {
  LINE_ISSUE_LABELS,
  MARGIN_STATUS_LABELS,
  formatPct,
  type LineIssue,
  type MarginStatus,
} from "@/lib/menuCosting";

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export function statusTone(status: MarginStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "good") return "success";
  if (status === "warn") return "warning";
  if (status === "over") return "danger";
  return "neutral";
}

export function StatusPill({ status, compact = false }: { status: MarginStatus; compact?: boolean }) {
  const icon = status === "good" ? "check_circle" : status === "warn" ? "error" : status === "over" ? "trending_down" : "help";
  return (
    <span className="mnu-pill" data-tone={statusTone(status)} data-compact={compact}>
      <Icon name={icon} size={compact ? 13 : 15} fill />
      {MARGIN_STATUS_LABELS[status]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Food-cost ring — the dish's single most important number             */
/* ------------------------------------------------------------------ */

export function FoodCostRing({
  pct,
  target,
  status,
  size = 64,
  stroke = 6,
  label,
}: {
  pct: number | null;
  target: number;
  status: MarginStatus;
  size?: number;
  stroke?: number;
  label?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * c;
  const targetAngle = (Math.max(0, Math.min(100, target)) / 100) * 360;
  return (
    <span className="mnu-ring" data-tone={statusTone(status)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="mnu-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="mnu-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {/* target tick */}
        <line
          className="mnu-ring-tick"
          x1={size / 2}
          y1={stroke / 2 - 1}
          x2={size / 2}
          y2={stroke + 2}
          strokeWidth={2}
          transform={`rotate(${targetAngle} ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="mnu-ring-label">{label ?? <b>{pct == null ? "—" : formatPct(pct, 0)}</b>}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Issues                                                              */
/* ------------------------------------------------------------------ */

export function IssueList({ issues, className = "" }: { issues: LineIssue[]; className?: string }) {
  if (!issues.length) return null;
  return (
    <ul className={`mnu-issues ${className}`}>
      {issues.map((i) => (
        <li key={i} data-soft={i === "pinned_supplier_missing"}>
          <Icon name={i === "pinned_supplier_missing" ? "info" : "warning"} size={15} fill />
          <span>{LINE_ISSUE_LABELS[i]}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */

export function Monogram({ name, url, size = 44, icon = "restaurant" }: { name: string; url?: string | null; size?: number; icon?: string }) {
  return (
    <span className="mnu-mono" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" loading="lazy" /> : name.trim() ? <b>{name.trim()[0]}</b> : <Icon name={icon} size={Math.round(size * 0.5)} />}
    </span>
  );
}

/**
 * Where every shekel of the net price goes: dark = ingredients, tone = gross profit.
 * The tick marks the target food-cost %, so "am I on target" is visible at a glance.
 */
export function SplitBar({
  cost,
  net,
  target,
  status,
  compact = false,
}: {
  cost: number;
  net: number;
  target: number;
  status: MarginStatus;
  compact?: boolean;
}) {
  if (!(net > 0)) return null;
  const costPct = Math.max(0, Math.min(100, (cost / net) * 100));
  const profit = net - cost;
  return (
    <div className="mnu-split" data-tone={statusTone(status)} data-compact={compact}>
      <div className="mnu-split-bar" role="img" aria-label={`עלות ${formatPct(costPct, 0)} מהמחיר נטו, רווח ${formatPct(100 - costPct, 0)}`}>
        <span className="mnu-split-cost" style={{ width: `${costPct}%` }} />
        <span className="mnu-split-profit" style={{ width: `${100 - costPct}%` }} />
        <span className="mnu-split-tick" style={{ insetInlineStart: `${Math.max(0, Math.min(100, target))}%` }} title={`יעד ${formatPct(target, 0)}`} />
      </div>
      {!compact && (
        <div className="mnu-split-legend">
          <span>
            <i className="mnu-split-dot mnu-split-dot--cost" />
            חומרים {formatPct(costPct, 0)}
          </span>
          <span data-negative={profit < 0}>
            <i className="mnu-split-dot mnu-split-dot--profit" />
            רווח {formatPct(100 - costPct, 0)}
          </span>
          <span className="mnu-split-target">יעד {formatPct(target, 0)}</span>
        </div>
      )}
    </div>
  );
}

/** Stacked cost-share bar: one segment per line, sorted by share. */
export function ShareBar({ parts }: { parts: { key: string; share: number; label: string }[] }) {
  const sorted = [...parts].filter((p) => p.share > 0).sort((a, b) => b.share - a.share);
  if (!sorted.length) return <div className="mnu-sharebar" data-empty />;
  return (
    <div className="mnu-sharebar" role="img" aria-label="התפלגות עלות המנה לפי מרכיב">
      {sorted.map((p, i) => (
        <span key={p.key} style={{ width: `${p.share * 100}%` }} data-i={i % 6} title={`${p.label} · ${formatPct(p.share * 100, 0)}`} />
      ))}
    </div>
  );
}
