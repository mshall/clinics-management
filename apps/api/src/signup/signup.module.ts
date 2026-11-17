import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { MarketsModule } from "../markets/markets.module";
import { LegalModule } from "../legal/legal.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PublicSignupController } from "./public-signup.controller";
import { SignupOtpService } from "./signup-otp.service";
import { SignupProvisionService } from "./signup-provision.service";
import { SignupService } from "./signup.service";
import { resolveJwtSigningSecret } from "../auth/jwt-secret.util";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    MarketsModule,
    LegalModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSigningSecret(config),
        signOptions: { expiresIn: "30m" },
      }),
    }),
  ],
  controllers: [PublicSignupController],
  providers: [SignupService, SignupOtpService, SignupProvisionService],
})
export class SignupModule {}