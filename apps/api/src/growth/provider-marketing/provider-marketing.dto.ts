import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { IsNumberLike } from "../../common/bounded-json";
import { Lenient } from "../../common/lenient-dto";

/**
 * Bodies of the GRW-P2-C provider marketing endpoints (web `growth/*`, staff app `mobile/growth/*`, signed `marketplace/v1/provider-verification/decisions`).
 * They replaced inline-typed and `Record<string, unknown>` bodies. Types and sizes are validated here; the required-field and business checks (template
 * exists, 1 to 5 slots, evidence reference shape, decision value) stay in the services so their stable error codes do not change. `@Lenient()`: undeclared
 * fields are dropped (so a client can never set the service-only `noLinkCreate`, `selfOnly` or `now`), never a 400.
 */

/** `POST growth/social/render` and `POST mobile/growth/share/render`. */
@Lenient()
export class SocialRenderBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) templateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) clinicId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) clinicianId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) linkId?: string;
  @ApiPropertyOptional({ enum: ["ar", "en"] }) @IsOptional() @IsString() @MaxLength(10) locale?: string;
  @ApiPropertyOptional({ description: "Optional custom line; the content guard applies" }) @IsOptional() @IsString() @MaxLength(500) customLine?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() png?: boolean;
}

/** `POST growth/social/share` and `POST mobile/growth/share/count`. */
@Lenient()
export class SocialShareBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) templateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) clinicId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) channel?: string;
}

/** `POST growth/shareable-slots/card` and `POST mobile/growth/slots/card`. */
@Lenient()
export class SlotCardBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) clinicId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) clinicianId?: string;
  @ApiPropertyOptional({ type: [String], description: "1 to 5 ISO date-times (the service enforces the range and re-checks each slot)" })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true }) startsAt?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) linkId?: string;
  @ApiPropertyOptional({ enum: ["ar", "en"] }) @IsOptional() @IsString() @MaxLength(10) locale?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() png?: boolean;
}

/** `POST growth/recommendations/:id/state`. */
@Lenient()
export class RecommendationStateBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) clinicId?: string;
  @ApiPropertyOptional({ enum: ["DISMISSED", "SNOOZED", "DONE", "OPEN"] }) @IsOptional() @IsString() @MaxLength(20) status?: string;
  @ApiPropertyOptional({ description: "1 to 90 (the service enforces the range)", type: Number }) @IsOptional() @IsNumberLike() snoozeDays?: number;
}

/** `POST growth/verification-requests` and `POST mobile/growth/verification`. */
@Lenient()
export class VerificationCreateBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) clinicId?: string;
  @ApiPropertyOptional({ description: "LICENCE_NUMBER, SPECIALTY, ADDRESS, DISPLAY_NAME, PHOTO or DOCUMENT" }) @IsOptional() @IsString() @MaxLength(40) field?: string;
  @ApiPropertyOptional({ description: "Encrypted at rest" }) @IsOptional() @IsString() @MaxLength(2000) newValue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) oldRef?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(300, { each: true }) evidenceFileRefs?: string[];
}

/** `POST growth/verification-requests/:id/evidence`. */
@Lenient()
export class VerificationEvidenceBodyDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(300, { each: true }) evidenceFileRefs?: string[];
}

/** `POST marketplace/v1/provider-verification/decisions` (`ProviderVerificationDecided`, signed by Kiorex). */
@Lenient()
export class VerificationDecisionBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) requestRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) kiorexRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) orgRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) clinicId?: string;
  @ApiPropertyOptional({ enum: ["APPROVED", "REJECTED", "NEEDS_INFO"] }) @IsOptional() @IsString() @MaxLength(20) decision?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @ApiPropertyOptional({ description: "ISO 8601" }) @IsOptional() @IsString() @MaxLength(40) decidedAt?: string;
}
