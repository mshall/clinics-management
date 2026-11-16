import { UserRole } from "@prisma/client";

export function isCallCenterRole(role: UserRole | undefined): boolean {
  return role === UserRole.CALL_CENTER || String(role) === "CALL_CENTER";
}

export function operationFinancialsVisible(role: UserRole | undefined): boolean {
  return !isCallCenterRole(role);
}