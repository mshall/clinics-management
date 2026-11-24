import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `cancelBooking` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MarketplaceCancelBookingBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Body of `rescheduleBooking` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MarketplaceRescheduleBookingBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  startsAt!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  endsAt?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  holdId?: string;
}

/** Body of `upsertRecordShareConsents` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MarketplaceUpsertRecordShareConsentsBodyDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  consents!: { scope: string; granted: boolean }[];
}
