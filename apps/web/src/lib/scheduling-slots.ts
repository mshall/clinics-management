import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";

export type SchedulingSlotDto = {
  startsAt: string;
  endsAt: string;
  roomLabel: string | null;
};

export type SchedulingSlotsResponse = {
  clinicId: string;
  clinicianId: string;
  typeId: string;
  from: string;
  to: string;
  channel: string;
  slots: SchedulingSlotDto[];
};

export function useSchedulingSlotsQuery(opts: {
  clinicId?: string;
  clinicianId?: string;
  typeId?: string;
  from?: string;
  to?: string;
  enabled?: boolean;
}) {
  const enabled =
    (opts.enabled ?? true) &&
    Boolean(opts.clinicId?.trim() && opts.clinicianId?.trim() && opts.typeId?.trim() && opts.from && opts.to);
  return useQuery({
    queryKey: ["scheduling", "slots", opts],
    queryFn: () => {
      const q = new URLSearchParams({
        clinicId: opts.clinicId!,
        clinicianId: opts.clinicianId!,
        typeId: opts.typeId!,
        from: opts.from!,
        to: opts.to!,
        channel: "INTERNAL",
      });
      return apiGet<SchedulingSlotsResponse>(`/api/v1/scheduling/slots?${q.toString()}`);
    },
    enabled,
    staleTime: 60_000,
  });
}