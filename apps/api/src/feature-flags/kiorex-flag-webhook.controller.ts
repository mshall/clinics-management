import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request } from "express";
import { SNAPSHOT_PRODUCT, verifyFlagWebhook } from "./kiorex-flag-snapshot";
import { KiorexFlagSnapshotService } from "./kiorex-flag-snapshot.service";

const WEBHOOK_MAX_SKEW_SECONDS = 5 * 60;
const SEEN_MAX = 500;

/**
 * FF03 push path: Kiorex control plane POSTs `flag.changed` (HMAC `sha256=hex(HMAC(secret, ts.rawBody))`).
 * We verify, then re-fetch the snapshot immediately (ETag aware). The poll remains the source of truth.
 */
@ApiExcludeController()
@Controller("feature-flags/kiorex")
export class KiorexFlagWebhookController {
  private readonly seen = new Set<string>();

  constructor(private readonly snapshots: KiorexFlagSnapshotService) {}

  private secrets(): string[] {
    const out = [process.env.KIOREX_FLAGS_WEBHOOK_SECRET?.trim(), process.env.KIOREX_FLAGS_SECRET?.trim()].filter(
      (s): s is string => !!s,
    );
    if (!out.length && process.env.NODE_ENV !== "production") out.push("ff_dev_secret_change_me");
    return out;
  }

  @Post("changed")
  @HttpCode(200)
  async changed(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown) {
    const header = (n: string) => {
      const v = req.headers[n];
      return (Array.isArray(v) ? v[0] : v)?.trim();
    };
    const ts = header("x-kiorly-timestamp");
    const sig = header("x-kiorly-signature");
    const eventId = header("x-kiorly-event-id");
    const tsNum = Number(ts);
    if (!ts || !sig || !Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > WEBHOOK_MAX_SKEW_SECONDS) {
      throw new UnauthorizedException("Bad or stale webhook timestamp");
    }
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
    if (!this.secrets().some((s) => verifyFlagWebhook(s, ts, raw, sig))) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
    const evt = body as { type?: string; data?: { product?: string } } | null;
    if (!evt || typeof evt !== "object" || evt.type !== "flag.changed") {
      throw new BadRequestException("Expected a flag.changed event");
    }
    if (evt.data?.product && evt.data.product !== SNAPSHOT_PRODUCT) {
      return { accepted: true, ignored: true, reason: "other product" };
    }
    if (eventId && this.seen.has(eventId)) return { accepted: true, duplicate: true };
    if (eventId) {
      this.seen.add(eventId);
      if (this.seen.size > SEEN_MAX) this.seen.delete(this.seen.values().next().value as string);
    }
    const refreshed = await this.snapshots.refresh("webhook");
    return { accepted: true, refreshed };
  }
}
