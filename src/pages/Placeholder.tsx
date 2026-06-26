import { useAuth } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import type { FeatureKey } from "@/types/database";

/**
 * Temporary page for modules not yet implemented. It still respects feature
 * gating so disabled modules render a proper "not available" state.
 */
export function Placeholder({ title, feature }: { title: string; feature: FeatureKey | null }) {
  const { hasFeature } = useAuth();

  if (feature && !hasFeature(feature)) {
    return (
      <div className="mx-auto max-w-[900px] animate-fadeUp">
        <EmptyState
          icon="lock"
          title="המודול אינו פעיל לעסק זה"
          description="פנו למנהל המערכת כדי להפעיל את המודול הזה."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <div className="mb-5">
        <div className="text-[24px] font-extrabold tracking-tight">{title}</div>
        <div className="mt-1 text-[14.5px] text-text-2">המסך הזה ייבנה בשלב הבא של הפיתוח.</div>
      </div>
      <EmptyState icon="construction" title="בבנייה" description="המודול יחובר לנתונים האמיתיים בקרוב." />
    </div>
  );
}
