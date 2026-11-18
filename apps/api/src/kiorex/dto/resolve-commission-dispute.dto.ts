import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ResolveCommissionDisputeDto {
  @IsIn(["APPROVE", "REJECT"])
  decision!: "APPROVE" | "REJECT";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}