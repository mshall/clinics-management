import { ApiProperty } from "@nestjs/swagger";

export class CurrencyTotalDto {
  @ApiProperty({ example: "AED" })
  currency!: string;

  @ApiProperty()
  amount!: number;
}

export class CurrencyRevenueTotalsDto {
  @ApiProperty({ example: "AED" })
  currency!: string;

  @ApiProperty()
  grossTotal!: number;

  @ApiProperty()
  netTotal!: number;
}
