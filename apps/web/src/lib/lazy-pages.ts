import { lazy, type ComponentType } from "react";

function lazyNamed<P extends Record<string, ComponentType>, K extends keyof P>(
  factory: () => Promise<P>,
  exportName: K,
) {
  return lazy(() => factory().then((mod) => ({ default: mod[exportName] })));
}

export const MarketplaceListingProfilePage = lazyNamed(
  () => import("@/features/clinics/marketplace-listing-profile-page"),
  "MarketplaceListingProfilePage",
);
export const KiorexPage = lazyNamed(() => import("@/features/kiorex/kiorex-page"), "KiorexPage");
export const GrowthPage = lazyNamed(() => import("@/features/growth/growth-page"), "GrowthPage");
export const PlatformSubscriptionsTab = lazyNamed(() => import("@/features/plan-billing/PlatformSubscriptionsTab"), "PlatformSubscriptionsTab");
export const KiorexCommissionsPage = lazyNamed(() => import("@/features/admin/kiorex-commissions-page"), "KiorexCommissionsPage");
export const CreditWalletPage = lazyNamed(() => import("@/features/credits/CreditWalletPage"), "CreditWalletPage");
export const PayPage = lazyNamed(() => import("@/features/pay/PayPage"), "PayPage");
export const UpgradePlanPage = lazyNamed(() => import("@/features/plan-billing/UpgradePlanPage"), "UpgradePlanPage");
export const PromotionsPage = lazyNamed(() => import("@/features/promotions/PromotionsPage"), "PromotionsPage");
export const KiorexConnectPage = lazyNamed(() => import("@/features/kiorex/kiorex-connect-page"), "KiorexConnectPage");
export const DashboardPage = lazyNamed(() => import("@/features/dashboard/dashboard-page"), "DashboardPage");
export const PatientsPage = lazyNamed(() => import("@/features/patients/patients-page"), "PatientsPage");
export const DuplicatePatientsPage = lazyNamed(
  () => import("@/features/patients/duplicate-patients-page"),
  "DuplicatePatientsPage",
);
export const PatientDetailPage = lazyNamed(
  () => import("@/features/patients/patient-detail-page"),
  "PatientDetailPage",
);
export const EncountersListPage = lazyNamed(
  () => import("@/features/encounters/encounters-list-page"),
  "EncountersListPage",
);
export const EncounterDetailPage = lazyNamed(
  () => import("@/features/encounters/encounter-detail-page"),
  "EncounterDetailPage",
);
export const AppointmentsPage = lazyNamed(
  () => import("@/features/appointments/appointments-page"),
  "AppointmentsPage",
);
export const AppointmentDetailPage = lazyNamed(
  () => import("@/features/appointments/appointment-detail-page"),
  "AppointmentDetailPage",
);
export const FrontDeskBoardPage = lazyNamed(
  () => import("@/features/front-desk/front-desk-board-page"),
  "FrontDeskBoardPage",
);
export const CashDrawerPage = lazyNamed(() => import("@/features/front-desk/cash-drawer-page"), "CashDrawerPage");
export const InstallmentsPage = lazyNamed(() => import("@/features/front-desk/installments-page"), "InstallmentsPage");
export const ClaimsWorkspacePage = lazyNamed(
  () => import("@/features/front-desk/claims-workspace-page"),
  "ClaimsWorkspacePage",
);
export const AiReceptionistInboxPage = lazyNamed(
  () => import("@/features/messaging/ai-receptionist-inbox-page"),
  "AiReceptionistInboxPage",
);
export const Rp04FinanceReportsPage = lazyNamed(
  () => import("@/features/reports/rp04-finance-reports-page"),
  "Rp04FinanceReportsPage",
);
export const WaitingRoomPage = lazyNamed(
  () => import("@/features/front-desk/waiting-room-page"),
  "WaitingRoomPage",
);
export const OperationsPage = lazyNamed(() => import("@/features/operations/operations-page"), "OperationsPage");
export const ClinicsPage = lazyNamed(() => import("@/features/clinics/clinics-page"), "ClinicsPage");
export const ClinicDetailPage = lazyNamed(() => import("@/features/clinics/clinic-detail-page"), "ClinicDetailPage");
export const ExpensesPage = lazyNamed(() => import("@/features/expenses/expenses-page"), "ExpensesPage");
export const HrPage = lazyNamed(() => import("@/features/hr/hr-page"), "HrPage");
export const EmployeeDetailPage = lazyNamed(
  () => import("@/features/hr/employee-detail-page"),
  "EmployeeDetailPage",
);
export const EmployeeProfilePage = lazyNamed(
  () => import("@/features/hr/employee-profile-page"),
  "EmployeeProfilePage",
);
export const ReportsPage = lazyNamed(() => import("@/features/reports/reports-page"), "ReportsPage");
export const DataPrivacyPage = lazyNamed(
  () => import("@/features/privacy/data-privacy-page"),
  "DataPrivacyPage",
);
export const CustomerSupportPage = lazyNamed(
  () => import("@/features/support/customer-support-page"),
  "CustomerSupportPage",
);
export const AdminPage = lazyNamed(() => import("@/features/admin/admin-page"), "AdminPage");
export const GuideBookPage = lazyNamed(() => import("@/features/guide/guide-book-page"), "GuideBookPage");
export const HelpCentrePage = lazyNamed(() => import("@/features/help/help-centre-page"), "HelpCentrePage");
export const PlatformOverviewPage = lazyNamed(
  () => import("@/features/platform/platform-overview-page"),
  "PlatformOverviewPage",
);
export const PlatformMarketsTab = lazyNamed(
  () => import("@/features/platform/platform-markets-tab"),
  "PlatformMarketsTab",
);
export const PlatformOrganizationsTab = lazyNamed(
  () => import("@/features/platform/platform-organizations-tab"),
  "PlatformOrganizationsTab",
);
export const PlatformTenantConsolePage = lazyNamed(
  () => import("@/features/platform/platform-tenant-console-page"),
  "PlatformTenantConsolePage",
);
export const PlatformUsersTab = lazyNamed(
  () => import("@/features/platform/platform-users-tab"),
  "PlatformUsersTab",
);
export const PlatformClinicsTab = lazyNamed(
  () => import("@/features/platform/platform-clinics-tab"),
  "PlatformClinicsTab",
);
export const PlatformInsightsTab = lazyNamed(
  () => import("@/features/platform/platform-insights-tab"),
  "PlatformInsightsTab",
);
export const PlatformDrugDatasetsTab = lazyNamed(
  () => import("@/features/platform/platform-drug-datasets-tab"),
  "PlatformDrugDatasetsTab",
);
export const PlatformPlansTab = lazyNamed(
  () => import("@/features/platform/platform-plans-tab"),
  "PlatformPlansTab",
);
export const PlatformVerificationsTab = lazyNamed(
  () => import("@/features/platform/platform-verifications-tab"),
  "PlatformVerificationsTab",
);

export const PlatformCommissionDisputesTab = lazyNamed(
  () => import("@/features/platform/platform-commission-disputes-tab"),
  "PlatformCommissionDisputesTab",
);
export const ClinicianVerificationPage = lazyNamed(
  () => import("@/features/clinicians/clinician-verification-page"),
  "ClinicianVerificationPage",
);
export const PlatformKiorexRatesTab = lazyNamed(
  () => import("@/features/platform/platform-kiorex-rates-tab"),
  "PlatformKiorexRatesTab",
);
export const TodayRoutePage = lazyNamed(() => import("@/features/home-visits/today-route-page"), "TodayRoutePage");

export const CarePlansPage = lazyNamed(() => import("@/features/nurse/care-plans-page"), "CarePlansPage");
export const CarePlanDetailPage = lazyNamed(() => import("@/features/nurse/care-plan-detail-page"), "CarePlanDetailPage");
export const VisitRecordPage = lazyNamed(() => import("@/features/nurse/visit-record-page"), "VisitRecordPage");
export const MarPage = lazyNamed(() => import("@/features/nurse/mar-page"), "MarPage");
export const MarIndexPage = lazyNamed(() => import("@/features/nurse/mar-page"), "MarIndexPage");
export const NurseServicesPage = lazyNamed(() => import("@/features/nurse/services-page"), "ServicesPage");
export const NurseDispatchPage = lazyNamed(() => import("@/features/nurse/dispatch-page"), "DispatchPage");
export const NurseShiftsPage = lazyNamed(() => import("@/features/nurse/dispatch-page"), "ShiftsPage");
export const NurseSafetyPage = lazyNamed(() => import("@/features/nurse/safety-page"), "SafetyPage");
export const NurseInboxPage = lazyNamed(() => import("@/features/nurse/requests-inbox-page"), "RequestsInboxPage");
export const NurseFamilyPage = lazyNamed(() => import("@/features/nurse/family-reports-pages"), "FamilyPage");
export const NurseReportsPage = lazyNamed(() => import("@/features/nurse/family-reports-pages"), "NurseReportsPage");
export const FamilySummaryPage = lazyNamed(() => import("@/features/nurse/family-reports-pages"), "FamilySummaryPage");
export const NurseOnboardingPage = lazyNamed(() => import("@/features/nurse/onboarding-page"), "NurseOnboardingPage");
export const NurseLabOrdersPage = lazyNamed(() => import("@/features/nurse/lab-page"), "LabOrdersPage");
export const NurseLabOrderDetailPage = lazyNamed(() => import("@/features/nurse/lab-page"), "LabOrderDetailPage");
