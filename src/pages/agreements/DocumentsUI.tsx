import type { CSSProperties } from "react";
import { Badge, Icon } from "@/components/ui";
import type { AgreementTemplate } from "@/types/database";
import type { DocsMgmtCategory } from "./types";
import { MGMT_CATEGORIES, TYPE_ACCENTS, TYPE_ICONS, TYPE_LABELS } from "./types";

/* ── Page mode tabs (mine / manage) ── */

export function DocsPageTabs({
  active,
  onChange,
  mineCount,
  mgmtCount,
}: {
  active: "mine" | "manage";
  onChange: (tab: "mine" | "manage") => void;
  mineCount?: number;
  mgmtCount?: number;
}) {
  return (
    <div className="docs-page-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={active === "mine"}
        className="docs-page-tab"
        data-active={active === "mine"}
        onClick={() => onChange("mine")}
      >
        לחתימה
        {mineCount != null && mineCount > 0 && <span className="docs-page-tab__badge">{mineCount}</span>}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "manage"}
        className="docs-page-tab"
        data-active={active === "manage"}
        onClick={() => onChange("manage")}
      >
        ניהול הסכמים
        {mgmtCount != null && mgmtCount > 0 && <span className="docs-page-tab__badge">{mgmtCount}</span>}
      </button>
    </div>
  );
}

/* ── Search bar (shared) ── */

export function DocsSearchBar({
  value,
  onChange,
  placeholder = "חיפוש...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="docs-mgmt-search">
      <Icon name="search" size={18} className="docs-mgmt-search__icon" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="docs-mgmt-search__input"
        aria-label={placeholder}
      />
      {value && (
        <button type="button" className="docs-mgmt-search__clear" onClick={() => onChange("")} aria-label="נקה חיפוש">
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}

/* ── Management toolbar: search + filters ── */

export function DocsMgmtToolbar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  counts,
  onAdd,
  addLabel,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  category: DocsMgmtCategory;
  onCategoryChange: (c: DocsMgmtCategory) => void;
  counts: Record<DocsMgmtCategory, number>;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="docs-mgmt-toolbar">
      <DocsSearchBar value={search} onChange={onSearchChange} placeholder="חיפוש מסמך..." />

      <div className="docs-mgmt-filters docs-mgmt-filters--scroll" role="group" aria-label="סינון לפי סוג">
        {MGMT_CATEGORIES.map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            className="docs-mgmt-chip"
            data-active={category === key}
            onClick={() => onCategoryChange(key)}
          >
            <Icon name={icon} size={15} />
            {label}
            <span className="docs-mgmt-chip__count">{counts[key]}</span>
          </button>
        ))}
      </div>

      {onAdd && addLabel && (
        <button type="button" className="docs-mgmt-add" onClick={onAdd}>
          <Icon name="add" size={18} />
          {addLabel}
        </button>
      )}
    </div>
  );
}

/* ── Management summary stats ── */

export function DocsMgmtStats({
  total,
  pending,
  complete,
}: {
  total: number;
  pending: number;
  complete: number;
}) {
  return (
    <div className="docs-mgmt-stats" aria-label="סיכום ניהול">
      <div className="docs-mgmt-stat">
        <span className="docs-mgmt-stat__val">{total}</span>
        <span className="docs-mgmt-stat__lbl">מסמכים</span>
      </div>
      <div className="docs-mgmt-stat">
        <span className="docs-mgmt-stat__val">{pending}</span>
        <span className="docs-mgmt-stat__lbl">ממתינים</span>
      </div>
      <div className="docs-mgmt-stat">
        <span className="docs-mgmt-stat__val">{complete}</span>
        <span className="docs-mgmt-stat__lbl">הושלמו</span>
      </div>
    </div>
  );
}

/* ── Compact template row (mobile-first) ── */

export function TemplateDocRow({
  title,
  type,
  subtitle,
  signed,
  targets,
  canEdit,
  index = 0,
  onView,
  onSigners,
  onDelete,
  deleting,
}: {
  title: string;
  type: AgreementTemplate["type"];
  subtitle: string;
  signed: number;
  targets: number;
  canEdit: boolean;
  index?: number;
  onView: () => void;
  onSigners: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  const accent = TYPE_ACCENTS[type];
  const icon = TYPE_ICONS[type];
  const pct = targets > 0 ? Math.round((signed / targets) * 100) : 0;
  const complete = signed >= targets && targets > 0;

  return (
    <article
      className="doc-row doc-card--enter"
      data-accent={accent}
      data-complete={complete}
      style={{ "--doc-delay": `${index * 40}ms` } as CSSProperties}
    >
      <button type="button" className="doc-row__main" onClick={onView}>
        <span className="doc-row__icon" aria-hidden>
          <Icon name={icon} size={20} />
        </span>
        <span className="doc-row__copy">
          <span className="doc-row__title-row">
            <span className="doc-row__title">{title}</span>
            <Badge tone="neutral" className="shrink-0">
              {`${signed}/${targets}`}
            </Badge>
          </span>
          <span className="doc-row__meta">{subtitle}</span>
          <span className="doc-row__progress" aria-hidden>
            <span className="doc-row__progress-track">
              <span className="doc-row__progress-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="doc-row__progress-lbl">{pct}%</span>
          </span>
        </span>
        <Icon name="chevron_left" size={20} className="doc-row__chevron" />
      </button>

      {canEdit && (
        <div className="doc-row__actions">
          <button type="button" className="doc-row__action" onClick={onView}>
            <Icon name="visibility" size={17} />
            צפייה
          </button>
          <button type="button" className="doc-row__action" onClick={onSigners}>
            <Icon name="how_to_reg" size={17} />
            חתימות
          </button>
          <button
            type="button"
            className="doc-row__action doc-row__action--danger"
            disabled={deleting}
            onClick={onDelete}
          >
            <Icon name="delete" size={17} />
          </button>
        </div>
      )}
    </article>
  );
}

export function filterMgmtAgreements(
  agreements: AgreementTemplate[],
  category: DocsMgmtCategory,
  search: string,
): AgreementTemplate[] {
  let list = agreements;

  if (category === "sexual_harassment") {
    list = list.filter((a) => a.type === "sexual_harassment");
  } else if (category === "form_101") {
    list = list.filter((a) => a.type === "form_101");
  } else if (category === "personal") {
    list = list.filter((a) => a.type !== "sexual_harassment" && a.type !== "form_101");
  }

  const q = search.trim().toLowerCase();
  if (q) {
    list = list.filter((a) => {
      const label = TYPE_LABELS[a.type].toLowerCase();
      return a.title.toLowerCase().includes(q) || label.includes(q);
    });
  }

  return list;
}

export function mgmtCategoryCounts(agreements: AgreementTemplate[]): Record<DocsMgmtCategory, number> {
  const personal = agreements.filter((a) => a.type !== "sexual_harassment" && a.type !== "form_101");
  return {
    all: agreements.length,
    sexual_harassment: agreements.filter((a) => a.type === "sexual_harassment").length,
    form_101: agreements.filter((a) => a.type === "form_101").length,
    personal: personal.length,
  };
}

/* ── Stats bar ── */

export function DocsStatsBar({ pending, signed, total }: { pending: number; signed: number; total: number }) {
  return (
    <div className="docs-stats" aria-label="סיכום מסמכים">
      <div className="docs-stat">
        <span className="docs-stat-val">{pending}</span>
        <span className="docs-stat-lbl">ממתינים</span>
      </div>
      <div className="docs-stat">
        <span className="docs-stat-val">{signed}</span>
        <span className="docs-stat-lbl">נחתמו</span>
      </div>
      <div className="docs-stat">
        <span className="docs-stat-val">{total}</span>
        <span className="docs-stat-lbl">סה״כ</span>
      </div>
    </div>
  );
}

const DOC_ROW_TONES: Record<AgreementTemplate["type"], "accent" | "info"> = {
  work: "accent",
  sexual_harassment: "accent",
  other: "info",
  form_101: "info",
};

export function EmployeeDocRow({
  title,
  type,
  signed,
  onOpen,
  last,
}: {
  title: string;
  type: AgreementTemplate["type"];
  signed: boolean;
  onOpen: () => void;
  last?: boolean;
}) {
  const icon = TYPE_ICONS[type];
  const tone: "accent" | "info" | "warning" = signed ? DOC_ROW_TONES[type] : "warning";

  return (
    <button
      type="button"
      className={`profile-action-row ${last ? "profile-action-row--last" : ""}`}
      onClick={onOpen}
    >
      <span className="profile-action-row-icon" data-tone={tone}>
        <Icon name={icon} size={20} />
      </span>
      <span className="profile-action-row-text">
        <span className="profile-action-row-title">
          {title}
          {!signed && <span className="docs-pending-dot" aria-hidden />}
        </span>
        <span className="profile-action-row-desc" data-pending={!signed || undefined}>
          {signed ? (type === "form_101" ? "נחתם" : TYPE_LABELS[type]) : "ממתין לחתימה"}
        </span>
      </span>
      <Icon name="chevron_left" size={22} className="profile-action-row-chevron" />
    </button>
  );
}

export function DocsEmptyBox({ text, icon = "folder_open" }: { text: string; icon?: string }) {
  return (
    <div className="doc-empty">
      <span className="doc-empty__icon" aria-hidden>
        <Icon name={icon} size={26} />
      </span>
      <p className="doc-empty__text">{text}</p>
    </div>
  );
}

export function DocsEmployeeEmpty({ name }: { name: string | null }) {
  return (
    <div className="doc-employee-empty">
      <span className="doc-employee-empty__icon" aria-hidden>
        <Icon name="task_alt" size={36} />
      </span>
      <h3 className="doc-employee-empty__title">שלום {name ?? ""}</h3>
      <p className="doc-employee-empty__desc">אין מסמכים ממתינים לחתימה כרגע — הכל מעודכן.</p>
    </div>
  );
}

export function DocsTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; icon?: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="docs-tabs" role="tablist">
      {tabs.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          className="docs-tab"
          data-active={active === key}
          onClick={() => onChange(key)}
        >
          {icon && <Icon name={icon} size={17} className="docs-tab__icon" />}
          {label}
        </button>
      ))}
    </div>
  );
}

export function DocsListEmpty({ query, category }: { query?: string; category?: string }) {
  return (
    <div className="doc-list-empty">
      <Icon name="search_off" size={28} className="text-text-3" />
      <p className="doc-list-empty__title">לא נמצאו מסמכים</p>
      <p className="doc-list-empty__sub">
        {query
          ? `אין תוצאות עבור "${query}"`
          : category
            ? "אין מסמכים בקטגוריה זו"
            : "נסו לשנות את הסינון"}
      </p>
    </div>
  );
}
