import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { PageLoader } from "@/components/ui";
import { Login } from "@/pages/Login";
import { ResetPassword } from "@/pages/ResetPassword";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Dashboard } from "@/pages/Dashboard";
import { Placeholder } from "@/pages/Placeholder";

export function App() {
  const { loading, session } = useAuth();

  if (loading) return <PageLoader label="טוען את המערכת..." />;

  return (
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
        <Route index element={<Dashboard />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="platform" element={<Placeholder title="סקירת פלטפורמה" feature={null} />} />
        <Route path="businesses" element={<Placeholder title="עסקים" feature={null} />} />
        <Route path="platform-users" element={<Placeholder title="משתמשים" feature={null} />} />
        <Route path="users" element={<Placeholder title="משתמשים וצוות" feature={null} />} />
        <Route path="shifts" element={<Placeholder title="משמרות" feature="shifts" />} />
        <Route path="tasks" element={<Placeholder title="משימות" feature="tasks" />} />
        <Route path="attendance" element={<Placeholder title="שעון נוכחות" feature="attendance" />} />
        <Route path="payroll" element={<Placeholder title="חישוב שכר" feature="payroll" />} />
        <Route path="inventory" element={<Placeholder title="סחורות ומלאי" feature="inventory" />} />
        <Route path="faults" element={<Placeholder title="דיווח תקלות" feature="faults" />} />
        <Route path="agreements" element={<Placeholder title="הסכמים וחתימות" feature="agreements" />} />
        <Route path="form101" element={<Placeholder title="טופס 101" feature="forms" />} />
        <Route path="events" element={<Placeholder title="אירועים" feature="events" />} />
        <Route path="settings" element={<Placeholder title="הגדרות עסק" feature={null} />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
