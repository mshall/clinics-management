import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { notifyOnCall } from "../observability/notify-on-call";
import { PrismaService } from "../prisma/prisma.service";
import { isKnownOrExternalFlagKey } from "./feature-flag-keys";
import {
  diffSnapshots,
  SNAPSHOT_PATH,
  SNAPSHOT_PRODUCT,
  signControlPlaneRequest,
  validateSnapshotShape,
  verifySnapshot,
  type FlagSnapshot,
  type SnapshotChange,
  type SnapshotFlag,
} from "./kiorex-flag-snapshot";

export type SnapshotRefreshSource = "startup" | "poll" | "webhook" | "manual";

export type SnapshotMeta = {
  managed: boolean;
  version: number | null;
  generatedAt: string | null;
  /** Last successful contact with the control plane (200 or 304). */
  fetchedAt: string | null;
  ageSeconds: number | null;
  stale: boolean;
  lastError: string | null;
};

const DEFAULT_POLL_MS = 30_000;
const DEFAULT_STALE_MS = 10 * 60 * 1000;
const ALERT_REPEAT_MS = 30 * 60 * 1000;

/**
 * FF03/FF06 — pulls the signed flag snapshot (ETag, 30 s), persists the last-known copy (fail-static), audits
 * changes and raises the stale-snapshot alert. Evaluation reads {@link getFlag} synchronously from memory.
 */
@Injectable()
export class KiorexFlagSnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("KiorexFlagSnapshot");
  private snapshot: FlagSnapshot | null = null;
  private byKey = new Map<string, SnapshotFlag>();
  private etag: string | null = null;
  private fetchedAt: Date | null = null;
  private lastError: string | null = null;
  private startedAt = Date.now();
  private lastAlertAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshing: Promise<boolean> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- configuration -------------------------------------------------------------------------------------------

  private env(name: string): string | undefined {
    return process.env[name]?.trim() || undefined;
  }

  /** Control plane base URL; unset ⇒ no polling (code defaults / local DB layers apply). */
  controlPlaneUrl(): string | null {
    return (this.env("KIOREX_CONTROL_PLANE_URL") ?? this.env("KIOREX_FLAGS_URL") ?? "").replace(/\/+$/, "") || null;
  }

  private productKey(): string {
    return this.env("KIOREX_FLAGS_PRODUCT_KEY") ?? `ff_${SNAPSHOT_PRODUCT}_dev`;
  }

  private secret(): string | null {
    const s = this.env("KIOREX_FLAGS_SECRET");
    if (s) return s;
    return process.env.NODE_ENV === "production" ? null : "ff_dev_secret_change_me";
  }

  pollMs(): number {
    const n = Number(this.env("KIOREX_FLAGS_POLL_MS"));
    return Number.isFinite(n) && n >= 1000 ? n : DEFAULT_POLL_MS;
  }

  staleMs(): number {
    const n = Number(this.env("KIOREX_FLAGS_STALE_ALERT_MS"));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_STALE_MS;
  }

  /** True when this deployment takes flag authority from Kiorex (control plane configured or a snapshot exists). */
  isManaged(): boolean {
    return this.snapshot != null || this.controlPlaneUrl() != null;
  }

  // ---- lifecycle -----------------------------------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    await this.loadPersisted();
    if (!this.controlPlaneUrl() || process.env.NODE_ENV === "test") return;
    void this.refresh("startup");
    this.timer = setInterval(() => void this.tick(), this.pollMs());
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    await this.refresh("poll");
    this.checkStale();
  }

  async loadPersisted(): Promise<void> {
    try {
      const row = await this.prisma.kiorexFlagSnapshot.findUnique({ where: { product: SNAPSHOT_PRODUCT } });
      if (!row) return;
      const snap = row.payload as unknown as FlagSnapshot;
      if (validateSnapshotShape(snap)) return;
      this.setCurrent(snap, row.etag, row.fetchedAt);
      this.lastError = row.lastError;
    } catch (e) {
      this.log.warn(`Could not load persisted snapshot: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ---- evaluation reads ------------------------------------------------------------------------------------------

  getFlag(key: string): SnapshotFlag | undefined {
    return this.byKey.get(key);
  }

  getSnapshot(): FlagSnapshot | null {
    return this.snapshot;
  }

  meta(now = Date.now()): SnapshotMeta {
    const age = this.fetchedAt ? Math.floor((now - this.fetchedAt.getTime()) / 1000) : null;
    return {
      managed: this.isManaged(),
      version: this.snapshot?.version ?? null,
      generatedAt: this.snapshot?.generatedAt ?? null,
      fetchedAt: this.fetchedAt?.toISOString() ?? null,
      ageSeconds: age,
      stale: this.controlPlaneUrl() != null && this.isStale(now),
      lastError: this.lastError,
    };
  }

  /** Test seam: install a snapshot without touching the network or DB. */
  setSnapshotForTests(snap: FlagSnapshot | null): void {
    if (!snap) {
      this.snapshot = null;
      this.byKey = new Map();
      this.fetchedAt = null;
      return;
    }
    this.setCurrent(snap, null, new Date());
  }

  private setCurrent(snap: FlagSnapshot, etag: string | null, fetchedAt: Date): void {
    this.snapshot = snap;
    this.byKey = new Map(snap.flags.map((f) => [f.key, f]));
    this.etag = etag;
    this.fetchedAt = fetchedAt;
  }

  // ---- refresh -------------------------------------------------------------------------------------------------

  /** Returns true when the control plane answered (200 or 304); false on any failure (last-known kept). */
  refresh(source: SnapshotRefreshSource = "manual"): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefresh(source).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(source: SnapshotRefreshSource): Promise<boolean> {
    const base = this.controlPlaneUrl();
    const secret = this.secret();
    if (!base || !secret) return false;
    const attemptAt = new Date();
    try {
      const timestamp = String(Date.now());
      const nonce = randomUUID();
      const signature = signControlPlaneRequest({ secret, timestamp, nonce, method: "GET", path: SNAPSHOT_PATH });
      const headers: Record<string, string> = {
        Accept: "application/json",
        "X-Kiorex-Product-Key": this.productKey(),
        "X-Kiorly-Timestamp": timestamp,
        "X-Kiorly-Nonce": nonce,
        "X-Kiorly-Signature": signature,
      };
      if (this.etag) headers["If-None-Match"] = this.etag;
      const res = await fetch(`${base}${SNAPSHOT_PATH}?product=${SNAPSHOT_PRODUCT}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 304) {
        this.fetchedAt = new Date();
        this.lastError = null;
        await this.touchPersisted(attemptAt, null);
        return true;
      }
      if (!res.ok) throw new Error(`control plane responded ${res.status}`);

      const body = (await res.json()) as unknown;
      const shapeError = validateSnapshotShape(body);
      if (shapeError) throw new Error(`invalid snapshot: ${shapeError}`);
      const snap = body as FlagSnapshot;
      if (!verifySnapshot(secret, snap)) throw new Error("snapshot signature mismatch");

      const prev = this.snapshot;
      const etag = res.headers.get("etag");
      this.setCurrent(snap, etag, new Date());
      this.lastError = null;
      await this.persist(snap, etag, attemptAt);
      if (!prev || prev.version !== snap.version) await this.auditChange(prev, snap, source);
      return true;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.log.warn(`Snapshot refresh (${source}) failed, keeping last-known: ${this.lastError}`);
      await this.touchPersisted(attemptAt, this.lastError);
      return false;
    }
  }

  private async persist(snap: FlagSnapshot, etag: string | null, attemptAt: Date): Promise<void> {
    try {
      const data = {
        version: snap.version,
        etag,
        payload: snap as unknown as Prisma.InputJsonValue,
        signature: snap.signature,
        generatedAt: new Date(snap.generatedAt),
        fetchedAt: new Date(),
        lastAttemptAt: attemptAt,
        lastError: null,
      };
      await this.prisma.kiorexFlagSnapshot.upsert({
        where: { product: SNAPSHOT_PRODUCT },
        create: { product: SNAPSHOT_PRODUCT, ...data },
        update: data,
      });
    } catch (e) {
      this.log.warn(`Could not persist snapshot: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async touchPersisted(attemptAt: Date, error: string | null): Promise<void> {
    if (!this.snapshot) return;
    try {
      await this.prisma.kiorexFlagSnapshot.updateMany({
        where: { product: SNAPSHOT_PRODUCT },
        data: {
          lastAttemptAt: attemptAt,
          lastError: error,
          ...(error ? {} : { fetchedAt: this.fetchedAt ?? new Date() }),
        },
      });
    } catch {
      /* persistence is best-effort */
    }
  }

  // ---- FF06: audit + stale alert ---------------------------------------------------------------------------------

  private async auditChange(prev: FlagSnapshot | null, next: FlagSnapshot, source: SnapshotRefreshSource): Promise<void> {
    const unknown = next.flags.filter((f) => !isKnownOrExternalFlagKey(f.key)).map((f) => f.key);
    if (unknown.length) this.log.warn(`Snapshot v${next.version} carries unregistered keys (ignored): ${unknown.join(", ")}`);
    const changes: SnapshotChange[] = diffSnapshots(prev, next).filter((c) => !unknown.includes(c.key));
    try {
      await this.prisma.kiorexFlagAuditEvent.create({
        data: {
          product: SNAPSHOT_PRODUCT,
          fromVersion: prev?.version ?? null,
          toVersion: next.version,
          source,
          changes: changes as unknown as Prisma.InputJsonValue,
        },
      });
      const orgIds = [...new Set(changes.filter((c) => c.scope === "org" && c.scopeId).map((c) => c.scopeId as string))];
      if (orgIds.length) {
        const tenants = await this.prisma.tenant.findMany({ where: { id: { in: orgIds } }, select: { id: true } });
        for (const t of tenants) {
          await this.audit.recordEvent({
            tenantId: t.id,
            actorId: null,
            clinicId: null,
            action: "FEATURE_FLAG_SNAPSHOT_CHANGED",
            resource: "FeatureFlag",
            resourceId: null,
            metadata: {
              source,
              fromVersion: prev?.version ?? null,
              toVersion: next.version,
              changes: changes.filter((c) => c.scope === "org" && c.scopeId === t.id),
            },
          });
        }
      }
    } catch (e) {
      this.log.warn(`Could not audit snapshot change: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private isStale(now = Date.now()): boolean {
    const last = this.fetchedAt?.getTime() ?? this.startedAt;
    return now - last > this.staleMs();
  }

  /** FF06 hook: on-call alert when the snapshot is older than the threshold (default 10 min). Throttled. */
  checkStale(now = Date.now()): boolean {
    if (!this.controlPlaneUrl() || !this.isStale(now)) return false;
    if (now - this.lastAlertAt < ALERT_REPEAT_MS) return true;
    this.lastAlertAt = now;
    const m = this.meta(now);
    notifyOnCall("FLAG_SNAPSHOT_STALE", {
      message: "Kiorex flag snapshot is stale",
      ageSeconds: m.ageSeconds,
      version: m.version,
      lastError: m.lastError,
    });
    return true;
  }
}
