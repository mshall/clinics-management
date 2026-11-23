import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PatientDocumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  originalFileName!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ description: "ORIGINAL_KEPT | LOSSLESS | REDUCED | FLOOR_REACHED" })
  qualityNote?: string | null;

  @ApiPropertyOptional()
  originalSizeBytes?: number | null;

  @ApiPropertyOptional()
  qualityUsed?: number | null;

  @ApiPropertyOptional({ description: "True when an untouched original was retained under …/orig/" })
  originalAvailable?: boolean;
}
