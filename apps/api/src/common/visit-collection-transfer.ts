import { BadRequestException } from "@nestjs/common";
import { TransferVerificationStatus } from "@prisma/client";
import type { MarketPaymentMethodDef } from "../markets/market-payment-methods";
import { assertValidTransferReference, verifyTransferReferenceWithProvider } from "./transfer-reference";
function transferVerificationStatusForCollection(
  _expectVerify: boolean,
  verified: boolean,
  skipped: boolean,
): TransferVerificationStatus {
  if (skipped) return TransferVerificationStatus.NOT_APPLICABLE;
  return verified ? TransferVerificationStatus.VERIFIED : TransferVerificationStatus.REJECTED;
}

export async function resolveTransferVerification(
  channel: string,
  reference: string,
  amount: number,
  currency: string,
  paymentMethods: MarketPaymentMethodDef[] = [],
): Promise<TransferVerificationStatus> {
  assertValidTransferReference(channel, reference, paymentMethods);
  const result = await verifyTransferReferenceWithProvider(channel, reference, amount, currency, paymentMethods);
  const status = transferVerificationStatusForCollection(true, result.verified, result.skipped);
  if (status === TransferVerificationStatus.REJECTED) {
    throw new BadRequestException({
      message: result.detail || "Transfer reference could not be verified with the payment provider",
      messageKey: "errors.transfer.notVerified",
    });
  }
  return status;
}