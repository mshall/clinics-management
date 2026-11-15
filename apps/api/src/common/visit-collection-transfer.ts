import { BadRequestException } from "@nestjs/common";
import { MoneyTransferChannel, TransferVerificationStatus } from "@prisma/client";
import { assertValidTransferReference, verifyTransferReferenceWithProvider } from "./transfer-reference";
import { transferVerificationStatusForCollection } from "../compliance/eta-receipt-queue";

export async function resolveTransferVerification(
  channel: MoneyTransferChannel,
  reference: string,
  amount: number,
  currency: string,
): Promise<TransferVerificationStatus> {
  assertValidTransferReference(channel, reference);
  const result = await verifyTransferReferenceWithProvider(channel, reference, amount, currency);
  const status = transferVerificationStatusForCollection(true, result.verified, result.skipped);
  if (status === TransferVerificationStatus.REJECTED) {
    throw new BadRequestException({
      message: result.detail || "Transfer reference could not be verified with the payment provider",
      messageKey: "errors.transfer.notVerified",
    });
  }
  return status;
}