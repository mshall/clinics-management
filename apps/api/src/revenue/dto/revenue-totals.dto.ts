import { ApiProperty } from "@nestjs/swagger";
import { CurrencyRevenueTotalsDto } from "../../common/dto/currency-totals.dto";

export class RevenueTotalsDto {
  @ApiProperty({ description: "Legacy mixed-currency sum; prefer byCurrency when multiple currencies are present" })
  grossTotal!: number;

  @ApiProperty({ description: "Legacy mixed-currency sum; prefer byCurrency when multiple currencies are present" })
  netTotal!: number;

  @ApiProperty({ type: [CurrencyRevenueTotalsDto] })
  byCurrency!: CurrencyRevenueTotalsDto[];
}
