import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "@/lib/http";

type Board = {
  clinicName: string;
  lastCalledTicket: number | null;
  waiting: { ticketNumber: number | null }[];
};

export function WaitingRoomPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const clinicId = params.get("clinicId") ?? "";
  const q = useQuery({
    queryKey: ["front-desk", "board", clinicId],
    queryFn: () => apiGet<Board>(`/api/v1/front-desk/board?clinicId=${encodeURIComponent(clinicId)}`),
    enabled: Boolean(clinicId),
    refetchInterval: 5_000,
  });

  const ticket = q.data?.lastCalledTicket;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-center">
      <p className="text-sm uppercase tracking-wide text-muted-foreground">{q.data?.clinicName ?? t("frontDesk.waitingScreen", "Waiting room")}</p>
      <p className="mt-4 text-lg text-muted-foreground">{t("frontDesk.nowServing", "Now serving")}</p>
      <p className="mt-2 font-mono text-7xl font-bold ltr-nums text-primary sm:text-8xl">{ticket != null ? `#${ticket}` : "—"}</p>
      <p className="mt-8 text-sm text-muted-foreground">
        {t("frontDesk.inQueue", "In queue")}: {q.data?.waiting.length ?? 0}
      </p>
    </div>
  );
}
