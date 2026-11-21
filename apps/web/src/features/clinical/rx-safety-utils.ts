
export function hasBlockingRxAlerts(alerts: RxSafetyAlert[] | undefined): boolean {
  return Boolean(alerts?.some((a) => a.requiresOverride));
}

export type RxSafetyAlert = {
  kind: string;
  severity: string;
  messageEn: string;
  messageAr: string;
  requiresOverride?: boolean;
  itemIndex?: number;
  relatedItemIndex?: number;
};
