import { BadRequestException } from "@nestjs/common";
import { OperationStatus } from "@prisma/client";
import { normalizeOperationStatus } from "./operation-status-flow";

export function assertDownPaymentBeforeInProgress(
  existing: { downPayment: number | { toString(): string } },
  targetStatus: OperationStatus,
): void {
  const target = normalizeOperationStatus(targetStatus);
  if (target !== OperationStatus.IN_PROGRESS) return;
  const down = Number(existing.downPayment);
  if (!(down > 0)) {
    throw new BadRequestException("Record a down payment before advancing the operation to in progress");
  }
}