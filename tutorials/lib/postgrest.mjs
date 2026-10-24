// A small in-memory PostgREST look-alike: enough of the query language the app
// uses (select with embeds, eq/in/is/gte/…/not/cs, order, limit, single) so the
// real UI can run against demo data without touching the live Supabase project.

import { randomUUID } from "node:crypto";

/** FK column → table, for `alias:fk_col(cols)` embeds. */
const FK_TABLES = {
  employee_id: "profiles",
  requested_by: "profiles",
  reported_by: "profiles",
  status_updated_by: "profiles",
  assigned_by: "profiles",
  assigned_to: "profiles",
  created_by: "profiles",
  pay_employee_id: "profiles",
  department_id: "departments",
  event_id: "events",
  item_id: "inventory_items",
  supplier_id: "suppliers",
  warehouse_id: "warehouses",
  shift_template_id: "shift_templates",
  category_id: "inventory_categories",
  business_id: "businesses",
};

/** Child tables embedded by name: `days:shift_template_days(...)`. */
const CHILD_FK = {
  shift_template_days: "shift_template_id",
  recurring_order_items: "recurring_order_id",
};

/** Tables without an `id` primary key — their natural key for upserts. */
const NATURAL_KEYS = {
  business_features: ["business_id", "feature_key"],
  supplier_items: ["supplier_id", "item_id"],
  inventory_item_departments: ["item_id", "department_id"],
  menu_item_conversions: ["item_id"],
  menu_settings: ["business_id"],
  recurring_order_items: ["recurring_order_id", "item_id"],
};

/** Column defaults applied on insert (beyond id / timestamps). */
const DEFAULTS = {
  tasks: { status: "open", media_urls: [], approval_status: null, photo_url: null, completed_at: null },
  faults: { status: "needs_handling", photo_urls: [], assigned_to: null, work_price: null, pay_approval_status: null },
  salary_issues: { status: "open", status_updated_by: null, status_updated_at: null },
  attendance: { clock_out: null, within_radius: null, position_id: null },
  event_requests: { status: "open" },
  agreement_signatures: { field_signatures: {}, signed_file_url: null, email_notified_at: null },
  inventory_orders: { status: "requested", received_quantity: null, batch_id: null },
  inventory_waste: { deducted: false },
};

function splitTopLevel(str, sep = ",") {
  const out = [];
  let depth = 0;
  let cur = "";
  let quoted = false;
  for (const ch of str) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && (ch === "(" || ch === "{" || ch === "[")) depth++;
    if (!quoted && (ch === ")" || ch === "}" || ch === "]")) depth--;
    if (ch === sep && depth === 0 && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.length) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Parse a select string into [{kind:"col",name,alias} | {kind:"embed",alias,source,cols}]. */
function parseSelect(sel) {
  if (!sel) return [{ kind: "star" }];
  return splitTopLevel(sel.replace(/\s+/g, "")).map((part) => {
    const paren = part.indexOf("(");
    if (paren > -1) {
      let head = part.slice(0, paren);
      const inner = part.slice(paren + 1, -1);
      let alias = null;
      if (head.includes(":")) [alias, head] = head.split(":");
      const source = head.split("!")[0];
      return { kind: "embed", alias: alias ?? source, source, cols: parseSelect(inner) };
    }
    if (part === "*") return { kind: "star" };
    let alias = null;
    let name = part;
    if (name.includes(":")) [alias, name] = name.split(":");
    name = name.split("::")[0];
    return { kind: "col", name, alias: alias ?? name };
  });
}

function coerce(raw) {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  return raw;
}

const TS_RE = /^\d{4}-\d{2}-\d{2}T/;

function compare(a, b) {
  if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1;
  if (typeof a === "number" || typeof b === "number") return Number(a) - Number(b);
  if (typeof a === "string" && typeof b === "string" && TS_RE.test(a) && TS_RE.test(b)) {
    return Date.parse(a) - Date.parse(b);
  }
  if (typeof a === "string" && typeof b === "string" && TS_RE.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b)) {
    return Date.parse(a) - Date.parse(b + "T00:00:00Z");
  }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function looseEq(a, b) {
  if (a == null || b == null) return a == b;
  if (typeof a === "boolean") return String(a) === String(b);
  if (typeof a === "number") return a === Number(b);
  return String(a) === String(b);
}

function parseList(v) {
  // (a,b,"c d")
  const inner = v.replace(/^\(/, "").replace(/\)$/, "");
  return splitTopLevel(inner).map(coerce);
}

function parseArrayLiteral(v) {
  if (v.startsWith("[")) return JSON.parse(v);
  const inner = v.replace(/^\{/, "").replace(/\}$/, "");
  return splitTopLevel(inner).map((s) => {
    const c = coerce(s);
    return typeof c === "string" && /^-?\d+(\.\d+)?$/.test(c) ? Number(c) : c;
  });
}

/** Build a row predicate from a single `col=op.value` filter. */
function predicate(col, expr) {
  let negate = false;
  if (expr.startsWith("not.")) {
    negate = true;
    expr = expr.slice(4);
  }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const val = expr.slice(dot + 1);
  const get = (row) => {
    // json path a->>b
    if (col.includes("->")) {
      const [base, ...rest] = col.split(/->>?/);
      let v = row[base];
      for (const k of rest) v = v?.[k];
      return v;
    }
    return row[col];
  };
  let test;
  switch (op) {
    case "eq": test = (r) => looseEq(get(r), coerce(val)); break;
    case "neq": test = (r) => !looseEq(get(r), coerce(val)); break;
    case "gt": test = (r) => get(r) != null && compare(get(r), coerce(val)) > 0; break;
    case "gte": test = (r) => get(r) != null && compare(get(r), coerce(val)) >= 0; break;
    case "lt": test = (r) => get(r) != null && compare(get(r), coerce(val)) < 0; break;
    case "lte": test = (r) => get(r) != null && compare(get(r), coerce(val)) <= 0; break;
    case "is": test = (r) => (coerce(val) === null ? get(r) == null : get(r) === coerce(val)); break;
    case "in": {
      const list = parseList(val);
      test = (r) => list.some((x) => looseEq(get(r), x));
      break;
    }
    case "cs": {
      const need = parseArrayLiteral(val);
      test = (r) => Array.isArray(get(r)) && need.every((n) => get(r).some((x) => looseEq(x, n)));
      break;
    }
    case "ov": {
      const need = parseArrayLiteral(val);
      test = (r) => Array.isArray(get(r)) && need.some((n) => get(r).some((x) => looseEq(x, n)));
      break;
    }
    case "like":
    case "ilike": {
      const re = new RegExp("^" + val.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*") + "$", op === "ilike" ? "i" : "");
      test = (r) => re.test(String(get(r) ?? ""));
      break;
    }
    default:
      console.warn(`[mock] unsupported filter op ${op} on ${col}`);
      test = () => true;
  }
  return negate ? (r) => !test(r) : test;
}

/** `or=(a.eq.1,b.is.null)` */
function orPredicate(expr) {
  const parts = splitTopLevel(expr.replace(/^\(/, "").replace(/\)$/, ""));
  const preds = parts.map((p) => {
    if (p.startsWith("and(")) {
      const sub = splitTopLevel(p.slice(4, -1)).map((q) => {
        const i = q.indexOf(".");
        return predicate(q.slice(0, i), q.slice(i + 1));
      });
      return (r) => sub.every((s) => s(r));
    }
    const i = p.indexOf(".");
    return predicate(p.slice(0, i), p.slice(i + 1));
  });
  return (r) => preds.some((p) => p(r));
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

export class MockDb {
  constructor(tables) {
    this.tables = tables;
    this.log = [];
  }

  table(name) {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  project(tableName, row, select) {
    const out = {};
    for (const s of select) {
      if (s.kind === "star") Object.assign(out, row);
      else if (s.kind === "col") out[s.alias] = row[s.name] ?? null;
      else if (s.kind === "embed") {
        if (CHILD_FK[s.source]) {
          const fk = CHILD_FK[s.source];
          out[s.alias] = this.table(s.source)
            .filter((c) => c[fk] === row.id)
            .map((c) => this.project(s.source, c, s.cols));
        } else if (FK_TABLES[s.source] && s.source in row) {
          const target = this.table(FK_TABLES[s.source]).find((t) => t.id === row[s.source]);
          out[s.alias] = target ? this.project(FK_TABLES[s.source], target, s.cols) : null;
        } else if (this.tables[s.source]) {
          // embed by table name: one-to-many from <table>.<singular>_id or many-to-one via <source>_id
          const fkGuess = tableName.replace(/s$/, "") + "_id";
          const singleFk = s.source.replace(/s$/, "") + "_id";
          if (row[singleFk] !== undefined) {
            const target = this.table(s.source).find((t) => t.id === row[singleFk]);
            out[s.alias] = target ? this.project(s.source, target, s.cols) : null;
          } else {
            out[s.alias] = this.table(s.source)
              .filter((c) => c[fkGuess] === row.id)
              .map((c) => this.project(s.source, c, s.cols));
          }
        } else out[s.alias] = null;
      }
    }
    return out;
  }

  filterRows(rows, params) {
    let out = rows;
    for (const [key, value] of params) {
      if (RESERVED.has(key)) continue;
      if (key === "or") out = out.filter(orPredicate(value));
      else if (key === "and") {
        const p = splitTopLevel(value.slice(1, -1)).map((q) => {
          const i = q.indexOf(".");
          return predicate(q.slice(0, i), q.slice(i + 1));
        });
        out = out.filter((r) => p.every((f) => f(r)));
      } else if (key.includes(".")) {
        // filter on embedded resource (e.g. profiles.role=eq.x) — ignore
        continue;
      } else out = out.filter(predicate(key, value));
    }
    return out;
  }

  /**
   * Handle one REST request. Returns {status, body, headers}.
   * `path` is the table (or `rpc/<fn>`), `params` a URLSearchParams.
   */
  handle(method, path, params, headers, bodyText) {
    const prefer = headers["prefer"] ?? "";
    const accept = headers["accept"] ?? "";
    const wantsObject = accept.includes("vnd.pgrst.object");
    const tableName = path;
    const select = parseSelect(params.get("select"));
    const respond = (rows, status = 200) => {
      let projected = rows.map((r) => this.project(tableName, r, select));
      const respHeaders = { "content-type": "application/json" };
      if (prefer.includes("count=")) respHeaders["content-range"] = `0-${Math.max(0, projected.length - 1)}/${projected.length}`;
      if (method === "HEAD" || (method !== "GET" && !prefer.includes("return=representation"))) {
        return { status: method === "GET" || method === "HEAD" ? 200 : status === 201 ? 201 : 204, body: method === "HEAD" ? "" : "", headers: respHeaders };
      }
      if (wantsObject) {
        if (projected.length !== 1) {
          return {
            status: 406,
            body: JSON.stringify({ code: "PGRST116", details: `The result contains ${projected.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }),
            headers: respHeaders,
          };
        }
        return { status, body: JSON.stringify(projected[0]), headers: respHeaders };
      }
      return { status, body: JSON.stringify(projected), headers: respHeaders };
    };

    const now = new Date().toISOString();

    if (method === "GET" || method === "HEAD") {
      let rows = this.filterRows(this.table(tableName), params);
      const order = params.get("order");
      if (order) {
        const keys = order.split(",").map((o) => {
          const [col, ...mods] = o.split(".");
          const desc = mods.includes("desc");
          // Postgres default: nulls last ascending, nulls first descending.
          const nullsFirst = mods.includes("nullsfirst") ? true : mods.includes("nullslast") ? false : desc;
          return { col, desc, nullsFirst };
        });
        rows = [...rows].sort((a, b) => {
          for (const k of keys) {
            const av = a[k.col];
            const bv = b[k.col];
            if (av == null && bv == null) continue;
            if (av == null) return k.nullsFirst ? -1 : 1;
            if (bv == null) return k.nullsFirst ? 1 : -1;
            const c = compare(av, bv);
            if (c !== 0) return k.desc ? -c : c;
          }
          return 0;
        });
      }
      const offset = Number(params.get("offset") ?? 0);
      const limit = params.get("limit");
      const total = rows.length;
      rows = rows.slice(offset, limit ? offset + Number(limit) : undefined);
      const res = respond(rows);
      if (prefer.includes("count=")) res.headers["content-range"] = `${offset}-${offset + rows.length - 1}/${total}`;
      return res;
    }

    const body = bodyText ? JSON.parse(bodyText) : null;

    if (method === "POST") {
      const items = Array.isArray(body) ? body : [body];
      const table = this.table(tableName);
      const upsert = prefer.includes("resolution=merge-duplicates") || prefer.includes("resolution=ignore-duplicates");
      const conflictCols = params.get("on_conflict")?.split(",") ?? NATURAL_KEYS[tableName] ?? ["id"];
      const out = [];
      for (const item of items) {
        if (upsert) {
          const existing = table.find((r) => conflictCols.every((c) => item[c] !== undefined && looseEq(r[c], item[c])));
          if (existing) {
            if (prefer.includes("merge-duplicates")) Object.assign(existing, item, "updated_at" in existing ? { updated_at: now } : {});
            out.push(existing);
            continue;
          }
        }
        const row = {
          ...(NATURAL_KEYS[tableName] ? {} : { id: randomUUID() }),
          created_at: now,
          updated_at: now,
          ...(DEFAULTS[tableName] ?? {}),
          ...item,
        };
        table.push(row);
        out.push(row);
      }
      return respond(out, 201);
    }

    if (method === "PATCH") {
      const rows = this.filterRows(this.table(tableName), params);
      for (const r of rows) Object.assign(r, body, "updated_at" in r && !("updated_at" in body) ? { updated_at: now } : {});
      return respond(rows);
    }

    if (method === "DELETE") {
      const table = this.table(tableName);
      const rows = this.filterRows(table, params);
      this.tables[tableName] = table.filter((r) => !rows.includes(r));
      return respond(rows);
    }

    return { status: 405, body: "{}", headers: {} };
  }
}
