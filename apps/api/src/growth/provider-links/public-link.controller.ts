import { Controller, Get, Header, Headers, HttpStatus, NotFoundException, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ReferralLinkStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { PublicAuthRateLimitGuard } from "../../common/rate-limit.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { isLikelyBot } from "./link-counters";
import { normalizeLinkCode } from "./link-code";
import { assertAllowedRedirect, kiorexCanonicalUrl, pageUrl, trackedPageUrl } from "./link-urls";
import { ProviderLinkCoreService } from "./provider-link-core.service";
import { isValidBookingSlug } from "../../marketplace/booking-slug";

/**
 * Public short-link resolver (no auth, no cookies). `kiorly.link` never redirects to a caller-supplied URL: it resolves a slug or a code to a stored
 * entity and redirects only to hosts that configuration allows (ARCH 4.2).
 *   GET /public/links/q/:code   -> 302 to the tracked page (`<page>/<slug>?s=<code>`); JSON `{target}` when `Accept: application/json`
 *   GET /public/links/go/:slug  -> 302 to the Kiorex canonical URL with the signed touch (`lt`) and UTM tags (counts one non-bot visit)
 */
@ApiTags("public")
@Controller("public/links")
@UseGuards(PublicAuthRateLimitGuard)
export class PublicLinkController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: ProviderLinkCoreService,
  ) {}

  @Get("q/:code")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "QR short link: resolve a link code to its public page (302, or JSON for the web app)" })
  async qr(@Param("code") rawCode: string, @Headers("accept") accept: string | undefined, @Res() res: Response) {
    const code = normalizeLinkCode(rawCode);
    const link = code ? await this.core.findByCode(code) : null;
    if (!link) throw new NotFoundException("Link not found");
    const target = await this.core.resolveTarget(link);
    if (!target?.slug) throw new NotFoundException("Link not found");
    // A paused or revoked link still opens the clinic's public page (printed QR codes must not break), just without attribution.
    const url = link.status === ReferralLinkStatus.ACTIVE ? trackedPageUrl(target.slug, link.code) : pageUrl(target.slug);
    const safe = assertAllowedRedirect(url);
    if (accept?.includes("application/json")) return res.status(HttpStatus.OK).json({ target: safe, status: link.status });
    return res.redirect(HttpStatus.FOUND, safe);
  }

  @Get("go/:slug")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Book from a public page: 302 to the Kiorex canonical provider URL with the signed touch parameters" })
  async go(@Param("slug") slug: string, @Query("s") s: string | undefined, @Req() req: Request, @Res() res: Response) {
    const norm = (slug ?? "").trim().toLowerCase();
    if (!isValidBookingSlug(norm)) throw new NotFoundException("Booking page not found");
    const clinic = await this.prisma.clinic.findFirst({ where: { bookingSlug: norm }, select: { id: true, tenantId: true, country: true } });
    const listing = clinic ? null : await this.prisma.marketplaceListing.findFirst({ where: { bookingSlug: norm }, select: { tenantId: true, clinic: { select: { country: true } } } });
    const tenantId = clinic?.tenantId ?? listing?.tenantId;
    if (!tenantId) throw new NotFoundException("Booking page not found");
    const touch = s ? await this.core.touch(s, tenantId, { bot: isLikelyBot(req.headers) }) : null;
    const url = kiorexCanonicalUrl({
      kind: clinic ? "clinic" : "doctor",
      slug: norm,
      country: clinic?.country ?? listing?.clinic.country,
      lt: touch?.lt ?? null,
      channelKind: touch?.link.channelKind,
      tags: touch?.link.tags,
    });
    return res.redirect(HttpStatus.FOUND, assertAllowedRedirect(url));
  }
}
