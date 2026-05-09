import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/app/layouts/app-shell";
import { ProtectedRoute } from "@/app/layouts/protected-route";
import { AdminPage } from "@/features/admin/admin-page";
import { AppointmentDetailPage } from "@/features/appointments/appointment-detail-page";
import { AppointmentsPage } from "@/features/appointments/appointments-page";
import { LoginPage } from "@/features/auth/login-page";
import { ClinicDetailPage } from "@/features/clinics/clinic-detail-page";
import { ClinicsPage } from "@/features/clinics/clinics-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { EncounterDetailPage } from "@/features/encounters/encounter-detail-page";
import { EncountersListPage } from "@/features/encounters/encounters-list-page";
import { ExpensesPage } from "@/features/expenses/expenses-page";
import { EmployeeDetailPage } from "@/features/hr/employee-detail-page";
import { HrPage } from "@/features/hr/hr-page";
import { PatientDetailPage } from "@/features/patients/patient-detail-page";
import { PatientsPage } from "@/features/patients/patients-page";
import { ProfileGate } from "@/features/profile/profile-gate";
import { ReportsPage } from "@/features/reports/reports-page";
import { DoctorRevenueGate } from "@/features/revenue/doctor-revenue-gate";
import { RevenueGate } from "@/features/revenue/revenue-gate";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "patients", element: <PatientsPage /> },
      { path: "patients/:id", element: <PatientDetailPage /> },
      { path: "encounters", element: <EncountersListPage /> },
      { path: "encounters/:id", element: <EncounterDetailPage /> },
      { path: "encounters/demo", element: <Navigate to="/encounters" replace /> },
      { path: "appointments", element: <AppointmentsPage /> },
      { path: "appointments/:id", element: <AppointmentDetailPage /> },
      { path: "clinics", element: <ClinicsPage /> },
      { path: "clinics/:id", element: <ClinicDetailPage /> },
      { path: "expenses", element: <ExpensesPage /> },
      { path: "revenue", element: <RevenueGate /> },
      { path: "clinic-revenue", element: <Navigate to="/revenue" replace /> },
      { path: "doctor-revenue", element: <DoctorRevenueGate /> },
      { path: "profile", element: <ProfileGate /> },
      { path: "hr", element: <HrPage /> },
      { path: "hr/employees/:id", element: <EmployeeDetailPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "admin", element: <AdminPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
