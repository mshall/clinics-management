import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class FeatureFlagDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;
}
