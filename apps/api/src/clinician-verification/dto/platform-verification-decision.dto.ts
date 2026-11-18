import { IsArray, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class PlatformVerificationDecisionDto {
  @IsIn(["approve", "reject"])
  decision!: "approve" | "reject";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectReason?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checklist?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  rejectReasonCode?: string;
}