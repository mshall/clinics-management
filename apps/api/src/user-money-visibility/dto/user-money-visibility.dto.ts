import { ApiProperty } from "@nestjs/swagger";
import { FinancialVisibilityOverride } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UserMoneyVisibilityDto {
  @ApiProperty({ enum: FinancialVisibilityOverride })
  @IsEnum(FinancialVisibilityOverride)
  operations!: FinancialVisibilityOverride;

  @ApiProperty({ enum: FinancialVisibilityOverride })
  @IsEnum(FinancialVisibilityOverride)
  encounters!: FinancialVisibilityOverride;

  @ApiProperty({ enum: FinancialVisibilityOverride })
  @IsEnum(FinancialVisibilityOverride)
  appointments!: FinancialVisibilityOverride;
}

export class UserMoneyVisibilityResponseDto {
  @ApiProperty({ enum: FinancialVisibilityOverride })
  operations!: FinancialVisibilityOverride;

  @ApiProperty({ enum: FinancialVisibilityOverride })
  encounters!: FinancialVisibilityOverride;

  @ApiProperty({ enum: FinancialVisibilityOverride })
  appointments!: FinancialVisibilityOverride;
}