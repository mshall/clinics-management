import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `addAdjustment` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class RevenueShareAddAdjustmentBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @ApiProperty({ type: String })
  @IsString()
  note!: string;
}

/** Body of `markPaid` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class RevenueShareMarkPaidBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;
}
