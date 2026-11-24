import { BadRequestException, PipeTransform } from "@nestjs/common";
import { registerDecorator, type ValidationOptions } from "class-validator";

/**
 * Strict schema limits for the few bodies whose shape is genuinely free-form (a JSON note, a form-template section tree, a data-explorer row whose columns
 * depend on the table): a plain object / array only, bounded in serialized size, depth, key count and string length, with no prototype-polluting keys.
 * The limits exist so a hostile body cannot cost memory or CPU before a service looks at it; the service still validates what it reads.
 */
export interface JsonLimits { maxBytes: number; maxDepth: number; maxKeys: number; maxStringLength: number }
export const DEFAULT_JSON_LIMITS: JsonLimits = { maxBytes: 256 * 1024, maxDepth: 12, maxKeys: 2000, maxStringLength: 20_000 };
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Returns the reason a value breaks the limits, or null. Only JSON values are legal (no functions, bigint, NaN or Infinity). */
export function boundedJsonProblem(value: unknown, limits: Partial<JsonLimits> = {}): string | null {
  const l = { ...DEFAULT_JSON_LIMITS, ...limits };
  let keys = 0;
  const walk = (v: unknown, depth: number): string | null => {
    if (v === null || typeof v === "boolean") return null;
    if (typeof v === "number") return Number.isFinite(v) ? null : "numbers must be finite";
    if (typeof v === "string") return v.length > l.maxStringLength ? `a string is longer than ${l.maxStringLength} characters` : null;
    if (typeof v !== "object") return `unsupported value type ${typeof v}`;
    if (depth > l.maxDepth) return `nesting is deeper than ${l.maxDepth} levels`;
    if (Array.isArray(v)) {
      keys += v.length;
      if (keys > l.maxKeys) return `more than ${l.maxKeys} values`;
      for (const x of v) { const p = walk(x, depth + 1); if (p) return p; }
      return null;
    }
    for (const k of Object.keys(v as object)) {
      if (FORBIDDEN_KEYS.has(k)) return `the key "${k}" is not allowed`;
      if (++keys > l.maxKeys) return `more than ${l.maxKeys} values`;
      const p = walk((v as Record<string, unknown>)[k], depth + 1);
      if (p) return p;
    }
    return null;
  };
  const structural = walk(value, 0);
  if (structural) return structural;
  try { if (Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") > l.maxBytes) return `larger than ${l.maxBytes} bytes`; } catch { return "not serializable"; }
  return null;
}

/** class-validator decorator: the property is a JSON object or array within the limits. */
export function IsBoundedJson(limits: Partial<JsonLimits> = {}, options?: ValidationOptions & { allowArray?: boolean }) {
  return (target: object, propertyName: string) => registerDecorator({
    name: "isBoundedJson", target: target.constructor, propertyName, options,
    validator: {
      validate: (v: unknown) => v !== null && typeof v === "object" && (options?.allowArray !== false || !Array.isArray(v)) && boundedJsonProblem(v, limits) === null,
      defaultMessage: (a) => `${a?.property} must be a JSON object${options?.allowArray === false ? "" : " or array"} within ${JSON.stringify({ ...DEFAULT_JSON_LIMITS, ...limits })}${(() => { const p = boundedJsonProblem((a?.value as unknown) ?? null, limits); return p ? ` (${p})` : ""; })()}`,
    },
  });
}

/** class-validator decorator: a finite number, or a string holding one (forms and Decimal columns send both), optionally within [min, max]. */
export function IsNumberLike(range: { min?: number; max?: number } = {}, options?: ValidationOptions) {
  return (target: object, propertyName: string) => registerDecorator({
    name: "isNumberLike", target: target.constructor, propertyName, options,
    validator: {
      validate: (v: unknown) => {
        const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && v.length <= 40 ? Number(v) : NaN;
        return Number.isFinite(n) && (range.min === undefined || n >= range.min) && (range.max === undefined || n <= range.max);
      },
      defaultMessage: (a) => `${a?.property} must be a number${range.min !== undefined ? ` >= ${range.min}` : ""}${range.max !== undefined ? ` <= ${range.max}` : ""}`,
    },
  });
}

/**
 * Pipe for a body that has no fixed shape (the data explorer's per-table rows, a JSON note): must be a plain JSON object within the limits. Unlike a whitelisted DTO it keeps
 * every key, so the owning service remains the one place that decides which fields it reads.
 */
export class BoundedObjectPipe implements PipeTransform {
  constructor(private readonly limits: Partial<JsonLimits> = {}, private readonly allowEmpty = true) {}
  transform(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) { if (this.allowEmpty) return {}; throw new BadRequestException("A JSON object body is required"); }
    if (typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("The body must be a JSON object");
    const problem = boundedJsonProblem(value, this.limits);
    if (problem) throw new BadRequestException(`The body is not acceptable: ${problem}`);
    return value as Record<string, unknown>;
  }
}
