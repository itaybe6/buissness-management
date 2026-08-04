// Supabase Edge Function: order-pdf
// Builds the printable purchase order for one supplier order batch and returns
// it as a real PDF (A4, Hebrew RTL). Layout lives in render.ts, the row →
// document mapping in data.ts; this file is only auth and IO.
//
// Deploy:
//   supabase functions deploy order-pdf
//
// No secrets to set: the Hebrew font is pulled from a CDN on the first request
// of an isolate and cached in memory from then on.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import { loadFonts } from "./fonts.ts";
import { renderOrderPdf } from "./render.ts";
import { buildOrderPdfData, type ItemRow, type OrderRow, type SupplierPrices, type SupplierRow } from "./data.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** The roles that may manage orders in the app — the document carries prices. */
const MANAGER_ROLES = ["manager", "office_manager", "super_admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser(token);
    const caller = userData?.user;
    if (!caller) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const businessId = String(body?.business_id ?? "");
    const batchId = String(body?.batch_id ?? "");
    if (!UUID.test(businessId) || !UUID.test(batchId)) {
      return json({ error: "missing or malformed business_id / batch_id" }, 400);
    }

    const admin = createClient(url, serviceKey);

    const { data: me } = await admin
      .from("profiles")
      .select("business_id, role")
      .eq("id", caller.id)
      .maybeSingle();
    if (!me || !MANAGER_ROLES.includes(me.role)) return json({ error: "forbidden" }, 403);
    if (me.role !== "super_admin" && me.business_id !== businessId) {
      return json({ error: "forbidden" }, 403);
    }

    /* ---- the order ------------------------------------------------ */

    const { data: orderRows, error: ordersError } = await admin
      .from("inventory_orders")
      .select("id, item_id, quantity, received_quantity, status, batch_id, supplier_id, ordered_by, created_at")
      .eq("business_id", businessId)
      .or(`batch_id.eq.${batchId},id.eq.${batchId}`);
    if (ordersError) return json({ error: ordersError.message }, 500);

    // Same grouping key the app uses: a batch is `batch_id`, or the single
    // row's own id for orders created before batching existed.
    const lines = ((orderRows ?? []) as OrderRow[]).filter((row) => (row.batch_id ?? row.id) === batchId);
    if (lines.length === 0) return json({ error: "ההזמנה לא נמצאה" }, 404);

    const supplierId = lines.find((l) => l.supplier_id)?.supplier_id ?? null;
    const itemIds = [...new Set(lines.map((l) => l.item_id))];

    const [itemsRes, categoriesRes, supplierRes, pricesRes, businessRes, ordererRes] = await Promise.all([
      admin
        .from("inventory_items")
        .select("id, name, unit, units_per_package, piece_unit, barcode, category_id")
        .in("id", itemIds),
      admin.from("inventory_categories").select("id, name").eq("business_id", businessId),
      supplierId
        ? admin
            .from("suppliers")
            .select("name, phone, tax_id, notes, delivery_days")
            .eq("id", supplierId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supplierId
        ? admin
            .from("supplier_items")
            .select("item_id, unit_price, price_unit")
            .eq("business_id", businessId)
            .eq("supplier_id", supplierId)
        : Promise.resolve({ data: [] }),
      admin.from("businesses").select("name").eq("id", businessId).maybeSingle(),
      lines[0].ordered_by
        ? admin.from("profiles").select("full_name").eq("id", lines[0].ordered_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const items = new Map<string, ItemRow>(((itemsRes.data ?? []) as ItemRow[]).map((i) => [i.id, i]));
    const categories = new Map<string, string>(
      ((categoriesRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
    );

    // item_id → { main?, piece? }, exactly like the app's price index.
    const prices = new Map<string, SupplierPrices>();
    for (const row of (pricesRes.data ?? []) as { item_id: string; unit_price: number; price_unit: string }[]) {
      const entry = prices.get(row.item_id) ?? {};
      if (row.price_unit === "piece") entry.piece = Number(row.unit_price);
      else entry.main = Number(row.unit_price);
      prices.set(row.item_id, entry);
    }

    /* ---- render ---------------------------------------------------- */

    const data = buildOrderPdfData({
      batchId,
      businessName: (businessRes.data as { name: string } | null)?.name ?? "העסק",
      lines,
      items,
      categories,
      prices,
      supplier: supplierRes.data as SupplierRow | null,
      orderedByName: (ordererRes.data as { full_name: string | null } | null)?.full_name ?? null,
      now: new Date(),
    });

    const fontBytes = await loadFonts();
    const pdf = await renderOrderPdf({ PDFDocument, rgb, fontkit }, fontBytes, data);

    const name = `הזמנה-${data.supplier.name}-${data.order.number}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
    return new Response(pdf, {
      headers: {
        ...cors,
        "Content-Type": "application/pdf",
        "Content-Disposition":
          `attachment; filename="order-${data.order.number}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
