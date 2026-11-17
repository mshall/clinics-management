import { ApiProperty } from "@nestjs/swagger";
import { MessageChannel } from "@prisma/client";

export class MessagingConsentItemDto {
  @ApiProperty({ enum: MessageChannel })
  channel!: MessageChannel;

  @ApiProperty({ enum: ["TRANSACTIONAL", "MARKETING"] })
  purpose!: string;

  @ApiProperty()
  granted!: boolean;

  @ApiProperty({ nullable: true })
  source!: string | null;

  @ApiProperty({ nullable: true })
  updatedAt!: string | null;
}

export class PutMessagingConsentDto {
  @ApiProperty({ type: [MessagingConsentItemDto] })
  consents!: { channel: MessageChannel; purpose: string; granted: boolean }[];
}