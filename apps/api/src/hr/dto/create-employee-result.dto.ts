import { ApiPropertyOptional } from "@nestjs/swagger";
import { EmployeeDto } from "./employee.dto";

export class CreateEmployeeResultDto extends EmployeeDto {
  @ApiPropertyOptional({ description: "Login email when a new account was provisioned" })
  createdLoginEmail?: string;

  @ApiPropertyOptional({ description: "Temporary login password (shown once after create)" })
  createdLoginPassword?: string;

  @ApiPropertyOptional()
  createdLoginRole?: string;
}
