import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AppointmentStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateAppointmentDto {
  @ApiProperty()
  @IsString()
  clinicId!: string;

  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiProperty()
  @IsString()
  clinicianId!: string;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional({
    description: "Optional scheduled end; set automatically when a linked encounter is finalized",
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({
    description: "Scheduled visit fee; defaults to the organization default visit fee",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feeAmount?: number;

  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
