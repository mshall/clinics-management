import { BadRequestException } from "@nestjs/common";
import { MoneyTransferChannel, VisitCollectionMode } from "@prisma/client";
import { assertValidTransferReference } from "./transfer-reference";

export type ParsedVisitCollection = {
  collectionMode: VisitCollectionMode | null;
  transferChannel: MoneyTransferChannel | null;
  transferReference: string | null;
};

export type VisitCollectionInput = {
  mode: VisitCollectionMode;
  transferChannel?: MoneyTransferChannel | null;
  transferReference?: string | null;
};

export function parseVisitCollectionForAmount(
  amount: number,
  input: VisitCollectionInput | null | undefined,
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
  const channel = input.transferChannel;
  if (channel !== MoneyTransferChannel.INSTAPAY && channel !== MoneyTransferChannel.FAWRY) {
    throw new BadRequestException("Select InstaPay or Fawry for money transfer");
  }
  const ref = input.transferReference?.trim() ?? "";
  if (ref.length < 3) {
    throw new BadRequestException("Transaction ID is required for money transfer");
  }
  assertValidTransferReference(channel, ref);
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