import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UserNavTabGrantResponseDto {
  @ApiPropertyOptional({
    description: "Saved tab keys, or null when the user follows role defaults",
    type: [String],
    nullable: true,
  })
  tabKeys!: string[] | null;

  @ApiPropertyOptional({
    description: "Per-tab read/write when saved on the user grant",
    type: "object",
    additionalProperties: { type: "string", enum: ["read", "write"] },
    nullable: true,
  })
  tabAccessModes?: Record<string, "read" | "write"> | null;

  @ApiPropertyOptional({
    description: "Effective role tab baseline for this user's primary role (for admin UI)",
    type: [String],
  })
  roleTabKeys?: string[] | null;
}
