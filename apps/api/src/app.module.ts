import { Module } from "@nestjs/common";
import { MobileModule } from "./mobile/mobile.module";
import { MobilePushModule } from "./mobile/mobile-push.module";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AuditModule } from "./audit/audit.module";
import { AdminModule } from "./admin/admin.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { AuthModule } from "./auth/auth.module";
import { ClinicsModule } from "./clinics/clinics.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { EncountersModule } from "./encounters/encounters.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { HealthModule } from "./health/health.module";
import { HrModule } from "./hr/hr.module";
import { OperationsModule } from "./operations/operations.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { PatientsModule } from "./patients/patients.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReportsModule } from "./reports/reports.module";
import { RevenueModule } from "./revenue/revenue.module";
import { RevenueShareModule } from "./revenue-share/revenue-share.module";
import { StorageModule } from "./storage/storage.module";
import { UserNavTabsModule } from "./user-nav-tabs/user-nav-tabs.module";
import { UserMoneyVisibilityModule } from "./user-money-visibility/user-money-visibility.module";
import { UserClinicPrivilegeGrantsModule } from "./user-clinic-privilege-grants/user-clinic-privilege-grants.module";
import { SupportModule } from "./support/support.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { UsersModule } from "./users/users.module";
import { AssistantModule } from "./assistant/assistant.module";
import { ClinicalModule } from "./clinical/clinical.module";
import { RxShareModule } from "./clinical/rx-share.module";
import { DevInboxModule } from "./dev-inbox/dev-inbox.module";
import { SchedulingModule } from "./scheduling/scheduling.module";
import { FrontDeskModule } from "./front-desk/front-desk.module";
import { BillingModule } from "./billing/billing.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { ExportsModule } from "./exports/exports.module";
import { MessagingModule } from "./messaging/messaging.module";
import { ClinicAiModule } from "./clinic-ai/clinic-ai.module";
import { MarketsModule } from "./markets/markets.module";
import { FeatureFlagsModule } from "./feature-flags/feature-flags.module";
import { ScopeOfPracticeModule } from "./scope-of-practice/scope-of-practice.module";
import { FieldVisitModule } from "./field-visit/field-visit.module";
import { HomeVisitsModule } from "./home-visits/home-visits.module";
import { TelehealthModule } from "./telehealth/telehealth.module";
import { NurseModule } from "./nurse/nurse.module";
import { ProvidersModule } from "./providers/providers.module";
import { PlansModule } from "./plans/plans.module";
import { EntitlementsModule } from "./entitlements/entitlements.module";
import { PrivilegedMfaGuard } from "./auth/privileged-mfa.guard";
import { SignupModule } from "./signup/signup.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { SalesRepsModule } from "./sales-reps/sales-reps.module";
import { LegalModule } from "./legal/legal.module";
import { KiorexModule } from "./kiorex/kiorex.module";
import { MarketplaceModule } from "./marketplace/marketplace.module";
import { ClinicianVerificationModule } from "./clinician-verification/clinician-verification.module";
import { CreditsModule } from "./credits/credits.module";
import { BillingPlatformModule } from "./billing-platform/billing-platform.module";
import { ObservabilityModule } from "./observability/observability.module";
import { UsageModule } from "./usage/usage.module";
import { CohortsModule } from "./cohorts/cohorts.module";
import { GrowthModule } from "./growth/growth.module";
import { ProviderLinksModule } from "./growth/provider-links/provider-links.module";
import { PushModule } from "./push/push.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ObservabilityModule,
    AuditModule,
    StorageModule,
    PrismaModule,
    AuthModule,
    PatientsModule,
    ClinicsModule,
    DashboardModule,
    HealthModule,
    EncountersModule,
    ExpensesModule,
    RevenueModule,
    RevenueShareModule,
    HrModule,
    AppointmentsModule,
    OperationsModule,
    InvoicesModule,
    AdminModule,
    ReportsModule,
    UsersModule,
    UserNavTabsModule,
    UserMoneyVisibilityModule,
    UserClinicPrivilegeGrantsModule,
    SupportModule,
    IntegrationsModule,
    AssistantModule,
    ClinicalModule,
    RxShareModule,
    DevInboxModule,
    SchedulingModule,
    FrontDeskModule,
    BillingModule,
    ComplianceModule,
    ExportsModule,
    MessagingModule,
    ClinicAiModule,
    MarketsModule,
    FeatureFlagsModule,
    ScopeOfPracticeModule,
    FieldVisitModule,
    HomeVisitsModule,
    TelehealthModule,
    NurseModule,
    ProvidersModule,
    PlansModule,
    EntitlementsModule,
    SignupModule,
    OnboardingModule,
    SalesRepsModule,
    LegalModule,
    KiorexModule,
    MarketplaceModule,
    ClinicianVerificationModule,
    CreditsModule,
    BillingPlatformModule,
    UsageModule,
    CohortsModule,
    GrowthModule,
    ProviderLinksModule,
    PushModule,
    MobilePushModule,
    MobileModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: PrivilegedMfaGuard }],
})
export class AppModule {}
