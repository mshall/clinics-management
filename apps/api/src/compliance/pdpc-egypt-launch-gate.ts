import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import {
  egyptPdpcLaunchGateSummary,
  isEgyptPdpcReadyForPaidLaunch,
  loadPdpcEgyptFilingsRegistry,
} from "./pdpc-egypt-filings";

export function isPdpcEgyptLaunchGateBypassed(): boolean {
  return process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS === "1";
}

/** SC-02: block EG paid launch until PDPC licences/filings are in hand. */
export async function assertEgyptPdpcPaidLaunchAllowed(
  prisma: PrismaService,
  tenantId: string,
): Promise<void> {
  if (isPdpcEgyptLaunchGateBypassed()) return;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { market: { select: { code: true } } },
  });
  const code = tenant?.market?.code?.trim().toUpperCase();
  if (code !== "EG") return;

  if (isEgyptPdpcReadyForPaidLaunch()) return;

  const summary = egyptPdpcLaunchGateSummary(loadPdpcEgyptFilingsRegistry());
  throw new ForbiddenException({
    message:
      "Egypt PDPC controller/processor licences and cross-border filing must be in hand before paid launch.",
    errorCode: "PDPC_EGYPT_LAUNCH_GATE",
    decisionId: summary.decisionId,
    unreadyFilings: summary.unreadyFilings,
    dpoRegistered: summary.dpoRegistered,
    breachProcedure: "Docs/runbooks/PDPC_DATA_BREACH.md",
    recordsOfProcessing: "Docs/RECORDS_OF_PROCESSING_EG.md",
  });
}