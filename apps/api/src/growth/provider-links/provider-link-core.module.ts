import { Module } from "@nestjs/common";
import { ProviderLinkCoreService } from "./provider-link-core.service";

/** Prisma-only half of provider links so the Marketplace module (public page, booking intake) can use it without a module cycle with Growth. */
@Module({ providers: [ProviderLinkCoreService], exports: [ProviderLinkCoreService] })
export class ProviderLinkCoreModule {}
