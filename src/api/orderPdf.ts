import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * The printable purchase order.
 *
 * The document is built by the `order-pdf` edge function rather than in the
 * browser: it reads the batch, the catalog and the supplier's price list with
 * the service role, so the sheet the supplier receives always matches the
 * database — not whatever happened to be in the client's cache.
 */

export interface OrderPdfRequest {
  /** The batch key — `batch_id` when the order has one, otherwise the row id. */
  batchId: string;
  supplierName: string;
}

/** Turn an invoke failure into something the manager can actually act on. */
async function describeFailure(error: unknown): Promise<string> {
  const context = (error as { context?: unknown }).context;
  const response =
    context && typeof (context as Response).status === "number" ? (context as Response) : null;

  if (response?.status === 404) {
    return "פונקציית ה-PDF עדיין לא הותקנה בשרת. הריצו בטרמינל: supabase functions deploy order-pdf";
  }
  if (response?.status === 401) return "פג תוקף ההתחברות. התחברו מחדש ונסו שוב.";
  if (response?.status === 403) return "אין לכם הרשאה להפיק מסמך הזמנה.";

  if (response && typeof response.clone === "function") {
    try {
      const body = await response.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      // not a JSON body — fall through to the generic message
    }
  }

  const message = error instanceof Error ? error.message : "";
  if (/failed to fetch|networkerror/i.test(message)) {
    return "אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.";
  }
  return message || "שגיאה ביצירת מסמך ההזמנה";
}

/** Windows and macOS both reject these in file names. */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari needs the URL to outlive the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Downloads the order document. `busyBatchId` drives the per-card spinner, so
 * only the order being generated shows a wait state.
 */
export function useOrderPdfDownload(businessId: string | null) {
  const [busyBatchId, setBusyBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(
    async (request: OrderPdfRequest) => {
      if (!businessId) return;
      setBusyBatchId(request.batchId);
      setError(null);
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("order-pdf", {
          body: { business_id: businessId, batch_id: request.batchId },
        });
        if (invokeError) throw invokeError;

        const blob =
          data instanceof Blob ? data : new Blob([data as BlobPart], { type: "application/pdf" });
        if (blob.size === 0) throw new Error("המסמך חזר ריק מהשרת");

        const shortId = request.batchId.split("-")[0].toUpperCase();
        saveBlob(blob, safeFileName(`הזמנה ${request.supplierName} ${shortId}.pdf`));
      } catch (e) {
        setError(await describeFailure(e));
      } finally {
        setBusyBatchId(null);
      }
    },
    [businessId],
  );

  return { download, busyBatchId, error, clearError: () => setError(null) };
}
