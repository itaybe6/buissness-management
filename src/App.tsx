import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { getHomePath } from "@/lib/constants";
import { GlobalLoadingBar, PageLoader } from "@/components/ui";
import { Login } from "@/pages/Login";
import { ResetPassword } from "@/pages/ResetPassword";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Dashboard } from "@/pages/Dashboard";
import { Platform } from "@/pages/superadmin/Platform";
import { Businesses } from "@/pages/superadmin/Businesses";
import { BusinessDetail } from "@/pages/superadmin/BusinessDetail";
import { PlatformUsers } from "@/pages/superadmin/PlatformUsers";
import { Users } from "@/pages/Users";
import { Settings } from "@/pages/Settings";
import { Shifts } from "@/pages/Shifts";
import { ShiftReports } from "@/pages/ShiftReports";
import { Faults } from "@/pages/Faults";
import { Tasks } from "@/pages/Tasks";
import { Attendance } from "@/pages/Attendance";
import { MyShifts } from "@/pages/MyShifts";
import { Payroll } from "@/pages/Payroll";
import { EmployeePayrollDetail } from "@/pages/EmployeePayrollDetail";
import { Inventory } from "@/pages/Inventory";
import { InventoryOrder } from "@/pages/InventoryOrder";
import { Waste } from "@/pages/Waste";
// Lazy — pulls in the PDF rendering/stamping libraries only when opened.
const Agreements = lazy(() => import("@/pages/Agreements").then((m) => ({ default: m.Agreements })));
import { Events } from "@/pages/Events";
import { EventDetail } from "@/pages/EventDetail";
import { Profile } from "@/pages/Profile";
import { FeatureGate } from "@/components/FeatureGate";

function HomeRedirect() {
  const { profile } = useAuth();
  return <Navigate to={getHomePath(profile?.role ?? "employee")} replace />;
}

function DashboardRoute() {
  return <Dashboard />;
}

export function App() {
  const { loading, session } = useAuth();

  if (loading) return <PageLoader label="טוען את המערכת..." />;

  return (
    <>
      <GlobalLoadingBar />
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={<DashboardRoute />} />
          <Route path="platform" element={<Platform />} />
          <Route path="businesses" element={<Businesses />} />
          <Route path="businesses/:id" element={<BusinessDetail />} />
          <Route path="platform-users" element={<PlatformUsers />} />
          <Route path="users" element={<Users />} />
          <Route path="shifts" element={<FeatureGate feature="shifts"><Shifts /></FeatureGate>} />
          <Route path="shift-reports" element={<FeatureGate feature="shift_reports"><ShiftReports /></FeatureGate>} />
          <Route path="tasks" element={<FeatureGate feature="tasks"><Tasks /></FeatureGate>} />
          <Route path="attendance" element={<FeatureGate feature="attendance"><Attendance /></FeatureGate>} />
          <Route path="my-shifts" element={<MyShifts />} />
          <Route path="payroll" element={<FeatureGate feature="payroll"><Payroll /></FeatureGate>} />
          <Route path="payroll/:employeeId" element={<FeatureGate feature="payroll"><EmployeePayrollDetail /></FeatureGate>} />
          <Route path="inventory" element={<FeatureGate feature="inventory"><Inventory /></FeatureGate>} />
          <Route path="inventory/order" element={<FeatureGate feature="inventory"><InventoryOrder /></FeatureGate>} />
          <Route path="waste" element={<FeatureGate feature="waste"><Waste /></FeatureGate>} />
          <Route path="faults" element={<FeatureGate feature="faults"><Faults /></FeatureGate>} />
          <Route path="agreements" element={<FeatureGate feature="agreements"><Suspense fallback={<PageLoader />}><Agreements /></Suspense></FeatureGate>} />
          <Route path="events" element={<FeatureGate feature="events"><Events /></FeatureGate>} />
          <Route path="events/:eventId" element={<FeatureGate feature="events"><EventDetail /></FeatureGate>} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
