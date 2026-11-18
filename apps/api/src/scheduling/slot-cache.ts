export type CachedDaySlots = {
  slots: Array<{ startsAt: string; endsAt: string; roomLabel?: string | null }>;
  expiresAt: number;
};

const TTL_MS = 60_000;

export class ClinicianDaySlotCache {
  private readonly store = new Map<string, CachedDaySlots>();

  static key(parts: {
    tenantId: string;
    clinicId: string;
    clinicianId: string;
    localDate: string;
    typeId: string;
    channel: string;
  }): string {
    return [
      parts.tenantId,
      parts.clinicId,
      parts.clinicianId,
      parts.localDate,
      parts.typeId,
      parts.channel,
    ].join(":");
  }

  get(key: string): CachedDaySlots | undefined {
    const row = this.store.get(key);
    if (!row) return undefined;
    if (Date.now() > row.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return row;
  }

  set(key: string, slots: CachedDaySlots["slots"]): void {
    this.store.set(key, { slots, expiresAt: Date.now() + TTL_MS });
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}