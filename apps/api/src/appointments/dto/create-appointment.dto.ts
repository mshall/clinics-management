import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AppointmentStatus, BookingSource } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { ScheduledFeeCollectionDto } from "../../common/dto/scheduled-fee-collection.dto";
import { ProvisionalPatientDto } from "./provisional-patient.dto";

export class CreateAppointmentDto {
  @ApiPropertyOptional({ enum: ["IN_CLINIC", "TELEHEALTH"], description: "ADR-039: TELEHEALTH creates the linked video session (flag telehealth.video + doctor offers telehealth)" })
  @IsOptional()
  @IsIn(["IN_CLINIC", "TELEHEALTH"])
  visitMode?: "IN_CLINIC" | "TELEHEALTH";

  @ApiProperty()
  @IsString()
  clinicId!: string;

  @ApiPropertyOptional({
    description: "Existing patient id. Omit when provisionalPatient is provided for a first-time booking.",
  })
  @ValidateIf((o: CreateAppointmentDto) => !o.provisionalPatient)
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({
    type: ProvisionalPatientDto,
    description: "Quick intake for a first-time visit without a finished patient profile",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProvisionalPatientDto)
  provisionalPatient?: ProvisionalPatientDto;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appointmentTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seriesId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowDoubleBook?: boolean;

  @ApiPropertyOptional({
    description: "How the scheduled fee will be paid (cash on visit vs organization payment channel)",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduledFeeCollectionDto)
  scheduledFeeCollection?: ScheduledFeeCollectionDto;

  @ApiPropertyOptional({ enum: BookingSource, description: "Defaults to FRONT_DESK for staff-created bookings" })
  @IsOptional()
  @IsEnum(BookingSource)
  bookingSource?: BookingSource;

  @ApiPropertyOptional({ description: "Kiorex / campaign attribution (search id, campaign, landing page)" })
  @IsOptional()
  attributionJson?: Record<string, unknown>;
}
