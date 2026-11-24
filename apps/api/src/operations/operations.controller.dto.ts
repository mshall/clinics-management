import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `resetClinical` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class OperationsResetClinicalBodyDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  clearPrescription?: boolean;
}

/** Body of `addSupply` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class OperationsAddSupplyBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  itemName!: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  catalogCode?: string;
}

/** Body of `setInstallments` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class OperationsSetInstallmentsBodyDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  rows!: { dueOn: string; amount: number }[];
}
