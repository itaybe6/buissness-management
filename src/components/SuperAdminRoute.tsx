import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { PageLoader } from "@/components/ui";
import type { ReactNode } from "react";

export function SuperAdminRoute({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();

  if (loading) return <PageLoader />;
  if (profile?.role !== "super_admin") return <Navigate to="/" replace />;

  return <>{children}</>;
}
