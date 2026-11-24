import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Allow, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Query of `inbox` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MobileInboxQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  cursor?: string;
}

/** Body of `ack` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MobileAckBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Body of `upgradeRequest` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MobileUpgradeRequestBodyDto {
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @Allow()
  featureKey?: unknown;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @Allow()
  note?: unknown;
}

/** Query of `schedule` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MobileScheduleQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  clinicId?: string;
}

/** Body of `approve` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class MobileApproveBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Body of `POST mobile/devices` (was `Record<string, unknown>` plus hand checks). */
@Lenient()
export class MobileRegisterDeviceBodyDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) deviceId!: string;
  @ApiProperty({ enum: ["ios", "android", "web"] }) @IsIn(["ios", "android", "web"]) platform!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() appVersion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pushToken?: string;
}

/** Body of `PUT mobile/devices/:id/push-token`. */
@Lenient()
export class MobilePushTokenBodyDto {
  @ApiProperty({ enum: ["expo", "mock"] }) @IsIn(["expo", "mock"]) provider!: "expo" | "mock";
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(300) token!: string;
}

/** Body of `POST mobile/vitals`: a patient and any subset of the numeric readings (range checks live in `validateVitalsInput`, which also handles nulls). */
@Lenient()
export class MobileRecordVitalsBodyDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) patientId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) appointmentId?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) systolic?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) diastolic?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) pulse?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) temperatureC?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) spo2?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) respiratoryRate?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) glucoseMgDl?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) painScore?: number | null;
}
