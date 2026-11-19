import { CommissionDisputeReason } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class OpenCommissionDisputeDto {
  @IsEnum(CommissionDisputeReason)
  reason!: CommissionDisputeReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}