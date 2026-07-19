import { PageLoader, ErrorState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useAgreements } from "@/api/agreements";
import { DOCUMENTS_EDIT_ROLES, DOCUMENTS_OVERVIEW_ROLES, OFFICE_RECEIPTS_ROLES } from "@/lib/constants";
import { EmployeeDocumentsView, ManagerDocumentsView } from "./agreements/views";
import { Icon } from "@/components/ui";

export function Agreements() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: agreements, isLoading, isError, refetch } = useAgreements(businessId);

  const isOverview = profile && DOCUMENTS_OVERVIEW_ROLES.includes(profile.role);
  const canEdit = profile && DOCUMENTS_EDIT_ROLES.includes(profile.role);
  const canReceipts = profile && OFFICE_RECEIPTS_ROLES.includes(profile.role);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const title = canReceipts && !canEdit ? "מסמכים" : isOverview ? "מסמכי עובדים" : canEdit ? "מסמכים" : "המסמכים שלי";
  const subtitle = canReceipts && !canEdit
    ? "חשבוניות, קבלות, מעקב מסמכי עובדים וטפסי 101"
    : isOverview
      ? "מעקב סטטוס מסמכים, הסכמים וחתימות דיגיטליות"
      : canEdit
        ? "לחתימה אישית · ניהול הסכמים לצוות"
        : "מילוי וחתימה על המסמכים שלך";

  return (
    <div className="w-full animate-fadeUp">
      <header className="docs-page-header">
        <div className="hidden md:block">
          <h1 className="text-[22px] font-extrabold tracking-tight">{title}</h1>
          <p className="mt-0.5 text-[13.5px] text-text-2">{subtitle}</p>
        </div>
        <div className="docs-hero md:hidden">
          <span className="docs-hero__glyph" aria-hidden>
            <Icon name="history_edu" size={110} />
          </span>
          <div className="docs-hero__row">
            <span className="docs-hero__icon" aria-hidden>
              <Icon name="draw" size={24} />
            </span>
            <div className="docs-hero__copy">
              <h1 className="docs-hero__title">{title}</h1>
              <p className="docs-hero__sub">{subtitle}</p>
            </div>
          </div>
        </div>
      </header>

      {isOverview ? (
        <ManagerDocumentsView
          businessId={businessId!}
          agreements={agreements ?? []}
          canEdit={!!canEdit}
          canReceipts={!!canReceipts}
          profileId={profile!.id}
        />
      ) : (
        <EmployeeDocumentsView
          businessId={businessId!}
          employeeId={profile!.id}
          employeeName={profile!.full_name}
          agreements={agreements ?? []}
          canEditTemplates={!!canEdit}
          profileId={profile!.id}
        />
      )}
    </div>
  );
}
