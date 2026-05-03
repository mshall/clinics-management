import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RevenueEntryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiProperty()
  category!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  grossAmount!: number;

  @ApiProperty()
  taxAmount!: number;

  @ApiProperty()
  netAmount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  postedAt!: string;

  @ApiProperty()
  status!: string;
}
