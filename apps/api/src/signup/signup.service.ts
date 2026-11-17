import { Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { MarketsService } from "../markets/markets.service";
import { SignupOtpService } from "./signup-otp.service";
import { SignupProvisionService, type SignupProvisionInput } from "./signup-provision.service";

@Injectable()
export class SignupService {
  constructor(
    private readonly otp: SignupOtpService,
    private readonly provision: SignupProvisionService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly markets: MarketsService,
  ) {}

  listMarkets() {
    return this.markets.listOperableForOnboarding();
  }

  requestOtp(body: { phone: string; market: string }, clientIp?: string) {
    return this.otp.sendOtp(body, clientIp);
  }

  verifyOtp(body: { phone: string; code: string; market: string }) {
    return this.otp.verifyOtp(body);
  }

  async complete(
    signupToken: string,
    body: Omit<SignupProvisionInput, "phone" | "marketId">,
  ) {
    const claims = this.otp.decodeSignupToken(signupToken);
    const result = await this.provision.provision({
      phone: claims.phone,
      marketId: claims.marketId,
      ...body,
    });

    await this.audit.recordEvent({
      tenantId: result.tenantId,
      actorId: result.userId,
      clinicId: result.clinicId,
      action: "SIGNUP_COMPLETED",
      resource: "Signup",
      resourceId: result.userId,
      metadata: {
        event: "SIGNUP_COMPLETED",
        planKey: result.planKey,
        market: result.marketCode,
        specialty: result.specialty,
        phoneLast4: result.phone.slice(-4),
        salesRepCode: result.salesRepCode,
        referralCode: result.referralCode,
      },
    });

    return this.auth.createSessionForUserId(result.userId);
  }
}