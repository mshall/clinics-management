import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class PatchOnboardingStepDto {
  /** "complete" is rejected: every step is detected from real data. Only optional steps can be skipped. */
  @ApiProperty({ enum: ["complete", "skip"] })
  @IsIn(["complete", "skip"])
  action!: "complete" | "skip";

  /** Clinic id for per-clinic steps (skip only that entity). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;
}
