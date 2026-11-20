/**
 * Kiorly Clinic / Lab / Pharmacy by Kiorex — shared layout primitives (vendored per repo; keep in sync with the copy in the other Kiorly apps).
 * Props carry already-translated strings, so this file has no i18n or routing dependency.
 */
import { useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useTranslation } from "react-i18next";
import { KiorexLogo, PulseLine } from "./components";
import { footSegments } from "./components/shared/foot-text";
import { KxControlPair, KxLanguageToggle, KxThemeToggle, withThemeTransition, type KxLang } from "./components/web/KxControls";
export { KxControlPair };

/** Decorative pulse line (hidden from assistive tech) for loaders/empty states. */
export function Pulse({ size = 14, loop = false }: { size?: number; loop?: boolean }) {
  return <span aria-hidden="true" className="inline-flex"><PulseLine size={size} loop={loop} label="" /></span>;
}

export const kcn = (...i: ClassValue[]) => twMerge(clsx(i));

export type KTone = "neutral" | "good" | "warn" | "bad" | "info" | "brand";

/** Semantic chip colours — coral is never an error colour. */
const CHIP: Record<KTone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  good: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] ring-[hsl(var(--success)/0.25)]",
  warn: "bg-[hsl(var(--warning)/0.14)] text-[hsl(var(--warning))] ring-[hsl(var(--warning)/0.3)]",
  bad: "bg-[hsl(var(--danger-text)/0.12)] text-[hsl(var(--danger-text))] ring-[hsl(var(--danger-text)/0.28)]",
  info: "bg-[hsl(var(--info)/0.12)] text-[hsl(var(--info))] ring-[hsl(var(--info)/0.25)]",
  brand: "bg-accent text-accent-foreground ring-primary/20",
};
const DOT: Record<KTone, string> = { neutral: "bg-muted-foreground", good: "bg-[hsl(var(--success))]", warn: "bg-[hsl(var(--warning))]", bad: "bg-[hsl(var(--danger-text))]", info: "bg-[hsl(var(--info))]", brand: "bg-primary" };

export function StatusChip({ tone = "neutral", dot = true, className, children }: { tone?: KTone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={kcn("inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", CHIP[tone], className)}>
      {dot && <span aria-hidden className={kcn("size-1.5 rounded-full", DOT[tone])} />}
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <header className={kcn("mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border/70 pb-4", className)}>
      <div className="min-w-0 flex-1 basis-72">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Surface({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={kcn("rounded-xl border border-border/80 bg-card text-card-foreground shadow-kx-1", className)} {...p} />;
}

export function StatCard({ label, value, hint, icon, tone = "neutral", className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: KTone; className?: string }) {
  const bar: Record<KTone, string> = { neutral: "bg-border", good: "bg-[hsl(var(--success))]", warn: "bg-[hsl(var(--warning))]", bad: "bg-[hsl(var(--danger-text))]", info: "bg-[hsl(var(--info))]", brand: "bg-primary" };
  return (
    <Surface className={kcn("relative overflow-hidden p-4", className)}>
      <span aria-hidden className={kcn("absolute inset-y-0 inset-s-0 w-1", bar[tone])} />
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {icon && <div aria-hidden className="text-muted-foreground">{icon}</div>}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </Surface>
  );
}

/** Brand illustration: the chevron pair + coral pulse (no stock art). */
export function EmptyState({ title, description, action, tone = "empty", className, compact }: { title: ReactNode; description?: ReactNode; action?: ReactNode; tone?: "empty" | "error" | "offline"; className?: string; compact?: boolean }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={kcn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-6 text-center", compact ? "py-8" : "py-14", className)}>
      <div className={kcn("flex items-center gap-3", tone === "offline" && "opacity-60 grayscale")}>
        <KiorexLogo variant="mark" product={KIORLY_PRODUCT} height={compact ? 36 : 52} title="" />
      </div>
      <Pulse size={compact ? 14 : 18} />
      <div className="text-base font-semibold">{title}</div>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={kcn("kx-skeleton h-4 w-full", className)} />;
}
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-busy="true" className="space-y-3 p-4">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4">{Array.from({ length: cols }, (_, c) => <Skeleton key={c} className={c === 0 ? "w-1/3" : "w-1/5"} />)}</div>
      ))}
    </div>
  );
}

/** Accessible field wrapper: label, hint, error (aria-describedby wired through the render prop). */
export function FormField({ label, hint, error, required, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; className?: string; children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode }) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={kcn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium">{label}{required && <span aria-hidden className="ms-0.5 text-[hsl(var(--danger-text))]">*</span>}</label>
      {children({ id, "aria-describedby": hint || error ? msgId : undefined, "aria-invalid": error ? true : undefined })}
      {error ? <p id={msgId} role="alert" className="text-xs text-[hsl(var(--danger-text))]">{error}</p> : hint ? <p id={msgId} className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Stepper({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  return (
    <ol className={kcn("flex items-center gap-2 text-sm", className)} aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === current ? "step" : undefined} className="flex items-center gap-2">
          <span className={kcn("flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums", i < current ? "bg-primary text-primary-foreground" : i === current ? "bg-accent text-accent-foreground ring-2 ring-primary" : "bg-muted text-muted-foreground")}>{i + 1}</span>
          <span className={kcn("hidden sm:inline", i === current ? "font-semibold" : "text-muted-foreground")}>{s}</span>
          {i < steps.length - 1 && <span aria-hidden className="h-px w-6 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

/** The product this app is. The ONLY line that differs between the vendored copies of this file ("clinic" | "lab" | "pharmacy"); it selects the lockup text ("Kiorly Clinic by Kiorex") and accent colour. */
export const KIORLY_PRODUCT: "clinic" | "lab" | "pharmacy" = "clinic";

/** "Kiorly <Product> by Kiorex" lockup for sidebars/headers (Nurse edition of Clinic uses the Nurse lockup). Switches to the inverse tone in dark mode and to the Arabic wordmark («كيورلي للعيادات من كيوريكس», mark on the right) when the UI language is Arabic. */
export function KiorlyBrand({ nurse, height = 30, className }: { nurse?: boolean; height?: number; className?: string }) {
  const product = nurse ? "nurse" : KIORLY_PRODUCT;
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <span className={kcn("inline-flex", className)}>
      <KiorexLogo variant="lockup" product={product} lang={lang} tone="color" height={height} className="dark:hidden" />
      <KiorexLogo variant="lockup" product={product} lang={lang} tone="inverse" height={height} className="hidden dark:block" />
    </span>
  );
}
/** Text version of the lockup (e.g. a login footer on the dark hero): the last letter of KIORLY (Y; ي in Arabic) and the WHOLE product word are set in the product accent (inverse tint), the rest inherits.
 *  Letter joining: the ي span changes ONLY the colour (no weight/font change), so Arabic shaping stays connected across the span boundary. */
const KIORLY_ACCENT_ON_DARK = { clinic: "#2DD4BF", lab: "#A78BFA", pharmacy: "#4ADE80" } as const;
export function KiorlyFootText({ text, word }: { text: string; word: string }) {
  const accent = KIORLY_ACCENT_ON_DARK[KIORLY_PRODUCT];
  const segs = footSegments(text, word);
  const node = (seg: (typeof segs)[number], i: number) => seg.kind === "last"
    ? <span key={i} data-kx-accent="last" style={{ color: accent }}>{seg.text}</span>
    : seg.kind === "word"
      ? <span key={i} data-kx-accent="word" style={{ color: accent, fontWeight: 600 }}>{seg.text}</span>
      : <span key={i}>{seg.text}</span>;
  // The Arabic font fuses ل+ي into one required ligature glyph, which would take a single colour; "rlig" off on the brand word (only) keeps ي a separate, joined glyph.
  const brand = segs.filter((s) => s.kind === "brand" || s.kind === "last");
  const rest = segs.filter((s) => s.kind !== "brand" && s.kind !== "last");
  return (
    <>
      {brand.length ? <span data-kx-brand style={{ fontFeatureSettings: '"rlig" 0' }}>{brand.map(node)}</span> : null}
      {rest.map((s, i) => node(s, i + brand.length))}
    </>
  );
}
export function KiorlyMark({ size = 28, nurse }: { size?: number; nurse?: boolean }) {
  const product = nurse ? "nurse" : KIORLY_PRODUCT;
  return (
    <span className="inline-flex">
      <KiorexLogo variant="mark" tone="color" height={size} product={product} className="dark:hidden" />
      <KiorexLogo variant="mark" tone="inverse" height={size} product={product} className="hidden dark:block" />
    </span>
  );
}

/* ---- Theme (light / dark / system) for apps without their own theme store ---- */
export type KxThemePref = "light" | "dark" | "system";
const THEME_KEY = "kx-theme";
export function readThemePref(): KxThemePref {
  try { const v = localStorage.getItem(THEME_KEY); if (v === "light" || v === "dark" || v === "system") return v; } catch { /* ignore */ }
  return "system";
}
export function applyThemePref(pref: KxThemePref): void {
  const dark = pref === "dark" || (pref === "system" && typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}
/** Call once before React mounts (index.html also applies the saved theme inline, before first paint, so nothing flashes). */
export function initTheme(): void {
  applyThemePref(readThemePref());
  if (typeof matchMedia !== "undefined") matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (readThemePref() === "system") withThemeTransition(() => applyThemePref("system")); });
}
/** Shared theme control (sun / moon / monitor, cross-fading). Persists to localStorage `kx-theme`; the colour change is animated (reduced-motion safe). */
export function ThemeToggle({ labels, className }: { labels: { light: string; dark: string; system: string; theme: string }; className?: string }) {
  const [pref, setPref] = useState<KxThemePref>(readThemePref);
  return (
    <KxThemeToggle value={pref} labels={labels} className={className} onChange={(next) => {
      try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
      setPref(next);
      withThemeTransition(() => applyThemePref(next));
    }} />
  );
}
/** Shared language control (globe + AR / EN). `onChange` is the app's own setLang (sets lang/dir on <html> and persists). */
export function LanguageToggle({ onChange, className }: { onChange: (next: KxLang) => void; className?: string }) {
  const { t, i18n } = useTranslation();
  return <KxLanguageToggle lang={i18n.language} onChange={onChange} className={className} labels={{ language: t("lang.label"), english: t("lang.english"), arabic: t("lang.arabic") }} />;
}
/** The lockup ("Kiorly <Product> by Kiorex") with the localised product tagline ("<Product> Management") beneath it: sidebar, drawer, login and onboarding all use this. */
export function KiorlyBrandLockup({ height = 44, tagline = true, nurse, className }: { height?: number; tagline?: boolean; nurse?: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={kcn("min-w-0", className)} data-kx-lockup>
      <KiorlyBrand nurse={nurse} height={height} />
      {tagline ? <p data-kx-tagline className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">{t("app.tagline")}</p> : null}
    </div>
  );
}
