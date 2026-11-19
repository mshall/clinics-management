import { RecordShareScope } from "@prisma/client";

export const RECORD_SHARE_SCOPES = [
  RecordShareScope.VISIT_SUMMARY,
  RecordShareScope.PRESCRIPTIONS,
  RecordShareScope.LAB_RESULTS,
  RecordShareScope.SHARE_WITH_OTHER_CLINICS,
] as const;

export type RecordShareScopeId = (typeof RECORD_SHARE_SCOPES)[number];

export function isRecordShareScope(value: string): value is RecordShareScope {
  return (RECORD_SHARE_SCOPES as readonly string[]).includes(value);
}

/** True when an active (non-revoked) grant exists for the scope. */
export function isActiveShareGrant(row: { granted: boolean; revokedAt: Date | null } | null | undefined): boolean {
  return Boolean(row && row.granted && !row.revokedAt);
}
