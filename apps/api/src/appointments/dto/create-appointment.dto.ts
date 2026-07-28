import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AppointmentStatus } from "@prisma/client";
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

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
    description: "Optional custom end; defaults to a 15-minute slot from startsAt when omitted",
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({
    description: "Set true to book alongside an existing appointment at the same time",
  })
  @IsOptional()
  @IsBoolean()
  confirmOverlap?: boolean;

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
