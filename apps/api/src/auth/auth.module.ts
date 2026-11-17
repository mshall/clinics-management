import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MfaService } from "./mfa.service";
import { JwtStrategy } from "./jwt.strategy";
import { resolveJwtSigningSecret } from "./jwt-secret.util";
import { PrivilegedMfaGuard } from "./privileged-mfa.guard";
import { PrivilegedMfaPolicyService } from "./privileged-mfa-policy.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthOtpChallengeService } from "./auth-otp-challenge.service";
import { AuthSessionService } from "./auth-session.service";
import { AuthPasswordResetService } from "./auth-password-reset.service";
import { AuthOtpLoginService } from "./auth-otp-login.service";

@Module({
  imports: [
    PrismaModule,
    UserNavTabsModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSigningSecret(config),
        signOptions: { expiresIn: "7d" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    MfaService,
    JwtStrategy,
    PrivilegedMfaGuard,
    PrivilegedMfaPolicyService,
    AuthOtpChallengeService,
    AuthSessionService,
    AuthPasswordResetService,
    AuthOtpLoginService,
  ],
  exports: [AuthService, MfaService, PrivilegedMfaGuard, AuthSessionService],
})
export class AuthModule {}
