import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import type { PaymentMethod } from "@prisma/client";

/** Body of `approveRefund` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PatientMoneyApproveRefundBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Body of `rejectRefund` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PatientMoneyRejectRefundBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Body of `consumePackage` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PatientMoneyConsumePackageBodyDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  appointmentId?: string | null;
}

/** Body of `cancelPackage` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PatientMoneyCancelPackageBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ enum: ["CASH", "CARD", "TRANSFER", "WALLET", "OTHER", "KIOREX_PAY"] })
  @IsOptional()
  @IsIn(["CASH", "CARD", "TRANSFER", "WALLET", "OTHER", "KIOREX_PAY"])
  method?: PaymentMethod;
}

/** Body of `applyDeposit` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PatientMoneyApplyDepositBodyDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  appointmentId?: string | null;
}

/** Body of `releaseDeposit` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PatientMoneyReleaseDepositBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ enum: ["RELEASED", "FORFEITED"] })
  @IsOptional()
  @IsIn(["RELEASED", "FORFEITED"])
  outcome?: "RELEASED" | "FORFEITED";
}

/** Body of `markDepositPaid` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PatientMoneyMarkDepositPaidBodyDto {
  @ApiProperty({ enum: ["CASH", "CARD", "TRANSFER", "WALLET", "OTHER", "KIOREX_PAY"] })
  @IsIn(["CASH", "CARD", "TRANSFER", "WALLET", "OTHER", "KIOREX_PAY"])
  method!: PaymentMethod;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  reference?: string;
}
