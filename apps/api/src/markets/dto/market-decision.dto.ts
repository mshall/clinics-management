import { Allow, IsOptional, IsString, MaxLength } from "class-validator";
import { Lenient } from "../../common/lenient-dto";

/** Approve or reject a second-approver request. */
@Lenient()
export class DecideChangeRequestDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** Turn the optional second-approver rule on or off. `requireSecondApprover` is checked for a real boolean in the service (400 REQUIRE_SECOND_APPROVER_INVALID). */
@Lenient()
export class SecondApproverDto {
  @Allow() requireSecondApprover?: unknown;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() approvalRef?: string;
  @IsOptional() @IsString() approvalLink?: string;
}
