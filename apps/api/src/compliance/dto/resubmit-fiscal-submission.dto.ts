import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class ResubmitFiscalSubmissionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  buyerName?: string | null;

  @ApiPropertyOptional({ description: "ETA GPC item code" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  itemCode?: string | null;

  @ApiPropertyOptional({ description: "Issuer tax registration (RIN)" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  issuerRin?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  taxpayerActivityCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  branchCode?: string | null;
}