import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UserNavTabGrantResponseDto {
  @ApiPropertyOptional({
    description: "Saved tab keys, or null when the user follows role defaults",
    type: [String],
    nullable: true,
  })
  tabKeys!: string[] | null;
}
