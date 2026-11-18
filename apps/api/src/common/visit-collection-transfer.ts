import { TransferVerificationStatus } from "@prisma/client";
import type { MarketPaymentMethodDef } from "../markets/market-payment-methods";
import { assertValidTransferReference, transferReferenceError, verifyTransferReferenceWithProvider } from "./transfer-reference";
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
    throw transferReferenceError(
      "TRANSFER_REFERENCE_NOT_VERIFIED",
      channel.trim().toUpperCase(),
      result.detail || "Transfer reference could not be verified with the payment provider",
    );
  }
  return status;
}