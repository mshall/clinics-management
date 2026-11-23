import { ApiPropertyOptional } from "@nestjs/swagger";
import { AppointmentStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";
import { ScheduledFeeCollectionDto } from "../../common/dto/scheduled-fee-collection.dto";

export class UpdateAppointmentDto {
  @ApiPropertyOptional({ enum: ["IN_CLINIC", "TELEHEALTH"], description: "ADR-039: convert between in-person and telehealth (the link then says 'changed to in-person')" })
  @IsOptional()
  @IsIn(["IN_CLINIC", "TELEHEALTH"])
  visitMode?: "IN_CLINIC" | "TELEHEALTH";

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
  clinicianId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @ApiPropertyOptional({ description: "Scheduled visit fee; syncs to a linked open encounter when changed" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feeAmount?: number;

  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ description: "Required when cancelling a Kiorex booking (shown to the patient)" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancellationReason?: string | null;

  @ApiPropertyOptional({ description: "Scheduled fee payment plan (cash vs transfer channel)" })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduledFeeCollectionDto)
  scheduledFeeCollection?: ScheduledFeeCollectionDto | null;
}
