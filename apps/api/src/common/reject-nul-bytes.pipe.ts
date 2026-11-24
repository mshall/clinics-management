import { type ArgumentMetadata, BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";

/**
 * PostgreSQL text columns cannot hold U+0000: a search box, a note or a name containing a NUL byte (`?search=%00`, JSON "\u0000") reached the database and answered 500.
 * It is never legitimate text, so every query, path and body value is checked up front and refused with a 400 the client can show.
 */
export function containsNul(value: unknown, depth = 0): boolean {
  if (typeof value === "string") return value.includes("\u0000");
  if (depth > 8 || value === null || typeof value !== "object" || Buffer.isBuffer(value)) return false;
  if (Array.isArray(value)) return value.some((v) => containsNul(v, depth + 1));
  return Object.entries(value as Record<string, unknown>).some(([k, v]) => k.includes("\u0000") || containsNul(v, depth + 1));
}

@Injectable()
export class RejectNulBytesPipe implements PipeTransform {
  transform(value: unknown, meta: ArgumentMetadata) {
    if (meta.type !== "custom" && containsNul(value)) throw new BadRequestException({ code: "INVALID_CHARACTER", message: "Text must not contain NUL (\\u0000) characters" });
    return value;
  }
}
