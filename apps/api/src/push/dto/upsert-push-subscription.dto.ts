import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpsertPushSubscriptionDto {
  @ApiProperty({ description: "PushService endpoint URL" })
  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  endpoint!: string;

  @ApiProperty({
    description: "Web Push keys from PushSubscription.toJSON()",
    example: { p256dh: "...", auth: "..." },
  })
  @IsObject()
  keys!: { p256dh: string; auth: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}
