import { useEffect, useMemo, useState } from "react";
import { Card, EmptyState, Icon, InlineLoader } from "@/components/ui";
import { CountUp } from "@/components/dashboard/charts";
import { formatCurrency } from "@/lib/db";
import {
  SPEND_WINDOW_MONTHS,
  buildVendorSpend,
  levelsForValues,
  median,
  monthLabel,
  receiptMonth,
  spendVerdict,
  vendorMonthRows,
  vendorSeries,
  type VendorSpend,
} from "@/lib/supplierSpend";
import type { OfficeReceipt } from "@/types/database";
import { SpendTrendChart, type TrendPoint } from "./spendChart";
import { RECEIPT_TYPE_ICONS, RECEIPT_TYPE_LABELS } from "./types";

function formatDocDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

function compactCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `₪${(n / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return formatCurrency(n);
}

export function SupplierSpendPanel({
  receipts,
  isLoading,
  month,
}: {
  receipts: OfficeReceipt[];
  isLoading: boolean;
  month: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const vendors = useMemo(() => buildVendorSpend(receipts), [receipts]);
  const rows = useMemo(() => vendorMonthRows(vendors, month), [vendors, month]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.vendor.name.toLowerCase().includes(q));
  }, [rows, search]);

  // Keep a supplier selected at all times — default to the biggest one this month.
  const selected = useMemo(() => vendors.find((v) => v.key === selectedKey) ?? null, [vendors, selectedKey]);
  useEffect(() => {
    if (selected || rows.length === 0) return;
    setSelectedKey(rows[0].vendor.key);
  }, [selected, rows]);

  if (isLoading) return <InlineLoader label="טוען ניתוח ספקים..." />;

  if (vendors.length === 0) {
    return (
      <EmptyState
        icon="insights"
        title="אין עדיין מסמכים לניתוח"
        description="אחרי העלאת חשבוניות וקבלות תוכלו לבחור ספק ולראות כמה חייבים לו."
      />
    );
  }

  return (
    <div className="spend-layout">
      <aside className="spend-rail">
        <label className="spend-search">
          <Icon name="search" size={18} className="text-text-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש ספק..."
            aria-label="חיפוש ספק"
          />
        </label>

        {visibleRows.length === 0 ? (
          <p className="spend-rail__empty">לא נמצא ספק בשם "{search}"</p>
        ) : (
          <div className="spend-rail__list" role="listbox" aria-label="בחירת ספק">
            {visibleRows.map((row) => (
              <button
                key={row.vendor.key}
                type="button"
                role="option"
                aria-selected={row.vendor.key === selected?.key}
                className="spend-vendor"
                data-active={row.vendor.key === selected?.key}
                onClick={() => setSelectedKey(row.vendor.key)}
              >
                <span className="spend-vendor__name">{row.vendor.name}</span>
                <span className="spend-vendor__amount">{compactCurrency(row.month.billed)}</span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <div className="spend-main">
        {selected && <SupplierDetail key={selected.key} vendor={selected} month={month} />}
      </div>
    </div>
  );
}

function SupplierDetail({ vendor, month }: { vendor: VendorSpend; month: string }) {
  const [openMonth, setOpenMonth] = useState(month);
  useEffect(() => setOpenMonth(month), [month]);

  const series = useMemo(() => vendorSeries(vendor, month, SPEND_WINDOW_MONTHS), [vendor, month]);
  const current = useMemo(
    () => series.find((m) => m.month === openMonth) ?? series[series.length - 1],
    [series, openMonth]
  );
  const verdict = useMemo(() => spendVerdict(series, openMonth), [series, openMonth]);
  const monthDocs = useMemo(() => vendor.receipts.filter((r) => receiptMonth(r) === openMonth), [vendor, openMonth]);

  const trend = useMemo<TrendPoint[]>(() => {
    const values = series.map((m) => m.billed);
    const levels = levelsForValues(values);
    return series.map((m, i) => ({
      month: m.month,
      value: values[i],
      count: m.count,
      level: values[i] === 0 ? "new" : levels[i],
    }));
  }, [series]);

  /** "הרגיל" של הספק — חציון החודשים הפעילים. */
  const baseline = useMemo(() => {
    const active = series.map((m) => m.billed).filter((v) => v > 0);
    return active.length >= 2 ? median(active) : 0;
  }, [series]);

  const owed = Math.max(0, current.balance);

  return (
    <Card className="spend-panel">
      <header className="spend-panel__head">
        <h3 className="spend-panel__name">{vendor.name}</h3>
        <span className="spend-panel__month">{monthLabel(openMonth, "long")}</span>
      </header>

      <div className="spend-panel__figure">
        <div>
          <div className="spend-panel__label">הוצאה ב{monthLabel(openMonth, "long")}</div>
          <div className="spend-panel__value">
            <CountUp value={current.billed} format={(n) => formatCurrency(n)} />
          </div>
        </div>
        <span className={`spend-verdict spend-verdict--${verdict.tone}`}>
          <Icon name={verdict.icon} size={17} />
          <span>
            <b>{verdict.title}</b>
            <small>{verdict.detail}</small>
          </span>
        </span>
      </div>

      <div className="spend-panel__facts">
        {owed > 0.5 ? (
          <span className="spend-pay spend-pay--open">
            <Icon name="schedule" size={15} />
            נותר לשלם {formatCurrency(owed)}
          </span>
        ) : current.billed > 0 ? (
          <span className="spend-pay spend-pay--done">
            <Icon name="check_circle" size={15} />
            הכל שולם
          </span>
        ) : null}
        <span className="spend-panel__count">
          {current.count} מסמכים בחודש
        </span>
      </div>

      <SpendTrendChart points={trend} activeMonth={openMonth} baseline={baseline} onSelect={setOpenMonth} />

      <section className="spend-docs">
        <div className="spend-docs__head">
          <h4 className="spend-docs__title">מסמכים · {monthLabel(openMonth, "long")}</h4>
          {current.billed > 0 && <span className="spend-docs__total">{formatCurrency(current.billed)}</span>}
        </div>

        {monthDocs.length === 0 ? (
          <p className="spend-docs__empty">
            <Icon name="inbox" size={24} />
            לא נרשמו מסמכים מהספק בחודש הזה
          </p>
        ) : (
          <ul className="spend-docs__list">
            {monthDocs.map((r, i) => (
              <li key={r.id} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                <a href={r.file_url} target="_blank" rel="noreferrer" className="spend-doc" data-type={r.type}>
                  <span className="spend-doc__icon">
                    <Icon name={RECEIPT_TYPE_ICONS[r.type]} size={19} />
                  </span>
                  <span className="spend-doc__body">
                    <span className="spend-doc__title">{RECEIPT_TYPE_LABELS[r.type]}</span>
                    <span className="spend-doc__date">{formatDocDate(r.document_date ?? r.created_at)}</span>
                  </span>
                  <span className="spend-doc__amount">{formatCurrency(Number(r.amount))}</span>
                  <span className="spend-doc__open" aria-hidden>
                    <Icon name="open_in_new" size={16} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
