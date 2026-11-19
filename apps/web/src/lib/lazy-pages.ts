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
export const DashboardPage = lazyNamed(() => import("@/features/dashboard/dashboard-page"), "DashboardPage");
export const PatientsPage = lazyNamed(() => import("@/features/patients/patients-page"), "PatientsPage");
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