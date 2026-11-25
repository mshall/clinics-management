import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** SUB-01 platform force of auto-renew: ON, OFF, or null to release the force. Reason is mandatory (audited). */
@Lenient()
export class PlatformForceAutoRenewBodyDto {
  @ApiProperty({ enum: ["ON", "OFF"], nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @IsIn(["ON", "OFF"])
  force!: "ON" | "OFF" | null;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

@Lenient()
export class PlatformForceDowngradeBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** The policy object itself is validated field by field by the zod schema in SubscriptionPolicyService (one source of truth). */
@Lenient()
export class ProposeSubscriptionPolicyBodyDto {
  @ApiProperty({ type: Object })
  @IsObject()
  policy!: Record<string, unknown>;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

@Lenient()
export class DecideSubscriptionPolicyBodyDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
