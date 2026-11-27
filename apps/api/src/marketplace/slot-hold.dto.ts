import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Allow, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `POST /marketplace/v1/holds` (KX-04). Was `Record<string, unknown>` cast to `CreateSlotHoldInput`, so a missing `externalRef` surfaced as a TypeError. */
@Lenient()
export class CreateSlotHoldBodyDto {
  @ApiProperty() @IsString() clinicId!: string;
  @ApiProperty() @IsString() clinicianId!: string;
  @ApiProperty() @IsString() typeId!: string;
  @ApiProperty({ description: "ISO 8601 start of the slot" }) @IsString() startsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endsAt?: string;
  @ApiPropertyOptional({ description: "Market Kiorex resolved for the provider; a different one than the organisation's own is refused (409 CROSS_MARKET_BOOKING)" }) @IsOptional() @IsString() market?: string;
  @ApiProperty({ description: "The caller's reference; one live hold per reference" }) @IsString() externalRef!: string;
  @ApiPropertyOptional({ description: "Required for HOME visit types, ignored (never stored) for in-clinic types", type: Object }) @IsOptional() @Allow() visitAddress?: unknown;
}
