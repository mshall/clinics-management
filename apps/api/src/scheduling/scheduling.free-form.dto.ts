import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { IsBoundedJson, IsNumberLike } from "../common/bounded-json";
import { Lenient } from "../common/lenient-dto";

/** Shared optional fields of an appointment type (create/replace and patch). Money is a number or a numeric string (Decimal column), minutes are bounded to a day. */
class AppointmentTypeFields {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) nameAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumberLike({ min: 1, max: 1440 }) durationMinutes?: number | string;
  @ApiPropertyOptional() @IsOptional() @IsNumberLike({ min: 0, max: 1_000_000_000 }) feeAmount?: number | string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) colorHex?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumberLike({ min: 0, max: 1440 }) bufferBeforeMin?: number | string;
  @ApiPropertyOptional() @IsOptional() @IsNumberLike({ min: 0, max: 1440 }) bufferAfterMin?: number | string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresRoom?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketplaceBookable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumberLike({ min: 0, max: 525_600 }) minNoticeMinutes?: number | string;
  @ApiPropertyOptional() @IsOptional() @IsNumberLike({ min: 0, max: 730 }) maxDaysAhead?: number | string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() newPatientOnly?: boolean;
  @ApiPropertyOptional({ nullable: true, description: "number, numeric string, null or empty string (= no deposit)" })
  @ValidateIf((_o, v) => v !== undefined && v !== null && v !== "") @IsNumberLike({ min: 0, max: 1_000_000_000 }) depositAmount?: number | string | null;
}

/** Body of `POST scheduling/appointment-types` (create, or replace when `id` is set). Was `Record<string, unknown>`. */
@Lenient()
export class SchedulingSaveTypeBodyDto extends AppointmentTypeFields {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) id?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) nameEn!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(100) clinicId?: string | null;
}

/** Body of `PATCH scheduling/appointment-types/:id`: any subset of the fields; an empty patch is a 400 from the service. Was `Record<string, unknown>`. */
@Lenient()
export class SchedulingPatchTypeBodyDto extends AppointmentTypeFields {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) nameEn?: string;
}

/** Body of `PUT scheduling/availability`: ids plus the weekly template, whose deep structure `parseAndValidateWeekJson` checks; here it is bounded. Was `Record<string, unknown>`. */
@Lenient()
export class SchedulingPutAvailabilityBodyDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) clinicId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) clinicianId!: string;
  @ApiProperty({ type: Object }) @IsBoundedJson({ maxBytes: 64 * 1024, maxDepth: 6, maxKeys: 600 }) weekJson!: unknown;
  @ApiPropertyOptional({ type: Object, nullable: true }) @IsOptional() @IsBoundedJson({ maxBytes: 64 * 1024, maxDepth: 6, maxKeys: 600 }) blockedJson?: unknown;
}

/** Body of `POST scheduling/waitlist`. Was `Record<string, unknown>`. */
@Lenient()
export class SchedulingAddWaitlistBodyDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) clinicId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) patientId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) clinicianId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) appointmentTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() preferredFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() preferredTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

/** Body of `POST scheduling/series` (a package of recurring visits). Was `Record<string, unknown>`. */
@Lenient()
export class SchedulingSeriesBodyDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) clinicId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) patientId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) clinicianId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) appointmentTypeId?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) label!: string;
  @ApiProperty({ description: "clamped to 1..52 by the service" }) @Type(() => Number) @IsInt() @Min(1) @Max(1000) totalSessions!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(1_000_000_000) packagePaidAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) cadenceDays?: number;
  @ApiProperty() @IsDateString() startsOn!: string;
}
