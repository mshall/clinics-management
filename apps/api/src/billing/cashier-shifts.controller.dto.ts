import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `open` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class CashierShiftsOpenBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  openingFloat!: number;
}

/** Body of `close` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class CashierShiftsCloseBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  countedCash!: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  countedCard?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Body of `review` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class CashierShiftsReviewBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}
