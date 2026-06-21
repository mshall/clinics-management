import { Module } from "@nestjs/common";
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
import { PatientsModule } from "./patients/patients.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReportsModule } from "./reports/reports.module";
import { RevenueModule } from "./revenue/revenue.module";
import { StorageModule } from "./storage/storage.module";
import { UserNavTabsModule } from "./user-nav-tabs/user-nav-tabs.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    HrModule,
    AppointmentsModule,
    OperationsModule,
    AdminModule,
    ReportsModule,
    UsersModule,
    UserNavTabsModule,
  ],
})
export class AppModule {}
