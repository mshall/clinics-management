import { Suspense, type LazyExoticComponent, type ComponentType } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/app/layouts/app-shell";
import { ProtectedRoute } from "@/app/layouts/protected-route";
import { RouteLoadingFallback } from "@/components/route-loading-fallback";
import { LoginPage } from "@/features/auth/login-page";
import { SignupPage } from "@/features/signup/signup-page";
import { LegalDocumentPage } from "@/features/legal/legal-document-page";
import { ForgotPasswordPage } from "@/features/auth/forgot-password-page";
import { ResetPasswordPage } from "@/features/auth/reset-password-page";
import { ImportWizardPage } from "@/features/onboarding/import-wizard-page";
import { OnboardingPage } from "@/features/onboarding/onboarding-page";
import { AppointmentReschedulePage } from "@/features/appointments/appointment-reschedule-page";
import { ClinicalTemplatesRedirect } from "@/features/clinical/clinical-templates-redirect";
import { EncounterDetailNavGate } from "@/components/encounter-detail-nav-gate";
import { NavGate } from "@/components/nav-gate";
import { PlatformLayout } from "@/features/platform/platform-layout";
import { ProfileGate } from "@/features/profile/profile-gate";
import { DoctorRevenueGate } from "@/features/revenue/doctor-revenue-gate";
import { RevenueGate } from "@/features/revenue/revenue-gate";
import {
  AdminPage,
  AppointmentDetailPage,
  AppointmentsPage,
  ClinicDetailPage,
  ClinicsPage,
  CustomerSupportPage,
  DashboardPage,
  EmployeeDetailPage,
  EmployeeProfilePage,
  EncounterDetailPage,
  EncountersListPage,
  ExpensesPage,
  FrontDeskBoardPage,
  GuideBookPage,
  HrPage,
  OperationsPage,
  PatientDetailPage,
  PatientsPage,
  PlatformClinicsTab,
  PlatformDrugDatasetsTab,
  PlatformPlansTab,
  PlatformKiorexRatesTab,
  PlatformVerificationsTab,
  PlatformCommissionDisputesTab,
  ClinicianVerificationPage,
  PlatformInsightsTab,
  PlatformMarketsTab,
  PlatformOrganizationsTab,
  MarketplaceListingProfilePage,
  PlatformOverviewPage,
  PlatformUsersTab,
  ReportsPage,
  WaitingRoomPage,
} from "@/lib/lazy-pages";

function defer(Page: LazyExoticComponent<ComponentType>) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Page />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignupPage /> },
  { path: "/legal/:docId", element: <LegalDocumentPage /> },
  { path: "/r/:token", element: <AppointmentReschedulePage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <NavGate tab="dashboard">{defer(DashboardPage)}</NavGate> },
      { path: "onboarding", element: <OnboardingPage /> },
      { path: "onboarding/import", element: <ImportWizardPage /> },
      { path: "patients", element: <NavGate tab="patients">{defer(PatientsPage)}</NavGate> },
      { path: "patients/:id", element: <NavGate tab="patients">{defer(PatientDetailPage)}</NavGate> },
      { path: "encounters", element: <NavGate tab="encounters">{defer(EncountersListPage)}</NavGate> },
      {
        path: "encounters/:id",
        element: (
          <EncounterDetailNavGate>
            {defer(EncounterDetailPage)}
          </EncounterDetailNavGate>
        ),
      },
      {
        path: "clinical/templates",
        element: (
          <NavGate tab="clinics">
            <ClinicalTemplatesRedirect />
          </NavGate>
        ),
      },
      { path: "encounters/demo", element: <Navigate to="/encounters" replace /> },
      { path: "appointments", element: <NavGate tab="appointments">{defer(AppointmentsPage)}</NavGate> },
      { path: "appointments/:id", element: <NavGate tab="appointments">{defer(AppointmentDetailPage)}</NavGate> },
      { path: "front-desk/board", element: <NavGate tab="appointments">{defer(FrontDeskBoardPage)}</NavGate> },
      { path: "front-desk/waiting-room", element: <NavGate tab="appointments">{defer(WaitingRoomPage)}</NavGate> },
      { path: "operations", element: <NavGate tab="operations">{defer(OperationsPage)}</NavGate> },
      { path: "clinics", element: <NavGate tab="clinics">{defer(ClinicsPage)}</NavGate> },
      { path: "clinics/:id", element: <NavGate tab="clinics">{defer(ClinicDetailPage)}</NavGate> },
      {
        path: "clinics/:clinicId/kiorex-listings/:listingId/profile",
        element: <NavGate tab="clinics">{defer(MarketplaceListingProfilePage)}</NavGate>,
      },
      { path: "expenses", element: <NavGate tab="expenses">{defer(ExpensesPage)}</NavGate> },
      { path: "revenue", element: <RevenueGate /> },
      { path: "clinic-revenue", element: <Navigate to="/revenue" replace /> },
      { path: "doctor-revenue", element: <DoctorRevenueGate /> },
      { path: "profile", element: <ProfileGate /> },
      { path: "profile/verification", element: <NavGate tab="profile">{defer(ClinicianVerificationPage)}</NavGate> },
      { path: "hr", element: <NavGate tab="hr">{defer(HrPage)}</NavGate> },
      { path: "hr/employees/:id", element: <NavGate tab="hr">{defer(EmployeeDetailPage)}</NavGate> },
      { path: "hr/employees/:id/profile", element: <NavGate tab="hr">{defer(EmployeeProfilePage)}</NavGate> },
      { path: "reports", element: <NavGate tab="reports">{defer(ReportsPage)}</NavGate> },
      {
        path: "customer-support",
        element: (
          <NavGate tab="customer_support">
            {defer(CustomerSupportPage)}
          </NavGate>
        ),
      },
      {
        path: "platform",
        element: <PlatformLayout />,
        children: [
          { index: true, element: defer(PlatformOverviewPage) },
          { path: "markets", element: defer(PlatformMarketsTab) },
          { path: "organizations", element: defer(PlatformOrganizationsTab) },
          { path: "users", element: defer(PlatformUsersTab) },
          { path: "clinics", element: defer(PlatformClinicsTab) },
          { path: "insights", element: defer(PlatformInsightsTab) },
          { path: "drug-datasets", element: defer(PlatformDrugDatasetsTab) },
          { path: "plans", element: defer(PlatformPlansTab) },
          { path: "kiorex-rates", element: defer(PlatformKiorexRatesTab) },
          { path: "verifications", element: defer(PlatformVerificationsTab) },
          { path: "disputes", element: defer(PlatformCommissionDisputesTab) },
        ],
      },
      { path: "admin", element: <NavGate tab="admin">{defer(AdminPage)}</NavGate> },
      { path: "guide", element: defer(GuideBookPage) },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);