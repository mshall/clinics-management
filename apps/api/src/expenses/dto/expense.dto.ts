import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ExpenseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiProperty()
  category!: string;

  @ApiPropertyOptional({ nullable: true })
  vendorName!: string | null;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  incurredAt!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ description: "Whether a payment proof file was uploaded" })
  hasProof!: boolean;

  @ApiPropertyOptional({ nullable: true, description: "Original filename of the proof, when present" })
  proofOriginalName!: string | null;
}
