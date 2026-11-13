import { BadRequestException } from "@nestjs/common";
import { OperationStatus } from "@prisma/client";

/** Legacy aliases map to the modern pipeline. */
export function normalizeOperationStatus(status: OperationStatus): OperationStatus {
  if (status === OperationStatus.SCHEDULED) return OperationStatus.BOOKED;
  if (status === OperationStatus.COMPLETED) return OperationStatus.DISCHARGED;
  return status;
}

const PIPELINE: OperationStatus[] = [
  OperationStatus.BOOKED,
  OperationStatus.PRE_OP,
  OperationStatus.IN_PROGRESS,
  OperationStatus.RECOVERY,
  OperationStatus.DISCHARGED,
];

export function isTerminalOperationStatus(status: OperationStatus): boolean {
  const n = normalizeOperationStatus(status);
  return n === OperationStatus.DISCHARGED || status === OperationStatus.CANCELLED;
}

export function assertOperationStatusTransition(from: OperationStatus, to: OperationStatus): void {
  if (from === to) return;
  if (to === OperationStatus.CANCELLED) {
    if (isTerminalOperationStatus(from)) {
      throw new BadRequestException("Cannot cancel a completed operation");
    }
    return;
  }
  const current = normalizeOperationStatus(from);
  const target = normalizeOperationStatus(to);
  if (current === OperationStatus.CANCELLED || current === OperationStatus.DISCHARGED) {
    throw new BadRequestException("Cannot change status of a completed or cancelled operation");
  }
  const fromIdx = PIPELINE.indexOf(current);
  const toIdx = PIPELINE.indexOf(target);
  if (fromIdx < 0 || toIdx < 0) {
    throw new BadRequestException("Invalid status transition");
  }
  if (toIdx !== fromIdx + 1) {
    throw new BadRequestException("Advance one stage at a time (booked → pre-op → in progress → recovery → discharged)");
  }
}

export function operationStatusIsEditable(status: OperationStatus): boolean {
  const n = normalizeOperationStatus(status);
  return n === OperationStatus.BOOKED || n === OperationStatus.PRE_OP;
}
