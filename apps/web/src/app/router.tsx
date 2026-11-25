import { Suspense, type LazyExoticComponent, type ComponentType } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/app/layouts/app-shell";
import { ProtectedRoute } from "@/app/layouts/protected-route";
import { RouteLoadingFallback } from "@/components/route-loading-fallback";
import { LoginPage } from "@/features/auth/login-page";
import { KiorexCallbackPage } from "@/features/auth/kiorex-passport";
import { SignupPage } from "@/features/signup/signup-page";
import { MarketingHomePage } from "@/features/marketing/marketing-home-page";
import { LegalDocumentPage } from "@/features/legal/legal-document-page";
import { ForgotPasswordPage } from "@/features/auth/forgot-password-page";
import { ResetPasswordPage } from "@/features/auth/reset-password-page";
import { ImportWizardPage } from "@/features/onboarding/import-wizard-page";
import { TeamPage } from "@/features/admin/team-page";
import { AcceptInvitationPage } from "@/features/auth/accept-invitation-page";
import { RepConsolePage } from "@/features/rep/rep-console-page";
import { OnboardingPage } from "@/features/onboarding/onboarding-page";
import { AvailabilitySetupPage } from "@/features/onboarding/availability-setup-page";
import { OfflineTodayPage } from "@/features/pwa/offline-today-page";
import { PatientJoinPage } from "@/features/telehealth/patient-join-page";
import { TelehealthCallPage } from "@/features/telehealth/telehealth-call-page";
import { AppointmentReschedulePage } from "@/features/appointments/appointment-reschedule-page";
import { DepositPayPage } from "@/features/appointments/deposit-pay-page";
import { PublicBookingPage } from "@/features/kiorex/public-booking-page";
import { PublicShortLinkPage } from "@/features/growth/public-short-link";
import { PublicRxVerifyPage } from "@/features/prescriptions/public-rx-verify-page";
import { DevInboxPage } from "@/features/dev/dev-inbox-page";
import { ClinicalTemplatesRedirect } from "@/features/clinical/clinical-templates-redirect";
import { EncounterDetailNavGate } from "@/components/encounter-detail-nav-gate";
import { NavGate } from "@/components/nav-gate";
import { NurseHomeGate } from "@/features/nurse/nurse-home-gate";
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
  CashDrawerPage,
  AiReceptionistInboxPage,
  ClaimsWorkspacePage,
  InstallmentsPage,
  FrontDeskBoardPage,
  GuideBookPage,
  HelpCentrePage,
  HrPage,
  OperationsPage,
  PatientDetailPage,
  DuplicatePatientsPage,
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
  PlatformTenantConsolePage,
  MarketplaceListingProfilePage,
  KiorexPage,
  KiorexConnectPage,
  GrowthPage,
  CreditWalletPage,
  KiorexCommissionsPage,
  PlatformSubscriptionsTab,
  UpgradePlanPage,
  PromotionsPage,
  PlatformOverviewPage,
  PlatformUsersTab,
  ReportsPage,
  Rp04FinanceReportsPage,
  DataPrivacyPage,
  WaitingRoomPage,
  TodayRoutePage,
  CarePlansPage,
  CarePlanDetailPage,
  VisitRecordPage,
  MarPage,
  MarIndexPage,
  NurseServicesPage,
  NurseDispatchPage,
  NurseShiftsPage,
  NurseSafetyPage,
  NurseInboxPage,
  NurseFamilyPage,
  NurseReportsPage,
  FamilySummaryPage,
  NurseOnboardingPage,
  NurseLabOrdersPage,
  NurseLabOrderDetailPage,
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
  { path: "/auth/kiorex/callback", element: <KiorexCallbackPage /> },
  { path: "/signup", element: <SignupPage /> },
  { path: "/marketing", element: <MarketingHomePage /> },
  { path: "/pricing", element: <MarketingHomePage /> },
  { path: "/legal/:docId", element: <LegalDocumentPage /> },
  { path: "/r/:token", element: <AppointmentReschedulePage /> },
  // ADR-039 — public patient video-visit page (token link, works in a mobile WebView).
  { path: "/v/:token", element: <PatientJoinPage /> },
  { path: "/pay/:token", element: <DepositPayPage /> },
  { path: "/b/:slug", element: <PublicBookingPage /> },
  { path: "/q/:code", element: <PublicShortLinkPage /> },
  { path: "/rx/:token", element: <PublicRxVerifyPage /> },
  // KNFAM01 — public family summary (token-gated, clinically minimal).
  { path: "/f/:token", element: defer(FamilySummaryPage) },
  // Mock-provider dev inbox (development tool; the API answers 404 in production unless DEV_INBOX_ENABLED=1).
  { path: "/dev/inbox", element: <DevInboxPage /> },
  { path: "/invite/:token", element: <AcceptInvitationPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  // ADR-039 — clinician call page (full-viewport, authenticated).
  {
    path: "/telehealth/:sessionId",
    element: (
      <ProtectedRoute>
        <NavGate tab="appointments">
          <TelehealthCallPage />
        </NavGate>
      </ProtectedRoute>
    ),
  },
  {
    path: "/rep",
    element: (
      <ProtectedRoute>
        <RepConsolePage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <NurseHomeGate><NavGate tab="dashboard">{defer(DashboardPage)}</NavGate></NurseHomeGate> },
      { path: "onboarding", element: <OnboardingPage /> },
      { path: "onboarding/import", element: <ImportWizardPage /> },
      { path: "offline/today", element: <OfflineTodayPage /> },
      { path: "team", element: <TeamPage /> },
      { path: "patients", element: <NavGate tab="patients">{defer(PatientsPage)}</NavGate> },
      { path: "patients/duplicates", element: <NavGate tab="patients">{defer(DuplicatePatientsPage)}</NavGate> },
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
      { path: "front-desk/cash-drawer", element: <NavGate tab="appointments">{defer(CashDrawerPage)}</NavGate> },
      { path: "front-desk/installments", element: <NavGate tab="appointments">{defer(InstallmentsPage)}</NavGate> },
      { path: "front-desk/claims", element: <NavGate tab="appointments">{defer(ClaimsWorkspacePage)}</NavGate> },
      {
        path: "messaging/ai-receptionist",
        element: <NavGate tab="appointments">{defer(AiReceptionistInboxPage)}</NavGate>,
      },
      { path: "front-desk/waiting-room", element: <NavGate tab="appointments">{defer(WaitingRoomPage)}</NavGate> },
      { path: "operations", element: <NavGate tab="operations">{defer(OperationsPage)}</NavGate> },
      { path: "clinics", element: <NavGate tab="clinics">{defer(ClinicsPage)}</NavGate> },
      { path: "clinics/:id", element: <NavGate tab="clinics" orTab="admin">{defer(ClinicDetailPage)}</NavGate> },
      {
        path: "clinics/:clinicId/kiorex-listings/:listingId/profile",
        element: <NavGate tab="clinics" orTab="admin">{defer(MarketplaceListingProfilePage)}</NavGate>,
      },
      { path: "kiorex", element: <NavGate tab="clinics" orTab="admin">{defer(KiorexPage)}</NavGate> },
      { path: "kiorex/connect", element: <NavGate tab="clinics" orTab="admin">{defer(KiorexConnectPage)}</NavGate> },
      { path: "kiorex/growth", element: <NavGate tab="clinics" orTab="admin">{defer(GrowthPage)}</NavGate> },
      { path: "plan", element: <NavGate tab="admin">{defer(UpgradePlanPage)}</NavGate> },
      { path: "kiorex-commissions", element: defer(KiorexCommissionsPage) },
      { path: "credit", element: <NavGate tab="admin">{defer(CreditWalletPage)}</NavGate> },
      { path: "promotions", element: <NavGate tab="admin">{defer(PromotionsPage)}</NavGate> },
      { path: "expenses", element: <NavGate tab="expenses">{defer(ExpensesPage)}</NavGate> },
      { path: "revenue", element: <RevenueGate /> },
      { path: "clinic-revenue", element: <Navigate to="/revenue" replace /> },
      { path: "doctor-revenue", element: <DoctorRevenueGate /> },
      { path: "profile", element: <ProfileGate /> },
      { path: "profile/availability", element: <AvailabilitySetupPage /> },
      { path: "home-visits/today", element: <TodayRoutePage /> },
      // Kiorly Nurse edition screens (KNCP / KNREC / KNMAR / KNSVC / KNAG / HVSAF / KNFAM / KNRPT). The API enforces scope of practice and flags; nothing here gates safety.
      { path: "nurse/care-plans", element: defer(CarePlansPage) },
      { path: "nurse/care-plans/:id", element: defer(CarePlanDetailPage) },
      { path: "nurse/visits/:appointmentId", element: defer(VisitRecordPage) },
      { path: "nurse/mar", element: defer(MarIndexPage) },
      { path: "nurse/mar/:patientId", element: defer(MarPage) },
      { path: "nurse/services", element: defer(NurseServicesPage) },
      { path: "nurse/dispatch", element: defer(NurseDispatchPage) },
      { path: "nurse/shifts", element: defer(NurseShiftsPage) },
      { path: "nurse/safety", element: defer(NurseSafetyPage) },
      { path: "nurse/inbox", element: defer(NurseInboxPage) },
      { path: "nurse/family", element: defer(NurseFamilyPage) },
      { path: "nurse/reports", element: defer(NurseReportsPage) },
      { path: "nurse/onboarding", element: defer(NurseOnboardingPage) },
      { path: "nurse/lab", element: defer(NurseLabOrdersPage) },
      { path: "nurse/lab/:orderId", element: defer(NurseLabOrderDetailPage) },
      { path: "privacy", element: defer(DataPrivacyPage) },
      { path: "profile/verification", element: <NavGate tab="profile">{defer(ClinicianVerificationPage)}</NavGate> },
      { path: "hr", element: <NavGate tab="hr">{defer(HrPage)}</NavGate> },
      { path: "hr/employees/:id", element: <NavGate tab="hr">{defer(EmployeeDetailPage)}</NavGate> },
      { path: "hr/employees/:id/profile", element: <NavGate tab="hr">{defer(EmployeeProfilePage)}</NavGate> },
      { path: "reports", element: <NavGate tab="reports">{defer(ReportsPage)}</NavGate> },
      {
        path: "reports/ar-aging",
        element: <NavGate tab="reports">{defer(Rp04FinanceReportsPage)}</NavGate>,
      },
      {
        path: "reports/branch-pl",
        element: <NavGate tab="reports">{defer(Rp04FinanceReportsPage)}</NavGate>,
      },
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
          { path: "organizations/:tenantId", element: defer(PlatformTenantConsolePage) },
          { path: "users", element: defer(PlatformUsersTab) },
          { path: "clinics", element: defer(PlatformClinicsTab) },
          { path: "insights", element: defer(PlatformInsightsTab) },
          { path: "drug-datasets", element: defer(PlatformDrugDatasetsTab) },
          { path: "plans", element: defer(PlatformPlansTab) },
          { path: "subscriptions", element: defer(PlatformSubscriptionsTab) },
          { path: "kiorex-rates", element: defer(PlatformKiorexRatesTab) },
          { path: "verifications", element: defer(PlatformVerificationsTab) },
          { path: "disputes", element: defer(PlatformCommissionDisputesTab) },
        ],
      },
      { path: "admin", element: <NavGate tab="admin">{defer(AdminPage)}</NavGate> },
      { path: "guide", element: defer(GuideBookPage) },
      { path: "help", element: defer(HelpCentrePage) },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);