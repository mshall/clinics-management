import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `upsertPayer` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClaimsUpsertPayerBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ type: String })
  @IsString()
  nameEn!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  contractRef?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Body of `createBatch` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClaimsCreateBatchBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  payerCompanyId!: string;

  @ApiProperty({ type: String })
  @IsString()
  periodFrom!: string;

  @ApiProperty({ type: String })
  @IsString()
  periodTo!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invoiceIds?: string[];
}

/** Body of `rejectLine` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClaimsRejectLineBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  reason!: string;
}

/** Body of `importRemittance` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClaimsImportRemittanceBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  payerCompanyId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiProperty({ type: String })
  @IsString()
  reference!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  lines!: { externalRef: string; amount: number }[];
}
