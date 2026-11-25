import { IsOptional, IsString, MaxLength } from "class-validator";
import { Lenient } from "../../common/lenient-dto";

@Lenient()
export class B2bReferralBodyDto {
  @IsOptional() @IsString() @MaxLength(64) clinicId?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(20) sizeBucket?: string;
  @IsOptional() @IsString() @MaxLength(200) contactRef?: string;
}
