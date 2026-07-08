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
import { OperationsPage } from "@/features/operations/operations-page";
import { EmployeeDetailPage } from "@/features/hr/employee-detail-page";
import { EmployeeProfilePage } from "@/features/hr/employee-profile-page";
import { HrPage } from "@/features/hr/hr-page";
import { PatientDetailPage } from "@/features/patients/patient-detail-page";
import { PatientsPage } from "@/features/patients/patients-page";
import { PlatformClinicsTab } from "@/features/platform/platform-clinics-tab";
import { PlatformLayout } from "@/features/platform/platform-layout";
import { PlatformOrganizationsTab } from "@/features/platform/platform-organizations-tab";
import { PlatformOverviewPage } from "@/features/platform/platform-overview-page";
import { PlatformUsersTab } from "@/features/platform/platform-users-tab";
import { ProfileGate } from "@/features/profile/profile-gate";
import { ReportsPage } from "@/features/reports/reports-page";
import { DoctorRevenueGate } from "@/features/revenue/doctor-revenue-gate";
import { RevenueGate } from "@/features/revenue/revenue-gate";
import { NavGate } from "@/components/nav-gate";

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
      { index: true, element: <NavGate tab="dashboard"><DashboardPage /></NavGate> },
      { path: "patients", element: <NavGate tab="patients"><PatientsPage /></NavGate> },
      { path: "patients/:id", element: <NavGate tab="patients"><PatientDetailPage /></NavGate> },
      { path: "encounters", element: <NavGate tab="encounters"><EncountersListPage /></NavGate> },
      { path: "encounters/:id", element: <NavGate tab="encounters"><EncounterDetailPage /></NavGate> },
      { path: "encounters/demo", element: <Navigate to="/encounters" replace /> },
      { path: "appointments", element: <NavGate tab="appointments"><AppointmentsPage /></NavGate> },
      { path: "appointments/:id", element: <NavGate tab="appointments"><AppointmentDetailPage /></NavGate> },
      { path: "operations", element: <NavGate tab="operations"><OperationsPage /></NavGate> },
      { path: "clinics", element: <NavGate tab="clinics"><ClinicsPage /></NavGate> },
      { path: "clinics/:id", element: <NavGate tab="clinics"><ClinicDetailPage /></NavGate> },
      { path: "expenses", element: <NavGate tab="expenses"><ExpensesPage /></NavGate> },
      { path: "revenue", element: <RevenueGate /> },
      { path: "clinic-revenue", element: <Navigate to="/revenue" replace /> },
      { path: "doctor-revenue", element: <DoctorRevenueGate /> },
      { path: "profile", element: <ProfileGate /> },
      { path: "hr", element: <NavGate tab="hr"><HrPage /></NavGate> },
      { path: "hr/employees/:id", element: <NavGate tab="hr"><EmployeeDetailPage /></NavGate> },
      { path: "hr/employees/:id/profile", element: <NavGate tab="hr"><EmployeeProfilePage /></NavGate> },
      { path: "reports", element: <NavGate tab="reports"><ReportsPage /></NavGate> },
      {
        path: "platform",
        element: <PlatformLayout />,
        children: [
          { index: true, element: <PlatformOverviewPage /> },
          { path: "organizations", element: <PlatformOrganizationsTab /> },
          { path: "users", element: <PlatformUsersTab /> },
          { path: "clinics", element: <PlatformClinicsTab /> },
        ],
      },
      { path: "admin", element: <NavGate tab="admin"><AdminPage /></NavGate> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
