import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import type { DevDeliveryState } from "./dev-inbox.service";

/** Body of `delivery` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class DevInboxDeliveryBodyDto {
  @ApiProperty({ enum: ["delivered", "read", "failed", "bounced"] })
  @IsIn(["delivered", "read", "failed", "bounced"])
  state!: DevDeliveryState;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  error?: string;
}

/** Body of `inbound` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class DevInboxInboundBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  fromPhone!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  buttonPayload?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  replyToId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  toDisplayPhone?: string;
}

/** Body of `psp` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class DevInboxPspBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  provider!: string;

  @ApiProperty({ enum: ["succeeded", "failed"] })
  @IsIn(["succeeded", "failed"])
  outcome!: "succeeded" | "failed";

  @ApiProperty({ type: String })
  @IsString()
  tenantId!: string;

  @ApiProperty({ type: String })
  @IsString()
  invoiceId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

/** Body of `pspRefund` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class DevInboxPspRefundBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  paymentId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  amount?: string;
}

/** Body of `sendTest` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class DevInboxSendTestBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  channel!: string;

  @ApiProperty({ type: String })
  @IsString()
  to!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  templateKey?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  tenantId?: string;
}
