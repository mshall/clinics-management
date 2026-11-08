export type SupportProductModule =
  | "PATIENTS"
  | "ENCOUNTERS"
  | "APPOINTMENTS"
  | "OPERATIONS"
  | "EXPENSES"
  | "REVENUE"
  | "HR"
  | "REPORTS"
  | "ADMIN"
  | "AUTH"
  | "CLINICS"
  | "BILLING"
  | "OTHER";

export type SupportTicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_ON_USER" | "RESOLVED" | "CLOSED";

export type ResolutionHint = {
  summary: string;
  actions: string[];
  severity: "info" | "warning" | "critical";
};

export type SupportTicketEventDto = {
  id: string;
  eventType: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  actorDisplayName: string | null;
  createdAt: string;
};

export type SupportTicketDto = {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  module: SupportProductModule;
  priority: string;
  status: SupportTicketStatus;
  clinicId: string | null;
  patientId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  linkedAuditLogId: string | null;
  resolutionNotes: string | null;
  reporterUserId: string | null;
  assigneeUserId: string | null;
  reporterDisplayName: string | null;
  reporterEmail: string | null;
  assigneeDisplayName: string | null;
  assigneeEmail: string | null;
  clinicNameEn: string | null;
  patientMrn: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  events?: SupportTicketEventDto[];
};

export type SupportTrackingLogDto = {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  clinicId: string | null;
  createdAt: string;
  actorId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  metadata: Record<string, unknown> | null;
  suggestedModule: string;
  resolution: ResolutionHint;
};

export type AdminInsights360Dto = {
  period: { from: string; to: string };
  volumes: {
    auditEvents: number;
    openSupportTickets: number;
    patientsCreated: number;
    encountersCreated: number;
    appointmentsCreated: number;
    expensesCreated: number;
  };
  topActions: { action: string; count: number }[];
  topResources: { resource: string; count: number }[];
  activitySeries: { date: string; count: number }[];
};

export type StaffPerformanceDto = {
  period: { from: string; to: string };
  staff: {
    userId: string;
    email: string;
    displayName: string;
    role: string;
    active: boolean;
    metrics: {
      auditActions: number;
      encountersCreated: number;
      appointmentsHandled: number;
      operationsCreated: number;
      openSupportTickets: number;
      activityScore: number;
    };
  }[];
};
