import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Allow, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Query of `inbox` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MobileInboxQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  cursor?: string;
}

/** Body of `ack` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MobileAckBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Body of `upgradeRequest` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MobileUpgradeRequestBodyDto {
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @Allow()
  featureKey?: unknown;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @Allow()
  note?: unknown;
}

/** Query of `schedule` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MobileScheduleQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  clinicId?: string;
}

/** Body of `approve` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MobileApproveBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}
