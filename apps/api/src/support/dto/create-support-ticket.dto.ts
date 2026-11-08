import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SupportProductModule, SupportTicketPriority } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateSupportTicketDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  description!: string;

  @ApiProperty({ enum: SupportProductModule })
  @IsEnum(SupportProductModule)
  module!: SupportProductModule;

  @ApiPropertyOptional({ enum: SupportTicketPriority })
  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clinicId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkedAuditLogId?: string;
}
