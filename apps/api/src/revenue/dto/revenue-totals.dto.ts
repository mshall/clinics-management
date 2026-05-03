import { ApiProperty } from "@nestjs/swagger";

export class RevenueTotalsDto {
  @ApiProperty()
  grossTotal!: number;

  @ApiProperty()
  netTotal!: number;
}
