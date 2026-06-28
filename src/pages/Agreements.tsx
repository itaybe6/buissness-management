import { PageLoader, ErrorState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useAgreements } from "@/api/agreements";
import { DOCUMENTS_EDIT_ROLES, DOCUMENTS_OVERVIEW_ROLES, OFFICE_RECEIPTS_ROLES } from "@/lib/constants";
import { EmployeeDocumentsView, ManagerDocumentsView } from "./agreements/views";

export function Agreements() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: agreements, isLoading, isError, refetch } = useAgreements(businessId);

  const isOverview = profile && DOCUMENTS_OVERVIEW_ROLES.includes(profile.role);
  const canEdit = profile && DOCUMENTS_EDIT_ROLES.includes(profile.role);
  const canReceipts = profile && OFFICE_RECEIPTS_ROLES.includes(profile.role);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const subtitle = canReceipts && !canEdit
    ? "חשבוניות, קבלות, מעקב מסמכי עובדים וטפסי 101"
    : isOverview
      ? "מעקב סטטוס מסמכים, תבניות וחתימות דיגיטליות"
      : "מילוי וחתימה על המסמכים שלך";

  return (
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <header className="mb-5">
        <h1 className="text-[22px] font-extrabold tracking-tight">{canReceipts && !canEdit ? "מסמכים" : "מסמכי עובדים"}</h1>
        <p className="mt-0.5 text-[13.5px] text-text-2">{subtitle}</p>
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
