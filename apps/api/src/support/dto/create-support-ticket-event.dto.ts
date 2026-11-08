import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateSupportTicketEventDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  eventType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  message?: string;
}
