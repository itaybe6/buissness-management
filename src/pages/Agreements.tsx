import { PageLoader, ErrorState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useAgreements } from "@/api/agreements";
import { DOCUMENTS_EDIT_ROLES, DOCUMENTS_OVERVIEW_ROLES } from "@/lib/constants";
import { EmployeeDocumentsView, ManagerDocumentsView } from "./agreements/views";

export function Agreements() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: agreements, isLoading, isError, refetch } = useAgreements(businessId);

  const isOverview = profile && DOCUMENTS_OVERVIEW_ROLES.includes(profile.role);
  const canEdit = profile && DOCUMENTS_EDIT_ROLES.includes(profile.role);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <header className="mb-5">
        <h1 className="text-[22px] font-extrabold tracking-tight">מסמכי עובדים</h1>
        <p className="mt-0.5 text-[13.5px] text-text-2">
          {isOverview ? "מעקב סטטוס מסמכים, תבניות וחתימות דיגיטליות" : "מילוי וחתימה על המסמכים שלך"}
        </p>
      </header>

      {isOverview ? (
        <ManagerDocumentsView businessId={businessId!} agreements={agreements ?? []} canEdit={!!canEdit} profileId={profile!.id} />
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
