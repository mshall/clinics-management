import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl } from "@/lib/api-url";
import type { PublicBookingPageDto } from "./kiorex-types";

async function fetchPage(slug: string): Promise<PublicBookingPageDto> {
  const res = await fetch(apiUrl(`/api/v1/public/booking-pages/${encodeURIComponent(slug)}`));
  const body = (await res.json().catch(() => ({}))) as PublicBookingPageDto & { message?: string };
  if (!res.ok) throw new Error(body.message ?? `Failed (${res.status})`);
  return body;
}

/** Brand colour comes from invoice settings; light named colours (e.g. "white") fall back to the theme primary. */
function headerStyle(brandColor: string | undefined) {
  const c = (brandColor ?? "").trim().toLowerCase();
  if (!c || c === "white" || c === "#fff" || c === "#ffffff") return undefined;
  return { borderTopColor: c, borderTopWidth: 6 } as const;
}

export function PublicBookingPage() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const q = useQuery({
    queryKey: ["public-booking-page", slug],
    enabled: Boolean(slug),
    queryFn: () => fetchPage(slug!),
    retry: false,
  });

  if (q.isPending) {
    return <p className="p-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center" data-testid="public-booking-not-found">
        <p className="text-lg font-medium">{t("bookingPage.notFound", "This booking page does not exist.")}</p>
      </div>
    );
  }
  const { clinic, doctors, appointmentTypes } = q.data;
  const clinicName = isAr ? clinic.nameAr || clinic.nameEn : clinic.nameEn;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8" data-testid="public-booking-page">
      <Card style={headerStyle(clinic.brandColor)}>
        <CardHeader className="flex flex-row items-center gap-4">
          {clinic.logoUrl ? (
            <img src={clinic.logoUrl} alt="" className="size-16 rounded-md border object-contain" />
          ) : null}
          <div className="min-w-0">
            <CardTitle className="text-xl">{clinicName}</CardTitle>
            <p className="text-sm text-muted-foreground">{isAr ? clinic.addressAr : clinic.addressEn}</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <a className="inline-flex items-center gap-1 underline-offset-4 hover:underline" href={`tel:${clinic.phone}`}>
            <Phone className="size-4" />
            <span dir="ltr">{clinic.phone}</span>
          </a>
          {clinic.locationUrl ? (
            <a
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              href={clinic.locationUrl}
              target="_blank"
              rel="noreferrer"
            >
              <MapPin className="size-4" />
              {t("bookingPage.directions", "Directions")}
            </a>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("bookingPage.doctors", "Book with")}</h2>
        {doctors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("bookingPage.noDoctors", "Online booking is not open yet. Please call the clinic.")}
          </p>
        ) : (
          <ul className="space-y-3">
            {doctors.map((d) => (
              <li key={d.clinicianId}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-medium">{isAr ? d.nameAr : d.nameEn}</p>
                      {(isAr ? d.titleAr : d.titleEn) ? (
                        <p className="text-sm text-muted-foreground">{isAr ? d.titleAr : d.titleEn}</p>
                      ) : null}
                    </div>
                    {d.widgetUrl ? (
                      <Button asChild data-testid="public-booking-book">
                        <a href={d.widgetUrl}>{t("bookingPage.book", "Book a visit")}</a>
                      </Button>
                    ) : (
                      <Button asChild variant="outline">
                        <a href={`tel:${clinic.phone}`}>{t("bookingPage.call", "Call to book")}</a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {appointmentTypes.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t("bookingPage.services", "Visit types")}</h2>
          <ul className="divide-y rounded-md border text-sm">
            {appointmentTypes.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-3 py-2">
                <span>{isAr ? a.nameAr || a.nameEn : a.nameEn}</span>
                <span className="text-muted-foreground ltr-nums">
                  {t("bookingPage.minutes", { defaultValue: "{{count}} min", count: a.durationMinutes })}
                  {a.feeAmount ? ` · ${a.feeAmount} ${clinic.currency}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">{t("bookingPage.poweredBy", "Free to book · Powered by Kiorex")}</p>
    </div>
  );
}
