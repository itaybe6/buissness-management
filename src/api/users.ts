import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/compressImage";
import type { Profile, UserRole, WageType } from "@/types/database";

function throwDbError(error: { message: string } | null) {
  if (error) throw error;
}

export async function uploadProfileAvatar(userId: string, file: File): Promise<string> {
  const compressed = await compressImage(file, { maxWidth: 512, maxHeight: 512, quality: 0.85 });
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, compressed, {
    upsert: true,
    contentType: "image/jpeg",
  });
  throwDbError(error);
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}
/** List profiles. Super admin omits businessId to get everyone (RLS allows). */
export function useProfiles(businessId?: string | null) {
  return useQuery({
    queryKey: ["profiles", businessId ?? "all"],
    queryFn: async (): Promise<Profile[]> => {
      let q = supabase.from("profiles").select("*").order("created_at", { ascending: true });
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
}

export interface CreateUserInput {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  business_id?: string | null;
  department_id?: string | null;
  phone?: string;
  hourly_rate?: number;
  wage_type?: WageType;
  pension_active?: boolean;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const { data, error } = await supabase.functions.invoke("create-user", { body: input });
      if (error) {
        // On a non-2xx response supabase-js leaves `data` empty and keeps the body on
        // error.context — read it so the user sees the real reason, not the generic line.
        throw new Error(translateCreateError(await functionErrorMessage(error, data)));
      }
      if ((data as { error?: string })?.error) throw new Error(translateCreateError((data as { error: string }).error));
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Profile> & { id: string }) => {
      const { id, ...rest } = input;
      const { data, error } = await supabase.from("profiles").update(rest).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("לא ניתן לעדכן את המשתמש — אין הרשאה או שהמשתמש לא נמצא");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) {
        throw new Error(translateDeleteError(await functionErrorMessage(error, data)));
      }
      if ((data as { error?: string })?.error) {
        throw new Error(translateDeleteError((data as { error: string }).error));
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

async function functionErrorMessage(error: { message: string; context?: Response }, data: unknown): Promise<string> {
  const fromData = (data as { error?: string } | null)?.error;
  if (fromData) return fromData;
  const ctx = error.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.clone().json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* body already consumed or not JSON */
    }
  }
  return error.message;
}

function translateDeleteError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("not found") || m.includes("failed to send") || m.includes("fetch")) {
    return "פונקציית מחיקת המשתמש (delete-user) לא פרוסה. ראו README.";
  }
  if (m.includes("cannot delete self")) return "לא ניתן למחוק את המשתמש המחובר";
  if (m.includes("forbidden")) return "אין לך הרשאה למחוק משתמש זה";
  if (m.includes("user not found")) return "המשתמש לא נמצא";
  return msg || "שגיאה במחיקת המשתמש";
}

function translateCreateError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("role_not_in_db") || (m.includes("invalid input value for enum") && m.includes("user_role")))
    return "התפקיד שנבחר עוד לא קיים במסד הנתונים. יש להריץ את המיגרציה שמוסיפה אותו (למנהלת אירועים: 20260715120000_event_manager_role_enum.sql) ולנסות שוב.";
  if (m.includes("database error"))
    return "מסד הנתונים נכשל ביצירת הפרופיל של המשתמש. לרוב זו מיגרציה שלא הורצה (תפקיד חדש או טבלת תפקידים) — בדקו את ה־Auth logs ב-Supabase לפירוט.";
  if (m.includes("not found") || m.includes("failed to send") || m.includes("fetch"))
    return "פונקציית יצירת המשתמש (create-user) לא פרוסה. ראו README. בינתיים אפשר ליצור משתמש דרך לוח Supabase.";
  if (m.includes("seat_limit_reached"))
    return "העסק הגיע למגבלת המשתמשים שהוגדרה לו. הגדילו את המגבלה בעמוד העסק כדי להוסיף משתמש נוסף.";
  if (m.includes("already") || m.includes("exists")) return "כתובת המייל כבר רשומה במערכת";
  if (m.includes("forbidden")) return "אין לך הרשאה ליצור משתמש כזה";
  if (m.includes("password")) return "הסיסמה חייבת להכיל לפחות 6 תווים";
  return msg || "שגיאה ביצירת המשתמש";
}
