import { ApiProperty } from "@nestjs/swagger";
import { IntegrationWebhookEvent } from "@prisma/client";
import { ArrayNotEmpty, IsArray, IsEnum, IsUrl, MaxLength } from "class-validator";

export class CreateIntegrationWebhookDto {
  @ApiProperty({ example: "https://patient-portal.example.com/webhooks/kiorly" })
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  url!: string;

  @ApiProperty({ enum: IntegrationWebhookEvent, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(IntegrationWebhookEvent, { each: true })
  eventTypes!: IntegrationWebhookEvent[];
}
