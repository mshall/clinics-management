import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BrandLockup } from "@/components/brand-lockup";
import { PatientPrivacyNoticeLink } from "@/components/patient-privacy-notice-link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeSignup, fetchSignupMarkets, requestSignupOtp, verifySignupOtp, type SignupMarket } from "@/lib/signup-api";
import {
  fetchLegalCatalog,
  requiredLegalIdsForPlan,
  type LegalCatalogItem,
} from "@/lib/legal-api";
import { useAuthStore } from "@/stores/auth-store";
import { CLINICAL_SPECIALTY_KEYS } from "@/lib/clinical-specialties";

const STEPS = 5;

export function SignupPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const ref = params.get("ref") ?? undefined;
  const rep = params.get("rep") ?? params.get("salesRepCode") ?? undefined;

  const [step, setStep] = useState(0);
  const [markets, setMarkets] = useState<SignupMarket[]>([]);
  const [market, setMarket] = useState("EG");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [signupToken, setSignupToken] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [specialty, setSpecialty] = useState("GENERAL_MEDICINE");
  const [clinicName, setClinicName] = useState("");
  const [city, setCity] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [planKey, setPlanKey] = useState<"LITE" | "PRO">("LITE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [legalCatalog, setLegalCatalog] = useState<LegalCatalogItem[]>([]);
  const [legalChecked, setLegalChecked] = useState<Record<string, boolean>>({});

  const requiredLegalIds = useMemo(() => requiredLegalIdsForPlan(planKey), [planKey]);
  const legalReady = requiredLegalIds.every((id) => legalChecked[id]);

  useEffect(() => {
    void fetchLegalCatalog()
      .then(setLegalCatalog)
      .catch(() => setError(t("legal.errors.load")));
  }, [t]);

  useEffect(() => {
    setLegalChecked((prev) => {
      const next: Record<string, boolean> = {};
      for (const id of requiredLegalIds) {
        next[id] = prev[id] ?? false;
      }
      return next;
    });
  }, [requiredLegalIds]);

  useEffect(() => {
    void fetchSignupMarkets()
      .then((rows) => {
        setMarkets(rows);
        if (rows[0]?.code) setMarket(rows[0].code);
      })
      .catch(() => setError(t("signup.errors.markets")));
  }, [t]);

  const progress = useMemo(() => `${step + 1} / ${STEPS}`, [step]);

  async function onSendOtp() {
    setError(null);
    setBusy(true);
    try {
      await requestSignupOtp(phone, market);
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("signup.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyOtp() {
    setError(null);
    setBusy(true);
    try {
      const res = await verifySignupOtp(phone, otp, market);
      setSignupToken(res.signupToken);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("signup.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function onFinish() {
    if (!signupToken) return;
    setError(null);
    setBusy(true);
    try {
      const nameAr = i18n.language.startsWith("ar") ? clinicName : undefined;
      const byId = new Map(legalCatalog.map((item) => [item.document, item]));
      const legalAcceptances = requiredLegalIds.map((id) => {
        const item = byId.get(id);
        if (!item) throw new Error(t("legal.errors.load"));
        return { document: id, version: item.version };
      });
      const session = await completeSignup({
        signupToken,
        profile: { displayName, email, password },
        specialty,
        clinic: {
          nameEn: clinicName,
          nameAr: nameAr,
          city,
          locationUrl: locationUrl || undefined,
        },
        planKey,
        ref,
        rep,
        legalAcceptances,
      });
      setSession(session.accessToken, session.user, session.refreshToken);
      navigate("/onboarding", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("signup.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-muted/40 px-4 py-8 sm:py-12">
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <div className="flex items-center justify-between">
          <Link to="/login" className="text-sm text-muted-foreground underline">
            {t("signup.backToLogin")}
          </Link>
          <div className="flex gap-2">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
        <div className="flex justify-center" aria-hidden="false"><BrandLockup height={40} /></div>
        <Card className="shadow-kx-2">
          <CardHeader className="space-y-3">
            <CardTitle className="text-xl">{t("signup.title")}</CardTitle>
            <div className="space-y-1.5">
              <div role="progressbar" aria-label={t("signup.title")} aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1} className="flex gap-1.5">
                {Array.from({ length: STEPS }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />)}
              </div>
              <p className="text-sm text-muted-foreground">{t("signup.progress", { progress })}</p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-y-1.5 [&>button]:mt-3 [&>label:not(:first-child)]:mt-3">
            {step === 0 && (
              <>
                <Label htmlFor="market">{t("signup.market")}</Label>
                <select
                  id="market"
                  className="native-select"
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                >
                  {markets.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.nameEn}
                    </option>
                  ))}
                </select>
                <Label htmlFor="phone">{t("signup.phone")}</Label>
                <Input id="phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Button className="w-full" disabled={busy || !phone} onClick={() => void onSendOtp()}>
                  {t("signup.sendOtp")}
                </Button>
              </>
            )}
            {step === 1 && (
              <>
                <p className="text-sm text-muted-foreground">{t("signup.otpHint")}</p>
                <Label htmlFor="otp">{t("signup.otp")}</Label>
                <Input id="otp" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} />
                <Button className="w-full" disabled={busy || otp.length < 4} onClick={() => void onVerifyOtp()}>
                  {t("signup.verifyOtp")}
                </Button>
              </>
            )}
            {step === 2 && (
              <>
                <Label htmlFor="name">{t("signup.displayName")}</Label>
                <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                <Label htmlFor="email">{t("signup.email")}</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Label htmlFor="password">{t("signup.password")}</Label>
                <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Label htmlFor="specialty">{t("signup.specialty")}</Label>
                <select
                  id="specialty"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                >
                  {CLINICAL_SPECIALTY_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {t(`clinicalSpecialties.${key}`)}
                    </option>
                  ))}
                </select>
                <Button
                  className="w-full"
                  disabled={busy || !displayName || !email || password.length < 8}
                  onClick={() => setStep(3)}
                >
                  {t("signup.continue")}
                </Button>
              </>
            )}
            {step === 3 && (
              <>
                <Label htmlFor="clinic">{t("signup.clinicName")}</Label>
                <Input id="clinic" value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
                <Label htmlFor="city">{t("signup.city")}</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                <Label htmlFor="pin">{t("signup.locationUrl")}</Label>
                <Input id="pin" value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} placeholder="https://maps.google.com/..." />
                <Button className="w-full" disabled={!clinicName || !city} onClick={() => setStep(4)}>
                  {t("signup.continue")}
                </Button>
              </>
            )}
            {step === 4 && (
              <>
                <p className="text-sm">{t("signup.planIntro")}</p>
                <div className="grid gap-2">
                  <Button variant={planKey === "LITE" ? "default" : "outline"} onClick={() => setPlanKey("LITE")}>
                    {t("signup.planLite")}
                  </Button>
                  <Button variant={planKey === "PRO" ? "default" : "outline"} onClick={() => setPlanKey("PRO")}>
                    {t("signup.planProTrial")}
                  </Button>
                </div>
                <div className="space-y-2 rounded-md border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{t("signup.capabilityIntro")}</p>
                  <ul className="list-disc space-y-1 ps-4">
                    <li>{t("signup.capabilityBullets.preVisitSummary")}</li>
                    <li>{t("signup.capabilityBullets.noShowRisk")}</li>
                    <li>{t("signup.capabilityBullets.roleAssistant")}</li>
                    <li>{t("signup.capabilityBullets.chartScribe")}</li>
                  </ul>
                </div>
                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="text-sm font-medium">{t("signup.legalIntro")}</p>
                  <ul className="space-y-2 text-sm">
                    {requiredLegalIds.map((id) => {
                      const item = legalCatalog.find((c) => c.document === id);
                      const label = item
                        ? i18n.language.startsWith("ar")
                          ? item.titleAr
                          : item.titleEn
                        : id;
                      return (
                        <li key={id} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            id={`legal-${id}`}
                            className="mt-1"
                            checked={!!legalChecked[id]}
                            onChange={(e) =>
                              setLegalChecked((prev) => ({ ...prev, [id]: e.target.checked }))
                            }
                          />
                          <label htmlFor={`legal-${id}`} className="leading-snug">
                            {t("signup.legalAgree", { doc: label })}{" "}
                            <Link to={`/legal/${id}`} target="_blank" className="underline">
                              {t("signup.legalView")}
                            </Link>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <Button className="w-full" disabled={busy || !legalReady} onClick={() => void onFinish()}>
                  {t("signup.finish")}
                </Button>
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          {t("signup.patientPrivacyFooter")}{" "}
          <PatientPrivacyNoticeLink className="text-xs" />
        </p>
      </div>
    </div>
  );
}