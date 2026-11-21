import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiPut } from "@/lib/http";
import type { KiorexSettingsDto } from "./kiorex-types";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

type DoctorDraft = { listed: boolean; dailyCap: string };
type TypeDraft = { marketplaceBookable: boolean; minNoticeHours: string; maxDaysAhead: string; deposit: string };

function draftsFrom(settings: KiorexSettingsDto) {
  return {
    autoConfirm: settings.autoConfirm,
    doctors: Object.fromEntries(
      settings.doctors.map((d) => [
        d.listingId,
        { listed: d.pausedReason !== "owner", dailyCap: d.dailyCap == null ? "" : String(d.dailyCap) } satisfies DoctorDraft,
      ]),
    ),
    types: Object.fromEntries(
      settings.appointmentTypes.map((a) => [
        a.id,
        {
          marketplaceBookable: a.marketplaceBookable,
          minNoticeHours: String(Math.round((a.minNoticeMinutes / 60) * 100) / 100),
          maxDaysAhead: String(a.maxDaysAhead),
          deposit: a.depositAmount == null ? "" : String(a.depositAmount),
        } satisfies TypeDraft,
      ]),
    ),
  };
}

export function KiorexBookingSettingsCard({ clinicId, settings }: { clinicId: string; settings: KiorexSettingsDto }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const isAr = i18n.language.startsWith("ar");
  const [draft, setDraft] = useState(() => draftsFrom(settings));

  useSyncOnChange([settings], () => {
    setDraft(draftsFrom(settings));
  }, { skipMount: true });

  const save = useMutation({
    mutationFn: () =>
      apiPut<KiorexSettingsDto>("/api/v1/kiorex/settings", {
        clinicId,
        autoConfirm: draft.autoConfirm,
        doctors: settings.doctors.map((d) => {
          const dd = draft.doctors[d.listingId]!;
          return {
            listingId: d.listingId,
            listed: dd.listed,
            ...(d.dailyCap != null && dd.dailyCap.trim() !== "" ? { dailyCap: Number(dd.dailyCap) } : {}),
          };
        }),
        appointmentTypes: settings.appointmentTypes.map((a) => {
          const td = draft.types[a.id]!;
          return {
            id: a.id,
            marketplaceBookable: td.marketplaceBookable,
            minNoticeMinutes: Math.round(Number(td.minNoticeHours || 0) * 60),
            maxDaysAhead: Number(td.maxDaysAhead),
            depositAmount: td.deposit.trim() === "" ? null : Number(td.deposit),
          };
        }),
      }),
    onSuccess: (next) => {
      qc.setQueryData(["kiorex", "settings", clinicId], next);
      void qc.invalidateQueries({ queryKey: ["kiorex", "booking-link", clinicId] });
      toast.success(t("kiorexTab.booking.saved", "Kiorex booking settings saved"));
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const setDoctor = (id: string, patch: Partial<DoctorDraft>) =>
    setDraft((d) => ({ ...d, doctors: { ...d.doctors, [id]: { ...d.doctors[id]!, ...patch } } }));
  const setType = (id: string, patch: Partial<TypeDraft>) =>
    setDraft((d) => ({ ...d, types: { ...d.types, [id]: { ...d.types[id]!, ...patch } } }));

  const statusLabel = (status: string) => t(`kiorexTab.booking.status.${status}`, status);

  return (
    <Card data-testid="kiorex-booking-settings-card">
      <CardHeader>
        <CardTitle className="text-base">{t("kiorexTab.booking.title", "Booking on Kiorex")}</CardTitle>
        <CardDescription>
          {t("kiorexTab.booking.hint", "Choose which doctors and visit types patients can book, and how bookings are confirmed.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={draft.autoConfirm}
            onChange={(e) => setDraft((d) => ({ ...d, autoConfirm: e.target.checked }))}
            data-testid="kiorex-auto-confirm"
          />
          {t("kiorexTab.booking.autoConfirm", "Confirm Kiorex bookings automatically")}
        </label>
        {!draft.autoConfirm ? (
          <p className="-mt-4 text-xs text-muted-foreground">
            {t("kiorexTab.booking.manualHint", "New bookings wait for the front desk to confirm; unconfirmed ones are released automatically.")}
          </p>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-sm font-medium">{t("kiorexTab.booking.doctors", "Doctors")}</h3>
          {settings.doctors.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("kiorexTab.booking.noDoctors", "No doctors at this branch yet.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-start text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 text-start font-normal">{t("kiorexTab.booking.doctor", "Doctor")}</th>
                    <th className="py-1 text-start font-normal">{t("kiorexTab.booking.listed", "Listed")}</th>
                    <th className="py-1 text-start font-normal">{t("kiorexTab.booking.statusCol", "Status")}</th>
                    <th className="py-1 text-start font-normal">{t("kiorexTab.booking.verification", "Verification")}</th>
                    <th className="py-1 text-start font-normal">{t("kiorexTab.booking.dailyCap", "Daily cap")}</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody>
                  {settings.doctors.map((d) => {
                    const dd = draft.doctors[d.listingId]!;
                    return (
                      <tr key={d.listingId} className="border-t" data-testid="kiorex-doctor-row">
                        <td className="py-2 pe-2">
                          <div className="font-medium">{d.clinicianName}</div>
                          <div className="text-xs text-muted-foreground ltr-nums">
                            {t("kiorexTab.booking.profilePercent", { defaultValue: "Profile {{percent}}%", percent: d.completenessPercent })}
                          </div>
                        </td>
                        <td className="py-2 pe-2">
                          <input
                            type="checkbox"
                            className="size-4"
                            aria-label={t("kiorexTab.booking.listed", "Listed")}
                            checked={dd.listed}
                            onChange={(e) => setDoctor(d.listingId, { listed: e.target.checked })}
                          />
                        </td>
                        <td className="py-2 pe-2">
                          <Badge variant={d.status === "LIVE" ? "default" : "secondary"}>{statusLabel(d.status)}</Badge>
                        </td>
                        <td className="py-2 pe-2 text-xs">
                          {d.verificationStatus
                            ? t(`kiorexTab.booking.verificationStatus.${d.verificationStatus}`, d.verificationStatus)
                            : t("kiorexTab.booking.verificationStatus.NONE", "Not submitted")}
                        </td>
                        <td className="py-2 pe-2">
                          {d.dailyCap == null ? (
                            <span className="text-xs text-muted-foreground">
                              {t("kiorexTab.booking.noAvailability", "Set availability first")}
                            </span>
                          ) : (
                            <Input
                              type="number"
                              min={0}
                              max={200}
                              aria-label={t("kiorexTab.booking.dailyCap", "Daily cap")}
                              className="h-8 w-20"
                              value={dd.dailyCap}
                              onChange={(e) => setDoctor(d.listingId, { dailyCap: e.target.value })}
                            />
                          )}
                        </td>
                        <td className="py-2 text-end">
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/clinics/${clinicId}/kiorex-listings/${d.listingId}/profile`}>
                              {t("kiorexTab.booking.editProfile", "Edit profile")}
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">{t("kiorexTab.booking.types", "Visit types")}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-start font-normal">{t("kiorexTab.booking.type", "Visit type")}</th>
                  <th className="py-1 text-start font-normal">{t("kiorexTab.booking.bookable", "On Kiorex")}</th>
                  <th className="py-1 text-start font-normal">{t("kiorexTab.booking.minNotice", "Min notice (hours)")}</th>
                  <th className="py-1 text-start font-normal">{t("kiorexTab.booking.horizon", "Book up to (days)")}</th>
                  <th className="py-1 text-start font-normal">{t("kiorexTab.booking.deposit", "Deposit")}</th>
                </tr>
              </thead>
              <tbody>
                {settings.appointmentTypes.map((a) => {
                  const td = draft.types[a.id]!;
                  return (
                    <tr key={a.id} className="border-t" data-testid="kiorex-type-row">
                      <td className="py-2 pe-2">
                        <div className="font-medium">{isAr ? a.nameAr || a.nameEn : a.nameEn}</div>
                        {a.sharedAcrossBranches ? (
                          <div className="text-xs text-muted-foreground">{t("kiorexTab.booking.shared", "All branches")}</div>
                        ) : null}
                      </td>
                      <td className="py-2 pe-2">
                        <input
                          type="checkbox"
                          className="size-4"
                          aria-label={t("kiorexTab.booking.bookable", "On Kiorex")}
                          checked={td.marketplaceBookable}
                          onChange={(e) => setType(a.id, { marketplaceBookable: e.target.checked })}
                        />
                      </td>
                      <td className="py-2 pe-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          aria-label={t("kiorexTab.booking.minNotice", "Min notice (hours)")}
                          className="h-8 w-20"
                          value={td.minNoticeHours}
                          onChange={(e) => setType(a.id, { minNoticeHours: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pe-2">
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          aria-label={t("kiorexTab.booking.maxDaysAhead", "Max days ahead")}
                          className="h-8 w-20"
                          value={td.maxDaysAhead}
                          onChange={(e) => setType(a.id, { maxDaysAhead: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pe-2">
                        <Input
                          type="number"
                          min={0}
                          max={a.feeAmount}
                          aria-label={t("kiorexTab.booking.deposit", "Deposit")}
                          className="h-8 w-24"
                          placeholder={t("kiorexTab.booking.noDeposit", "None")}
                          value={td.deposit}
                          onChange={(e) => setType(a.id, { deposit: e.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending} data-testid="kiorex-booking-save">
          {t("common.save", "Save")}
        </Button>
      </CardContent>
    </Card>
  );
}
