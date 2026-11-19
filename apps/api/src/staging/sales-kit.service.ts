import { ForbiddenException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import * as QRCode from "qrcode";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";
import { parsePilotTierArg, type PilotTier } from "./pilot-tenant-catalog";
import { resetAllSalesDemoTenants, resetSalesDemoTenant, summarizePilotTenant } from "./sales-demo-reset";
import { computeSalesRoi, type SalesRoiInput } from "./sales-roi";

@Injectable()
export class SalesKitService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GT-05 — POST /admin/platform/demo/reset
   * Resets Lite/Pro/Clinic pilot tenants. Acceptance: completes in under 60s.
   */
  async resetDemo(
    actor: JwtUser,
    body: { tier?: string } = {},
  ): Promise<{
    elapsedMs: number;
    results: Array<{ tenantId: string; tier: PilotTier; patients: number; appointments: number }>;
  }> {
    if (!isPlatformSuperAdmin(actor)) throw new ForbiddenException("Platform super admin only");
    const started = Date.now();
    const passwordHash = bcrypt.hashSync("demo", 10);
    const parsed = parsePilotTierArg(body.tier ?? "all");
    if (!parsed) throw new ForbiddenException("tier must be lite|pro|clinic|all");
    const reset =
      parsed === "all"
        ? await resetAllSalesDemoTenants(this.prisma, passwordHash)
        : [await resetSalesDemoTenant(this.prisma, parsed, passwordHash)];
    const results = [];
    for (const r of reset) {
      const summary = await summarizePilotTenant(this.prisma, r.tenantId);
      results.push(summary);
    }
    return { elapsedMs: Date.now() - started, results };
  }

  roi(input: SalesRoiInput) {
    return computeSalesRoi(input);
  }

  async repSignupAssets(code: string, webBaseUrl: string): Promise<{
    salesRepCode: string;
    signupUrl: string;
    qrDataUrl: string;
  }> {
    const salesRepCode = code.trim().toUpperCase();
    const base = webBaseUrl.replace(/\/$/, "");
    const signupUrl = `${base}/signup?rep=${encodeURIComponent(salesRepCode)}`;
    const qrDataUrl = await QRCode.toDataURL(signupUrl, { margin: 1, width: 256 });
    return { salesRepCode, signupUrl, qrDataUrl };
  }
}
