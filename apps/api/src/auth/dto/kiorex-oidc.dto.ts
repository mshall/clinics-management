import { IsOptional, IsString, MaxLength } from "class-validator";

/** Body DTOs for the Kiorex Passport endpoints: decorated classes so the global whitelist ValidationPipe validates them (max lengths, unknown fields refused). */
export class KiorexCallbackDto {
  @IsOptional() @IsString() @MaxLength(4096) code?: string;
  @IsOptional() @IsString() @MaxLength(512) state?: string;
  @IsOptional() @IsString() @MaxLength(2048) iss?: string;
}

export class KiorexCompleteDto {
  @IsOptional() @IsString() @MaxLength(512) ticket?: string;
  @IsOptional() @IsString() @MaxLength(32) mfaCode?: string;
}

export class KiorexPasswordDto {
  @IsOptional() @IsString() @MaxLength(512) password?: string;
}

export class KiorexBackchannelDto {
  @IsOptional() @IsString() @MaxLength(16384) logout_token?: string;
}
