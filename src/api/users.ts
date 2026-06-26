import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Profile, UserRole } from "@/types/database";

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
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const { data, error } = await supabase.functions.invoke("create-user", { body: input });
      if (error) {
        // Surface the function's JSON error message when available
        const msg = (data as { error?: string })?.error || error.message;
        throw new Error(translateCreateError(msg));
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

function translateCreateError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("not found") || m.includes("failed to send") || m.includes("fetch"))
    return "פונקציית יצירת המשתמש (create-user) לא פרוסה. ראו README. בינתיים אפשר ליצור משתמש דרך לוח Supabase.";
  if (m.includes("already") || m.includes("exists")) return "כתובת המייל כבר רשומה במערכת";
  if (m.includes("forbidden")) return "אין לך הרשאה ליצור משתמש כזה";
  if (m.includes("password")) return "הסיסמה חייבת להכיל לפחות 6 תווים";
  return msg || "שגיאה ביצירת המשתמש";
}
