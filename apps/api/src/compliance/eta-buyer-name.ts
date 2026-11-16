import { BadRequestException } from "@nestjs/common";

export const EGP_BUYER_NAME_THRESHOLD = 150_000;

/** Enforced when taking payment — not at async submit time. */
export function assertEtaBuyerNameAtPayment(
  totalAmount: number,
  currency: string,
  buyerName?: string | null,
): void {
  if (currency !== "EGP" || totalAmount < EGP_BUYER_NAME_THRESHOLD) return;
  const name = buyerName?.trim();
  if (!name || name.toLowerCase() === "patient") {
    throw new BadRequestException(
      "Patient full name is required for payments at or above EGP 150,000 before posting revenue.",
    );
  }
}