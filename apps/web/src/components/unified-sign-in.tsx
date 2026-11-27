/**
 * Kiorly unified sign-in card (founder decision 28 Nov 2026): ONE component for the Clinic, Pharmacy and Lab login pages (and reusable by Nurse).
 * Primary "Sign in with Kiorex Passport", then "or", then "E-mail and password". Which parts show is decided by the server through each product's
 * `/auth/config` (passport on or off, local login on or off); the card never decides by itself, and never shows a control the server refuses.
 *
 * CANONICAL SOURCE: kiorex-account/packages/unified-login/unified-sign-in.tsx. The three web apps hold VERBATIM copies at
 * `src/components/unified-sign-in.tsx` (the workspace distributes shared UI by copy, like sign-in-method-tabs). Never edit a copy: change this file, then run
 * `scripts/sync-unified-login.sh` in the workspace. `scripts/check-unified-login.sh` and each repo's parity test fail when a copy diverges.
 *
 * Dependencies: React only. Styling uses the design tokens every Kiorly web already defines (bg-primary, border-input, text-muted-foreground, ...). Strings (EN and AR) live here
 * so the words are identical everywhere. Accessible: labelled fields, role=alert errors, 44px targets, visible focus, RTL through `dir` of the page.
 */
import { useId, useState, type FormEvent, type ReactNode } from "react";

export type UnifiedLang = "en" | "ar";

const STRINGS = {
  en: {
    passport: "Sign in with Kiorex Passport",
    passportHint: "One Kiorex Passport for every Kiorly product. Your phone number is verified by a one-time code.",
    or: "or",
    password: "E-mail and password",
    email: "E-mail",
    pw: "Password",
    org: "Organisation (only if your e-mail is used in more than one)",
    signIn: "Sign in",
    forgot: "Forgot your password?",
    busy: "Signing in...",
    none: "Sign-in is not available right now. Try again in a minute.",
    show: "Show password",
    hide: "Hide password",
    errors: {
      BAD_CREDENTIALS: "Invalid e-mail or password, or the account is temporarily locked after repeated failures.",
      RATE_LIMITED: "Too many sign-in attempts. Try again in a minute.",
      PASSPORT_REQUIRED_FOR_ROLE: "Your role signs in with Kiorex Passport (two-step verification). Use Sign in with Kiorex Passport.",
      LOCAL_LOGIN_DISABLED: "Password sign-in is not enabled here. Use Sign in with Kiorex Passport.",
      ORGANISATION_REQUIRED: "This e-mail is used in more than one organisation. Enter the organisation.",
      PASSPORT_NOT_LINKED: "This Kiorex Passport is not linked to a staff account yet. Ask your owner to add your verified phone number.",
      MFA_REQUIRED: "Two-step verification is required for your role. Sign in with Kiorex Passport.",
      DEFAULT: "Sign-in failed. Check your details and try again.",
    },
  },
  ar: {
    passport: "تسجيل الدخول عبر جواز كيوريكس",
    passportHint: "جواز كيوريكس واحد لكل منتجات كيورلي. يتم التحقق من رقم هاتفك برمز لمرة واحدة.",
    or: "أو",
    password: "البريد الإلكتروني وكلمة المرور",
    email: "البريد الإلكتروني",
    pw: "كلمة المرور",
    org: "المؤسسة (فقط إذا كان بريدك مستخدماً في أكثر من مؤسسة)",
    signIn: "تسجيل الدخول",
    forgot: "نسيت كلمة المرور؟",
    busy: "جارٍ تسجيل الدخول...",
    none: "تسجيل الدخول غير متاح حالياً. حاول مرة أخرى بعد دقيقة.",
    show: "إظهار كلمة المرور",
    hide: "إخفاء كلمة المرور",
    errors: {
      BAD_CREDENTIALS: "البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب مقفل مؤقتاً بعد محاولات فاشلة متكررة.",
      RATE_LIMITED: "محاولات كثيرة. حاول مرة أخرى بعد دقيقة.",
      PASSPORT_REQUIRED_FOR_ROLE: "دورك يسجل الدخول عبر جواز كيوريكس (التحقق بخطوتين). استخدم تسجيل الدخول عبر جواز كيوريكس.",
      LOCAL_LOGIN_DISABLED: "تسجيل الدخول بكلمة المرور غير مفعل هنا. استخدم تسجيل الدخول عبر جواز كيوريكس.",
      ORGANISATION_REQUIRED: "هذا البريد مستخدم في أكثر من مؤسسة. أدخل المؤسسة.",
      PASSPORT_NOT_LINKED: "جواز كيوريكس هذا غير مرتبط بحساب موظف بعد. اطلب من المالك إضافة رقم هاتفك الموثق.",
      MFA_REQUIRED: "التحقق بخطوتين مطلوب لدورك. سجّل الدخول عبر جواز كيوريكس.",
      DEFAULT: "فشل تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.",
    },
  },
} as const;

/** Same words everywhere: maps a server error code to the shared text (falls back to the server message, then to the default). */
function signInErrorText(lang: UnifiedLang, code?: string | null, serverMessage?: string | null): string {
  const e = STRINGS[lang].errors as Record<string, string>;
  return (code && e[code]) || serverMessage || e.DEFAULT!;
}

export interface UnifiedSignInProps {
  lang: UnifiedLang;
  /** From `/auth/config`: Kiorex Passport is available. */
  passport: { available: boolean; onStart: () => void };
  /** From `/auth/config`: e-mail + password is offered by this server. `onSubmit` must throw on failure (the card shows `error`). */
  local: { enabled: boolean; onSubmit: (v: { email: string; password: string; orgSlug?: string }) => Promise<void>; showOrg?: boolean; defaultOrg?: string; forgotHref?: string };
  /** Error to show (code from the server; the card maps it to the shared text). */
  error?: { code?: string | null; message?: string | null } | null;
  /** Replaces the built-in e-mail form (Clinic keeps its second step and phone code inside the same frame). */
  localSlot?: ReactNode;
  notice?: ReactNode;
  footer?: ReactNode;
  /** The config has not arrived yet: render a calm placeholder, never a half form. */
  loading?: boolean;
}

const btnBase = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";
const inputCls = "min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base shadow-kx-1 placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:text-sm";

export function UnifiedSignIn({ lang, passport, local, error, localSlot, notice, footer, loading }: UnifiedSignInProps) {
  const s = STRINGS[lang];
  const uid = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState(local.defaultOrg ?? "");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const showLocal = local.enabled;
  const showPassport = passport.available;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await local.onSubmit({ email: email.trim(), password, ...(local.showOrg && org.trim() ? { orgSlug: org.trim() } : {}) }); } catch { /* the page shows `error` */ } finally { setBusy(false); }
  };
  if (loading) return <div role="status" aria-busy="true" data-testid="signin-loading" className="h-40 animate-pulse rounded-xl bg-muted/60" />;
  return (
    <div className="space-y-5" data-testid="unified-signin">
      {notice}
      {showPassport ? (
        <div className="space-y-2" data-testid="signin-passport-panel">
          <button type="button" data-testid="signin-passport" onClick={passport.onStart} className={`${btnBase} bg-primary text-primary-foreground shadow-kx-1 hover:bg-(--kx-primary-hover)`}>{s.passport}</button>
          <p className="text-center text-xs text-muted-foreground">{s.passportHint}</p>
        </div>
      ) : null}
      {showPassport && showLocal ? (
        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground" role="separator" aria-label={s.or}>
          <span className="h-px flex-1 bg-border" /><span>{s.or}</span><span className="h-px flex-1 bg-border" />
        </div>
      ) : null}
      {showLocal ? (
        <section aria-label={s.password} data-testid="signin-password-panel" className="space-y-4">
          {showPassport ? <h2 className="text-sm font-semibold text-foreground">{s.password}</h2> : null}
          {localSlot ?? (
            <form className="space-y-4" onSubmit={submit} noValidate={false}>
              {local.showOrg ? (
                <div className="space-y-1.5"><label htmlFor={`${uid}-org`} className="text-sm font-medium">{s.org}</label>
                  <input id={`${uid}-org`} className={inputCls} value={org} onChange={(e) => setOrg(e.target.value)} autoComplete="organization" spellCheck={false} autoCapitalize="none" /></div>
              ) : null}
              <div className="space-y-1.5"><label htmlFor={`${uid}-email`} className="text-sm font-medium">{s.email}</label>
                <input id={`${uid}-email`} data-testid="signin-email" className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" /></div>
              <div className="space-y-1.5"><label htmlFor={`${uid}-pw`} className="text-sm font-medium">{s.pw}</label>
                <div className="flex gap-2">
                  <input id={`${uid}-pw`} data-testid="signin-password" className={inputCls} type={reveal ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
                  <button type="button" className="min-h-11 shrink-0 rounded-lg border border-input px-3 text-xs text-muted-foreground hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-pressed={reveal} onClick={() => setReveal((v) => !v)}>{reveal ? s.hide : s.show}</button>
                </div></div>
              {error ? <p role="alert" data-testid="signin-error" className="text-sm text-destructive">{signInErrorText(lang, error.code, error.message)}</p> : null}
              <button type="submit" data-testid="signin-submit" disabled={busy} className={`${btnBase} ${showPassport ? "border border-input bg-card text-foreground shadow-kx-1 hover:bg-accent" : "bg-primary text-primary-foreground shadow-kx-1 hover:bg-(--kx-primary-hover)"}`}>{busy ? s.busy : s.signIn}</button>
              {local.forgotHref ? <p className="text-center text-sm"><a href={local.forgotHref} className="font-medium text-primary underline-offset-4 hover:underline">{s.forgot}</a></p> : null}
            </form>
          )}
        </section>
      ) : null}
      {!showPassport && !showLocal ? <p role="status" className="text-sm text-muted-foreground">{s.none}</p> : null}
      {localSlot && error ? <p role="alert" data-testid="signin-error" className="text-sm text-destructive">{signInErrorText(lang, error.code, error.message)}</p> : null}
      {footer ? <div className="text-center">{footer}</div> : null}
    </div>
  );
}

/** Same words for the pages around the card (forgot and reset password): `UnifiedSignIn.errorText(lang, code, message)`. */
UnifiedSignIn.errorText = signInErrorText;
