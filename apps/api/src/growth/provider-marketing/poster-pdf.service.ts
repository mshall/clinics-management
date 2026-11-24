import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ReferralLinkStatus } from "@prisma/client";
import { buildBilingualPdf, type PdfSection } from "../../billing-platform/bilingual-pdf";
import type { JwtUser } from "../../auth/jwt-user";
import { PrismaService } from "../../prisma/prisma.service";
import { shortUrl } from "../provider-links/link-urls";
import { ProviderLinksService } from "../provider-links/provider-links.service";

const TEXT = {
  en: { head: "Book online", sub: "Scan the code with your phone camera to see available times.", foot: "Appointments depend on availability and are confirmed by the clinic." },
  ar: { head: "احجز أونلاين", sub: "امسح الرمز بكاميرا هاتفك لمعرفة المواعيد المتاحة.", foot: "المواعيد حسب التوافر وتؤكدها العيادة." },
} as const;

/** GRW-P2-C: server PDF of the QR poster (closes the D1 "no server PDF" gap). AR or EN, RTL for Arabic; the QR payload is the short link only. */
@Injectable()
export class PosterPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: ProviderLinksService,
  ) {}

  async render(user: JwtUser, id: string, langRaw?: string): Promise<{ pdf: Buffer; filename: string }> {
    const tenantId = this.links.assert(user, "view");
    const link = await this.prisma.providerReferralLink.findFirst({ where: { id, tenantId } });
    if (!link) throw new NotFoundException("Link not found");
    if (link.status === ReferralLinkStatus.REVOKED) throw new ConflictException({ code: "GROWTH_LINK_REVOKED", message: "This link was revoked" });
    const lang = langRaw === "ar" ? "ar" : "en";
    const clinic = await this.prisma.clinic.findFirst({ where: { id: link.clinicId, tenantId }, select: { nameEn: true, nameAr: true } });
    const name = (lang === "ar" ? clinic?.nameAr || clinic?.nameEn : clinic?.nameEn) ?? "";
    const t = TEXT[lang];
    const section: PdfSection = {
      direction: lang === "ar" ? "rtl" : "ltr",
      rows: [
        { kind: "text", text: name, size: 22, bold: true },
        { kind: "gap", height: 10 },
        { kind: "text", text: t.head, size: 30, bold: true },
        { kind: "text", text: t.sub, size: 13 },
        { kind: "gap", height: 14 },
        { kind: "qr", text: shortUrl(link.code), size: 260 },
        { kind: "gap", height: 8 },
        { kind: "text", text: shortUrl(link.code).replace(/^https?:\/\//, ""), size: 12 },
        { kind: "gap", height: 18 },
        { kind: "text", text: t.foot, size: 9 },
      ],
    };
    return { pdf: buildBilingualPdf([section]), filename: `poster-${link.code}-${lang}.pdf` };
  }
}
