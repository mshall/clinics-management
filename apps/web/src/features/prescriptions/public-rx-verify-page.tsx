import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl } from "@/lib/api-url";
import { localeForLanguage } from "@/lib/locale-display";
import { printedItemLabel, type PrintedRxItem } from "./signed-prescription-actions";

type RxVerification =
  | {
      status: "VALID";
      clinicNameEn: string;
      clinicNameAr: string | null;
      doctorName: string;
      patientInitials: string;
      signedAt: string;
      items: PrintedRxItem[];
      expiresAt: string;
    }
  | { status: "EXPIRED" | "REVOKED" };

async function fetchVerification(token: string): Promise<RxVerification | null> {
  const res = await fetch(apiUrl(`/api/v1/public/rx/verify/${encodeURIComponent(token)}`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return (await res.json()) as RxVerification;
}

/** CL-03: pharmacy-facing check of a signed prescription (no login). */
export function PublicRxVerifyPage() {
  const { token } = useParams();
  const { t, i18n } = useTranslation();
  const lang = localeForLanguage(i18n.language);
  const rtl = i18n.language === "ar";
  const { data, isPending, isError } = useQuery({
    queryKey: ["public-rx-verify", token],
    enabled: Boolean(token),
    queryFn: () => fetchVerification(token!),
    retry: false,
  });

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto max-w-xl p-4 sm:p-8" dir={rtl ? "rtl" : "ltr"}>
      {children}
    </div>
  );

  if (isPending && token) return shell(<p className="text-sm text-muted-foreground">{t("common.loading")}</p>);
  if (!token || isError || !data || data.status !== "VALID") {
    const msg =
      data?.status === "EXPIRED"
        ? t("rxVerify.expired")
        : data?.status === "REVOKED"
          ? t("rxVerify.revoked")
          : t("rxVerify.notFound");
    return shell(
      <Card data-testid="rx-verify-invalid">
        <CardContent className="flex items-start gap-3 p-6">
          <ShieldAlert className="h-6 w-6 shrink-0 text-destructive" aria-hidden />
          <p className="text-sm">{msg}</p>
        </CardContent>
      </Card>,
    );
  }

  const clinicName = rtl ? data.clinicNameAr || data.clinicNameEn : data.clinicNameEn;
  return shell(
    <Card data-testid="rx-verify-valid">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BadgeCheck className="h-6 w-6 text-emerald-600" aria-hidden />
          {t("rxVerify.valid")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">{t("rxVerify.clinic")}</dt>
          <dd className="font-medium">{clinicName}</dd>
          <dt className="text-muted-foreground">{t("rxVerify.doctor")}</dt>
          <dd className="font-medium">{data.doctorName}</dd>
          <dt className="text-muted-foreground">{t("rxVerify.patient")}</dt>
          <dd className="font-medium">{data.patientInitials}</dd>
          <dt className="text-muted-foreground">{t("rxVerify.date")}</dt>
          <dd className="font-medium">{new Date(data.signedAt).toLocaleDateString(lang)}</dd>
        </dl>
        <div>
          <p className="mb-2 font-medium">{t("rxVerify.items")}</p>
          <ol className="space-y-2">
            {data.items.map((item, idx) => (
              <li key={idx} className="rounded-md border border-border p-2">
                <p className="font-medium" dir="ltr">
                  {printedItemLabel(item)}
                </p>
                <p className="text-muted-foreground" dir="ltr">
                  {[item.dosage, item.frequency, item.duration].filter(Boolean).join(" · ")}
                </p>
                {item.instructionsAr ? <p dir="rtl">{item.instructionsAr}</p> : null}
                {item.instructions ? <p className="text-muted-foreground">{item.instructions}</p> : null}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("rxVerify.expiresAt", { date: new Date(data.expiresAt).toLocaleDateString(lang) })}
        </p>
      </CardContent>
    </Card>,
  );
}
