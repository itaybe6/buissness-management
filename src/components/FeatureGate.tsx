import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import type { FeatureKey } from "@/types/database";

export function FeatureGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const { hasFeature } = useAuth();
  if (!hasFeature(feature)) {
    return (
      <div className="mx-auto max-w-[640px] animate-fadeUp py-10">
        <EmptyState icon="lock" title="המודול אינו פעיל" description="המודול הזה לא הופעל עבור העסק. פנו למנהל המערכת כדי להפעיל אותו." />
      </div>
    );
  }
  return <>{children}</>;
}
