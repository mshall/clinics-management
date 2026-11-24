import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import type { MessageChannel } from "@prisma/client";

/** Body of `send` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MessagingSendBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  appointmentId?: string;

  @ApiProperty({ enum: ["SMS", "WHATSAPP", "EMAIL"] })
  @IsIn(["SMS", "WHATSAPP", "EMAIL"])
  channel!: MessageChannel;

  @ApiProperty({ type: String })
  @IsString()
  toPhone!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  templateKey?: string;

  @ApiProperty({ type: String })
  @IsString()
  body!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}
