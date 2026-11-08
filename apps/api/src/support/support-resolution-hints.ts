export type ResolutionHint = {
  summary: string;
  actions: string[];
  severity: "info" | "warning" | "critical";
};

const DEFAULT_HINT: ResolutionHint = {
  summary: "Review the audit entry and linked resource in the product.",
  actions: [
    "Confirm the user role and clinic scope allow this action.",
    "Open the linked record and reproduce the steps in a lower environment.",
    "If data looks wrong, use Admin → Governance to find related changes.",
  ],
  severity: "info",
};

const HINTS: Record<string, ResolutionHint> = {
  LOGIN: {
    summary: "Authentication or credentials issue.",
    actions: [
      "Verify email and password (demo seed uses password `demo`).",
      "Check user is not deactivated or archived in Admin → Organization users.",
      "Confirm MFA demo field is filled when prompted.",
    ],
    severity: "warning",
  },
  UPLOAD_PATIENT_DOCUMENT: {
    summary: "Patient document upload failed or is slow.",
    actions: [
      "Try a smaller image or PDF under 15 MB.",
      "Confirm clinic and patient exist and user has patients tab access.",
      "Check network: production uploads route through API (not direct S3).",
    ],
    severity: "info",
  },
  UPLOAD_ENCOUNTER_DOCUMENT: {
    summary: "Encounter clinical document issue.",
    actions: [
      "Open encounter in DRAFT before uploading.",
      "Use supported types: PDF or images.",
      "For prescriptions, only one active prescription file is kept per encounter.",
    ],
    severity: "info",
  },
  DELETE_PATIENT: {
    summary: "Patient delete blocked or unexpected.",
    actions: [
      "Confirm role allows delete (receptionist, group admin, call center, etc.).",
      "Check for linked encounters or appointments that block removal.",
      "Prefer soft workflows: archive user instead of hard delete when unsure.",
    ],
    severity: "warning",
  },
  BULK_DELETE_PATIENTS: {
    summary: "Bulk patient delete partial failure.",
    actions: [
      "Review API response for per-id failures.",
      "Narrow selection and retry in smaller batches.",
      "Export audit trail for compliance before mass deletes.",
    ],
    severity: "critical",
  },
  CREATE_EXPENSE: {
    summary: "Expense recording issue.",
    actions: [
      "Verify clinic currency and amount fields.",
      "Attach proof if workflow requires it.",
      "Finance officer can approve pending expenses after create.",
    ],
    severity: "info",
  },
  UPDATE_TENANT: {
    summary: "Organization settings change.",
    actions: [
      "Base currency changes sync inherited clinic currencies — verify clinic overrides.",
      "Document visit fee changes for reporting comparisons.",
    ],
    severity: "warning",
  },
};

function prefixKey(prefix: string): ResolutionHint | undefined {
  return HINTS[prefix];
}

export function resolveHints(action: string, resource: string): ResolutionHint {
  const byAction = HINTS[action];
  if (byAction) return byAction;

  if (action.includes("DELETE")) {
    return {
      summary: `Delete action on ${resource}.`,
      actions: [
        "Confirm user has delete permission for this module.",
        "Check for dependent records blocking deletion.",
        "Create a support ticket if this is unexpected.",
      ],
      severity: "warning",
    };
  }
  if (action.includes("UPLOAD") || action.includes("DOCUMENT")) {
    return prefixKey("UPLOAD_PATIENT_DOCUMENT") ?? DEFAULT_HINT;
  }

  const resourceHints: Record<string, ResolutionHint> = {
    Appointment: {
      summary: "Scheduling or overlap rules may apply.",
      actions: [
        "Check clinic working hours and after-hours warnings.",
        "Use confirmOverlap when double-booking the same clinician.",
        "Physicians can only book as themselves.",
      ],
      severity: "info",
    },
    HR: {
      summary: "HR or employee lifecycle issue.",
      actions: [
        "Deactivating an employee also deactivates the linked login.",
        "Archive is limited to group/branch/clinic admin roles.",
        "Verify HR clinic privilege grant for clinic-scoped HR officers.",
      ],
      severity: "warning",
    },
  };
  return resourceHints[resource] ?? DEFAULT_HINT;
}

export function mapResourceToSupportModule(resource: string): string {
  const r = resource.toLowerCase();
  if (r.includes("patient")) return "PATIENTS";
  if (r.includes("encounter")) return "ENCOUNTERS";
  if (r.includes("appointment")) return "APPOINTMENTS";
  if (r.includes("operation")) return "OPERATIONS";
  if (r.includes("expense")) return "EXPENSES";
  if (r.includes("revenue")) return "REVENUE";
  if (r.includes("hr") || r.includes("employee")) return "HR";
  if (r.includes("report")) return "REPORTS";
  if (r.includes("clinic")) return "CLINICS";
  if (r.includes("auth")) return "AUTH";
  if (r.includes("admin") || r.includes("tenant") || r.includes("platform")) return "ADMIN";
  return "OTHER";
}
