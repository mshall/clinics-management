import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Headphones, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/features/platform/platform-shared";
import { apiPatch, apiPost } from "@/lib/http";
import {
  useSupportTicketQuery,
  useSupportTicketsQuery,
  useSupportTrackingLogsQuery,
} from "@/lib/support-hooks";
import type { SupportProductModule, SupportTicketDto, SupportTrackingLogDto } from "@/lib/support-types";

const MODULES: SupportProductModule[] = [
  "PATIENTS",
  "ENCOUNTERS",
  "APPOINTMENTS",
  "OPERATIONS",
  "EXPENSES",
  "REVENUE",
  "HR",
  "REPORTS",
  "ADMIN",
  "AUTH",
  "CLINICS",
  "BILLING",
  "OTHER",
];

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"] as const;

const TICKET_PAGE_SIZE = 15;
const TRACK_PAGE_SIZE = 20;

export function CustomerSupportPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"tickets" | "tracking">("tickets");
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketQ, setTicketQ] = useState("");
  const [ticketQApplied, setTicketQApplied] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newModule, setNewModule] = useState<SupportProductModule>("OTHER");

  const [trackPage, setTrackPage] = useState(1);
  const [trackQ, setTrackQ] = useState("");
  const [trackQApplied, setTrackQApplied] = useState("");
  const [trackDetail, setTrackDetail] = useState<SupportTrackingLogDto | null>(null);

  const tickets = useSupportTicketsQuery({
    page: ticketPage,
    pageSize: TICKET_PAGE_SIZE,
    q: ticketQApplied,
    status: statusFilter,
  });
  const ticketDetail = useSupportTicketQuery(selectedTicketId);
  const tracking = useSupportTrackingLogsQuery({ page: trackPage, pageSize: TRACK_PAGE_SIZE, q: trackQApplied });

  const createMutation = useMutation({
    mutationFn: (body: { title: string; description: string; module: SupportProductModule }) =>
      apiPost<SupportTicketDto>("/api/v1/support/tickets", body),
    onSuccess: (data) => {
      toast.success(t("support.ticketCreated", "Ticket created"));
      setCreateOpen(false);
      setNewTitle("");
      setNewDescription("");
      setSelectedTicketId(data.id);
      void qc.invalidateQueries({ queryKey: ["support", "tickets"] });
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const patchTicketMutation = useMutation({
    mutationFn: (payload: { id: string; status: (typeof STATUSES)[number] }) =>
      apiPatch<SupportTicketDto>(`/api/v1/support/tickets/${payload.id}`, { status: payload.status }),
    onSuccess: () => {
      toast.success(t("support.statusUpdated", "Status updated"));
      void qc.invalidateQueries({ queryKey: ["support"] });
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const ticketFromAuditMutation = useMutation({
    mutationFn: (auditLogId: string) =>
      apiPost<SupportTicketDto>(`/api/v1/support/tracking/logs/${auditLogId}/ticket`, {}),
    onSuccess: (data) => {
      toast.success(t("support.ticketFromAudit", "Ticket opened from log"));
      setTab("tickets");
      setSelectedTicketId(data.id);
      void qc.invalidateQueries({ queryKey: ["support"] });
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const statusBadge = (status: string) => {
    const variant = status === "OPEN" || status === "IN_PROGRESS" ? "default" : "secondary";
    return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>;
  };

  const ticketRows = tickets.data?.items ?? [];
  const trackRows = tracking.data?.items ?? [];

  const detailEvents = useMemo(() => ticketDetail.data?.events ?? [], [ticketDetail.data?.events]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Headphones className="h-6 w-6 text-primary" />
            {t("support.title", "Customer support")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "support.subtitle",
              "Track issues across all modules, link audit logs, and resolve without engineering.",
            )}
          </p>
        </div>
        <Button type="button" className="gap-1" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("support.newTicket", "New ticket")}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "tickets" | "tracking")}>
        <TabsList>
          <TabsTrigger value="tickets">{t("support.tabTickets", "Tickets")}</TabsTrigger>
          <TabsTrigger value="tracking">{t("support.tabTracking", "Log tracking")}</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("support.ticketQueue", "Issue queue")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Input
                  className="max-w-xs"
                  placeholder={t("support.searchTickets", "Search tickets…")}
                  value={ticketQ}
                  onChange={(e) => setTicketQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (setTicketPage(1), setTicketQApplied(ticketQ.trim()))}
                />
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setTicketPage(1);
                  }}
                >
                  <option value="">{t("support.allStatuses", "All statuses")}</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => (setTicketPage(1), setTicketQApplied(ticketQ.trim()))}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              <ResponsiveTable>
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t("support.colTicket", "Ticket")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("support.colTitle", "Title")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("support.colModule", "Module")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("support.colStatus", "Status")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("support.colPriority", "Priority")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketRows.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-t border-border hover:bg-muted/50"
                        onClick={() => setSelectedTicketId(row.id)}
                      >
                        <td className="px-3 py-2 font-mono text-xs">{row.ticketNo}</td>
                        <td className="px-3 py-2 font-medium">{row.title}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.module}</td>
                        <td className="px-3 py-2">{statusBadge(row.status)}</td>
                        <td className="px-3 py-2">{row.priority}</td>
                      </tr>
                    ))}
                    {!tickets.isPending && !ticketRows.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          {t("support.noTickets", "No tickets yet")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </ResponsiveTable>
              {(tickets.data?.total ?? 0) > 0 ? (
                <TablePagination
                  page={ticketPage}
                  pageSize={TICKET_PAGE_SIZE}
                  total={tickets.data?.total ?? 0}
                  totalPages={tickets.data?.totalPages ?? 1}
                  disabled={tickets.isPending}
                  onPageChange={setTicketPage}
                  onPageSizeChange={() => {}}
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("support.trackingTitle", "Detailed log tracking")}</CardTitle>
              <CardDescription>
                {t(
                  "support.trackingHint",
                  "Full audit trail with suggested resolution steps. Open a ticket directly from any log row.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  className="max-w-md flex-1"
                  placeholder={t("support.searchLogs", "Action, resource, user…")}
                  value={trackQ}
                  onChange={(e) => setTrackQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (setTrackPage(1), setTrackQApplied(trackQ.trim()))}
                />
                <Button type="button" onClick={() => (setTrackPage(1), setTrackQApplied(trackQ.trim()))}>
                  {t("patients.applyFilters", "Apply")}
                </Button>
              </div>
              <ResponsiveTable>
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t("support.colWhen", "When")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("support.colActor", "User")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("support.colAction", "Action")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("support.colResource", "Resource")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("support.colHints", "Severity")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackRows.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-t border-border hover:bg-muted/50"
                        onClick={() => setTrackDetail(row)}
                      >
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">{row.actorDisplayName ?? row.actorEmail ?? "—"}</td>
                        <td className="px-3 py-2 font-medium">{row.action}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.resource}</td>
                        <td className="px-3 py-2 capitalize">{row.resolution.severity}</td>
                      </tr>
                    ))}
                    {!tracking.isPending && !trackRows.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          {t("support.noLogs", "No matching logs")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </ResponsiveTable>
              {(tracking.data?.total ?? 0) > 0 ? (
                <TablePagination
                  page={trackPage}
                  pageSize={TRACK_PAGE_SIZE}
                  total={tracking.data?.total ?? 0}
                  totalPages={tracking.data?.totalPages ?? 1}
                  disabled={tracking.isPending}
                  onPageChange={setTrackPage}
                  onPageSizeChange={() => {}}
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("support.newTicket", "New ticket")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("support.colTitle", "Title")}</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("support.colModule", "Module")}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={newModule}
                onChange={(e) => setNewModule(e.target.value as SupportProductModule)}
              >
                {MODULES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("support.description", "Description")}</Label>
              <Textarea rows={4} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            </div>
            <Button
              type="button"
              disabled={!newTitle.trim() || !newDescription.trim() || createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  title: newTitle.trim(),
                  description: newDescription.trim(),
                  module: newModule,
                })
              }
            >
              {t("support.createTicket", "Create ticket")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedTicketId)} onOpenChange={(o) => !o && setSelectedTicketId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-lg">
          {ticketDetail.data ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {ticketDetail.data.ticketNo} — {ticketDetail.data.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge(ticketDetail.data.status)}
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={ticketDetail.data.status}
                    disabled={patchTicketMutation.isPending}
                    onChange={(e) =>
                      patchTicketMutation.mutate({
                        id: ticketDetail.data!.id,
                        status: e.target.value as (typeof STATUSES)[number],
                      })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap">{ticketDetail.data.description}</p>
                <h3 className="font-medium pt-2">{t("support.timeline", "Timeline")}</h3>
                <ul className="space-y-2">
                  {detailEvents.map((ev) => (
                    <li key={ev.id} className="rounded border border-border px-2 py-1.5 text-xs">
                      <span className="font-medium">{ev.eventType}</span>
                      {ev.message ? ` — ${ev.message}` : null}
                      <div className="text-muted-foreground">{new Date(ev.createdAt).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(trackDetail)} onOpenChange={(o) => !o && setTrackDetail(null)}>
        <DialogContent className="max-w-lg">
          {trackDetail ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {trackDetail.action} · {trackDetail.resource}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">{new Date(trackDetail.createdAt).toLocaleString()}</p>
                <p>
                  <strong>{t("support.resolutionSummary", "Summary")}:</strong> {trackDetail.resolution.summary}
                </p>
                <ul className="list-disc ps-5 space-y-1">
                  {trackDetail.resolution.actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                <Button
                  type="button"
                  disabled={ticketFromAuditMutation.isPending}
                  onClick={() => ticketFromAuditMutation.mutate(trackDetail.id)}
                >
                  {t("support.openTicketFromLog", "Open support ticket")}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
