import type { ExceptionFilter } from "@nestjs/common";
import { MulterExceptionFilter } from "./multer-exception.filter";
import { PrismaClientExceptionFilter } from "./prisma-exception.filter";

/**
 * Nest tries LATER global filters first, so the catch-all (`catchAll`, @Catch() with no types) must come FIRST or it shadows every specific filter. It used to be
 * registered last, so the Prisma and Multer filters never ran and DB faults came back as plain 500s.
 */
export function orderedGlobalFilters(catchAll: ExceptionFilter): ExceptionFilter[] {
  return [catchAll, new MulterExceptionFilter(), new PrismaClientExceptionFilter()];
}
