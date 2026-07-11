import { ApiProperty } from "@nestjs/swagger";

export class UnlinkedUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  role!: string;
}
