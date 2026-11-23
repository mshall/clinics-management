import { shouldShowMarketSelector } from "@/lib/market-selector-policy";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLINICAL_SPECIALTY_KEYS } from "@/lib/clinical-specialties";
import { IMPORT_ENTITIES, type ImportEntity, type ImportJobDto } from "@/lib/imports-api";
import { fetchLegalCatalog, requiredLegalIdsForPlan, type LegalCatalogItem } from "@/lib/legal-api";
import {
  fetchRepCommission,
  fetchRepMe,
  fetchRepPortfolio,
  fetchRepRoi,
  repCommitImport,
  repConfirmOwner,
  repCreateTenant,
  repResendOtp,
  repUploadImport,
  type RepClinicDto,
} from "@/lib/rep-api";
import { fetchSignupMarkets, type SignupMarket } from "@/lib/signup-api";
import { useAuthStore } from "@/stores/auth-store";

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ConfirmOwnerCard({ clinic, onDone }: { clinic: RepClinicDto; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const [code, setCode] = useState("");
  const [catalog, setCatalog] = useState<LegalCatalogItem[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const required = useMemo(() => requiredLegalIdsForPlan(clinic.planKey === "PRO" ? "PRO" : "LITE"), [clinic.planKey]);
  useEffect(() => {
    void fetchLegalCatalog().then(setCatalog);
  }, []);
  const confirm = useMutation({
    mutationFn: () =>
      repConfirmOwner(
        clinic.tenantId,
        code.trim(),
        required.map((id) => ({ document: id, version: catalog.find((c) => c.document === id)?.version ?? "" })),
      ),
    onSuccess: onDone,
  });
  const resend = useMutation({ mutationFn: () => repResendOtp(clinic.tenantId) });
  const ready = code.trim().length >= 4 && required.every((id) => checked[id]) && catalog.length > 0;
  return (
    <div className="space-y-2 rounded-md border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.12)] p-3 " data-testid="rep-confirm">
      <p className="text-sm">{t("rep.confirmIntro")}</p>
      <ul className="space-y-1 text-sm">
        {required.map((id) => {
          const item = catalog.find((c) => c.document === id);
          const label = item ? (i18n.language.startsWith("ar") ? item.titleAr : item.titleEn) : id;
          return (
            <li key={id} className="flex items-start gap-2">
              <input
                type="checkbox"
                id={`rep-legal-${clinic.tenantId}-${id}`}
                className="mt-1"
                checked={!!checked[id]}
                onChange={(e) => setChecked((p) => ({ ...p, [id]: e.target.checked }))}
              />
              <label htmlFor={`rep-legal-${clinic.tenantId}-${id}`}>
                {t("rep.ownerAgrees", { doc: label })}{" "}
                <Link to={`/legal/${id}`} target="_blank" className="underline">
                  {t("signup.legalView")}
                </Link>
              </label>
            </li>
          );
        })}
      </ul>
      <Label htmlFor={`rep-otp-${clinic.tenantId}`}>{t("rep.otpLabel")}</Label>
      <Input
        id={`rep-otp-${clinic.tenantId}`}
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        data-testid="rep-otp"
      />
      {confirm.error ? <p className="text-sm text-destructive">{errorText(confirm.error)}</p> : null}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!ready || confirm.isPending} onClick={() => confirm.mutate()} data-testid="rep-confirm-submit">
          {t("rep.confirm")}
        </Button>
        <Button variant="outline" disabled={resend.isPending} onClick={() => resend.mutate()}>
          {resend.isSuccess ? t("rep.resent") : t("rep.resend")}
        </Button>
      </div>
    </div>
  );
}

function RepImportCard({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [entity, setEntity] = useState<ImportEntity>("PATIENTS");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJobDto | null>(null);
  const upload = useMutation({ mutationFn: () => repUploadImport(tenantId, entity, file!), onSuccess: setJob });
  const commit = useMutation({ mutationFn: () => repCommitImport(tenantId, job!.id), onSuccess: setJob });
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">{t("rep.importTitle")}</p>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={entity}
        onChange={(e) => setEntity(e.target.value as ImportEntity)}
        aria-label={t("rep.importEntity")}
      >
        {IMPORT_ENTITIES.map((e) => (
          <option key={e} value={e}>
            {t(`imports.entity.${e}`)}
          </option>
        ))}
      </select>
      <Input type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label={t("rep.importFile")} />
      <Button variant="outline" className="w-full" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
        {t("rep.importUpload")}
      </Button>
      {job ? (
        <p className="text-sm" data-testid="rep-import-status">
          {t("rep.importSummary", { ok: job.okRows, errors: job.errorRows, status: t(`imports.status.${job.status}`) })}
        </p>
      ) : null}
      {job?.status === "READY" && job.okRows > 0 ? (
        <Button className="w-full" disabled={commit.isPending} onClick={() => commit.mutate()}>
          {t("rep.importCommit", { count: job.okRows })}
        </Button>
      ) : null}
      {upload.error || commit.error ? <p className="text-sm text-destructive">{errorText(upload.error ?? commit.error)}</p> : null}
    </div>
  );
}

function NewClinicForm({ onCreated }: { onCreated: () => void }) {
  const { t, i18n } = useTranslation();
  const [markets, setMarkets] = useState<SignupMarket[]>([]);
  const [marketId, setMarketId] = useState("");
  const [form, setForm] = useState({ clinicName: "", city: "", ownerName: "", ownerEmail: "", phone: "", specialty: "GENERAL_MEDICINE" });
  const [planKey, setPlanKey] = useState<"LITE" | "PRO">("PRO");
  useEffect(() => {
    void fetchSignupMarkets().then((rows) => {
      setMarkets(rows);
      if (rows[0]) setMarketId(rows[0].id);
    });
  }, []);
  const create = useMutation({
    mutationFn: () =>
      repCreateTenant({
        marketId,
        phone: form.phone,
        specialty: form.specialty,
        planKey,
        clinic: { nameEn: form.clinicName, nameAr: i18n.language.startsWith("ar") ? form.clinicName : undefined, city: form.city },
        owner: { displayName: form.ownerName, email: form.ownerEmail },
      }),
    onSuccess: () => {
      setForm((f) => ({ ...f, clinicName: "", city: "", ownerName: "", ownerEmail: "", phone: "" }));
      onCreated();
    },
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const ready = marketId && form.clinicName && form.city && form.ownerName && form.ownerEmail.includes("@") && form.phone.length >= 8;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("rep.newClinic")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {shouldShowMarketSelector(markets) && (
          <>
            <Label htmlFor="rep-market">{t("signup.market")}</Label>
            <select
              id="rep-market"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nameEn}
                </option>
              ))}
            </select>
          </>
        )}
        <Label htmlFor="rep-clinic">{t("rep.clinicName")}</Label>
        <Input id="rep-clinic" value={form.clinicName} onChange={set("clinicName")} />
        <Label htmlFor="rep-city">{t("signup.city")}</Label>
        <Input id="rep-city" value={form.city} onChange={set("city")} />
        <Label htmlFor="rep-specialty">{t("signup.specialty")}</Label>
        <select
          id="rep-specialty"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={form.specialty}
          onChange={set("specialty")}
        >
          {CLINICAL_SPECIALTY_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(`clinicalSpecialties.${key}`)}
            </option>
          ))}
        </select>
        <Label htmlFor="rep-owner">{t("rep.ownerName")}</Label>
        <Input id="rep-owner" value={form.ownerName} onChange={set("ownerName")} />
        <Label htmlFor="rep-owner-email">{t("rep.ownerEmail")}</Label>
        <Input id="rep-owner-email" type="email" value={form.ownerEmail} onChange={set("ownerEmail")} />
        <Label htmlFor="rep-owner-phone">{t("rep.ownerPhone")}</Label>
        <Input id="rep-owner-phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} />
        <div className="flex gap-4 text-sm" role="radiogroup" aria-label={t("rep.plan")}>
          {(["PRO", "LITE"] as const).map((p) => (
            <label key={p} className="flex items-center gap-2">
              <input type="radio" name="rep-plan" checked={planKey === p} onChange={() => setPlanKey(p)} />
              {t(`rep.plans.${p}`)}
            </label>
          ))}
        </div>
        {create.error ? <p className="text-sm text-destructive">{errorText(create.error)}</p> : null}
        <Button className="w-full" disabled={!ready || create.isPending} onClick={() => create.mutate()} data-testid="rep-create">
          {t("rep.createAndSendOtp")}
        </Button>
      </CardContent>
    </Card>
  );
}

export function RepConsolePage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const me = useQuery({ queryKey: ["rep", "me"], queryFn: fetchRepMe, enabled: user?.role === "sales_rep" });
  const portfolio = useQuery({ queryKey: ["rep", "portfolio"], queryFn: fetchRepPortfolio, enabled: user?.role === "sales_rep" });
  const commission = useQuery({
    queryKey: ["rep", "commission", period],
    queryFn: () => fetchRepCommission(period),
    enabled: user?.role === "sales_rep",
  });
  const [roiInputs, setRoiInputs] = useState({
    noShowsPreventedPerMonth: 8,
    feePerVisit: 300,
    adminHoursSavedPerWeek: 4,
    adminHourlyCost: 50,
    kiorexPatientsPerMonth: 6,
    contributionPerKiorexPatient: 200,
    planMonthlyAmount: 999,
  });
  const roi = useMutation({ mutationFn: () => fetchRepRoi(roiInputs) });
  if (user && user.role !== "sales_rep") return <Navigate to="/" replace />;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["rep"] });
  const ar = i18n.language.startsWith("ar");
  const totals = portfolio.data?.totals;

  return (
    <div className="mx-auto min-h-screen max-w-md space-y-4 bg-background p-4" data-testid="rep-console">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{t("rep.title")}</h1>
          {portfolio.data ? (
            <p className="text-xs text-muted-foreground">
              {portfolio.data.rep.displayName} · {t("rep.code")}: <span data-testid="rep-code">{portfolio.data.rep.code}</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="ghost" size="sm" onClick={signOut}>
            {t("rep.signOut")}
          </Button>
        </div>
      </header>

      {me.data ? (
        <Card data-testid="rep-qr-card">
          <CardHeader>
            <CardTitle className="text-base">{t("rep.qrTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="break-all text-muted-foreground" data-testid="rep-signup-url">
              {me.data.signupUrl}
            </p>
            {me.data.qrDataUrl ? (
              <img src={me.data.qrDataUrl} alt={t("rep.qrAlt")} className="mx-auto size-40" data-testid="rep-qr" />
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void navigator.clipboard.writeText(me.data!.signupUrl)}
            >
              {t("rep.copySignupLink")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid="rep-roi-card">
        <CardHeader>
          <CardTitle className="text-base">{t("rep.roiTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(
            [
              ["noShowsPreventedPerMonth", "rep.roiNoShows"],
              ["feePerVisit", "rep.roiFee"],
              ["adminHoursSavedPerWeek", "rep.roiAdminHours"],
              ["adminHourlyCost", "rep.roiAdminCost"],
              ["kiorexPatientsPerMonth", "rep.roiKiorexPatients"],
              ["contributionPerKiorexPatient", "rep.roiKiorexContribution"],
              ["planMonthlyAmount", "rep.roiPlan"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid grid-cols-2 items-center gap-2">
              <Label htmlFor={`roi-${key}`}>{t(label)}</Label>
              <Input
                id={`roi-${key}`}
                type="number"
                value={roiInputs[key]}
                onChange={(e) => setRoiInputs((p) => ({ ...p, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
          <Button type="button" className="w-full" disabled={roi.isPending} onClick={() => roi.mutate()} data-testid="rep-roi-run">
            {t("rep.roiCalculate")}
          </Button>
          {roi.data ? (
            <p className="text-sm" data-testid="rep-roi-result">
              {t("rep.roiResult", {
                net: roi.data.netMonthlyBenefit.toLocaleString(i18n.language),
                gross: roi.data.grossMonthlyBenefit.toLocaleString(i18n.language),
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {totals ? (
        <div className="grid grid-cols-4 gap-2 text-center" data-testid="rep-totals">
          {(["signups", "pendingOwner", "activated", "paid"] as const).map((k) => (
            <div key={k} className="rounded-md border border-border p-2">
              <div className="text-lg font-semibold">{totals[k]}</div>
              <div className="text-[11px] text-muted-foreground">{t(`rep.totals.${k}`)}</div>
            </div>
          ))}
        </div>
      ) : null}

      <NewClinicForm onCreated={refresh} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rep.portfolio")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {portfolio.data?.clinics.length === 0 ? <p className="text-sm text-muted-foreground">{t("rep.empty")}</p> : null}
          {portfolio.data?.clinics.map((c) => (
            <div key={c.tenantId} className="space-y-2 border-b border-border pb-3 last:border-0" data-testid="rep-clinic">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{ar ? c.nameAr : c.name}</span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs" data-testid="rep-clinic-status">
                  {c.status === "PENDING_OWNER"
                    ? t("rep.status.pendingOwner")
                    : c.paid
                      ? t("rep.status.paid")
                      : c.activatedAt
                        ? t("rep.status.activated")
                        : t("rep.status.confirmed")}
                </span>
              </div>
              {c.status === "PENDING_OWNER" && c.createdByRep ? <ConfirmOwnerCard clinic={c} onDone={refresh} /> : null}
              {c.status === "ACTIVE" && c.createdByRep ? <RepImportCard tenantId={c.tenantId} /> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rep.commission")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t("rep.period")} />
          {commission.data?.lines.length === 0 ? <p className="text-sm text-muted-foreground">{t("rep.noCommission")}</p> : null}
          {commission.data?.lines.map((l) => (
            <p key={l.currency} className="text-sm" data-testid="rep-commission-line">
              {t("rep.commissionLine", {
                commission: l.commission.toLocaleString(i18n.language),
                currency: l.currency,
                percent: l.commissionPercent,
                eligible: l.eligibleCount,
                total: l.invoiceCount,
                days: l.retentionDays,
              })}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
