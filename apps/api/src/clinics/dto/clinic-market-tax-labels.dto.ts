import { ApiProperty } from "@nestjs/swagger";

export class ClinicMarketTaxLabelsDto {
  @ApiProperty()
  taxAuthorityNameEn!: string;

  @ApiProperty()
  taxAuthorityNameAr!: string;

  @ApiProperty()
  taxRegistrationLabelEn!: string;

  @ApiProperty()
  taxRegistrationLabelAr!: string;

  @ApiProperty()
  licenseLabelEn!: string;

  @ApiProperty()
  licenseLabelAr!: string;
}