import { BadRequestException } from "@nestjs/common";
import { VisitCollectionMode } from "@prisma/client";
import type { MarketPaymentMethodDef } from "../markets/market-payment-methods";
import { assertValidTransferReference, transferReferenceError } from "./transfer-reference";

export type ParsedVisitCollection = {
  collectionMode: VisitCollectionMode | null;
  transferChannel: string | null;
  transferReference: string | null;
};

export type VisitCollectionInput = {
  mode: VisitCollectionMode;
  transferChannel?: string | null;
  transferReference?: string | null;
};

export function parseVisitCollectionForAmount(
  amount: number,
  input: VisitCollectionInput | null | undefined,
  opts?: {
    allowedTransferChannels?: Set<string>;
    paymentMethods?: MarketPaymentMethodDef[];
  },
): ParsedVisitCollection {
  if (amount <= 0) {
    return { collectionMode: null, transferChannel: null, transferReference: null };
  }
  if (!input?.mode) {
    throw new BadRequestException("Visit collection method is required when collecting a payment");
  }
  if (input.mode === VisitCollectionMode.CASH_ON_VISIT) {
    return { collectionMode: VisitCollectionMode.CASH_ON_VISIT, transferChannel: null, transferReference: null };
  }
  if (input.mode !== VisitCollectionMode.MONEY_TRANSFER) {
    throw new BadRequestException("Invalid visit collection method");
  }
  const channel = input.transferChannel?.trim().toUpperCase();
  if (!channel) {
    throw new BadRequestException("Select a money transfer channel");
  }
  const allowed = opts?.allowedTransferChannels;
  if (allowed && !allowed.has(channel)) {
    throw new BadRequestException("This payment channel is not enabled for your market or organization");
  }
  const ref = input.transferReference?.trim() ?? "";
  if (ref.length < 3) {
    throw transferReferenceError("TRANSFER_REFERENCE_REQUIRED", channel, "Transaction ID is required for money transfer");
  }
  assertValidTransferReference(channel, ref, opts?.paymentMethods ?? []);
  return {
    collectionMode: VisitCollectionMode.MONEY_TRANSFER,
    transferChannel: channel,
    transferReference: ref.slice(0, 120),
  };
}

export function collectionFieldsFromParsed(parsed: ParsedVisitCollection) {
  return {
    collectionMode: parsed.collectionMode,
    transferChannel: parsed.transferChannel,
    transferReference: parsed.transferReference,
  };
}

export type ScheduledFeePlan = {
  scheduledCollectionMode: VisitCollectionMode | null;
  scheduledTransferChannel: string | null;
};

/** Booking-time plan: cash vs transfer channel (no transaction ID until collection). */
export function parseScheduledFeeCollection(
  feeAmount: number,
  input: { mode: VisitCollectionMode; transferChannel?: string | null } | null | undefined,
  opts?: {
    allowedTransferChannels?: Set<string>;
  },
): ScheduledFeePlan {
  if (feeAmount <= 0) {
    return { scheduledCollectionMode: null, scheduledTransferChannel: null };
  }
  if (!input?.mode) {
    throw new BadRequestException("Select how the scheduled fee will be paid (cash or transfer channel)");
  }
  if (input.mode === VisitCollectionMode.CASH_ON_VISIT) {
    return { scheduledCollectionMode: VisitCollectionMode.CASH_ON_VISIT, scheduledTransferChannel: null };
  }
  if (input.mode !== VisitCollectionMode.MONEY_TRANSFER) {
    throw new BadRequestException("Invalid scheduled fee collection method");
  }
  const channel = input.transferChannel?.trim().toUpperCase();
  if (!channel) {
    throw new BadRequestException("Select a payment channel for the scheduled transfer fee");
  }
  const allowed = opts?.allowedTransferChannels;
  if (allowed && !allowed.has(channel)) {
    throw new BadRequestException("This payment channel is not enabled for your market or organization");
  }
  return {
    scheduledCollectionMode: VisitCollectionMode.MONEY_TRANSFER,
    scheduledTransferChannel: channel,
  };
}