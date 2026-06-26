import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { PageLoader } from "@/components/ui";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/login" replace />;
  // Session exists but profile row not created yet
  if (!profile) return <PageLoader label="טוען פרופיל..." />;

  return <>{children}</>;
}
