import "reflect-metadata";
import { ArgumentMetadata, PipeTransform, ValidationPipe } from "@nestjs/common";

const KEY = "kiorly:lenient-dto";

/**
 * Marks a DTO whose callers may send fields the DTO does not declare. The global pipe is strict (`forbidNonWhitelisted`: an undeclared field is a 400); a `@Lenient()` DTO
 * keeps `whitelist` (undeclared fields are DROPPED, so a service can never read one) but does not reject them. It exists for the DTOs that replaced inline-typed
 * `@Body() b: { ... }` parameters: those never rejected anything, so existing clients that send extra fields must keep working, while the declared fields are now validated.
 */
export function Lenient(): ClassDecorator {
  return (target) => Reflect.defineMetadata(KEY, true, target);
}
export const isLenient = (metatype: unknown): boolean => typeof metatype === "function" && Reflect.getMetadata(KEY, metatype) === true;

/** The application's ValidationPipe: strict by default, tolerant for `@Lenient()` DTOs. */
export class AppValidationPipe implements PipeTransform {
  private readonly strict = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  private readonly lenient = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true });
  transform(value: unknown, metadata: ArgumentMetadata) {
    return (isLenient(metadata.metatype) ? this.lenient : this.strict).transform(value, metadata);
  }
}
