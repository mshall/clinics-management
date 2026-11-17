import type { BillingInterval } from "@prisma/client";

export function addBillingPeriod(start: Date, interval: BillingInterval): Date {
  const end = new Date(start);
  if (interval === "ANNUAL") {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return end;
}