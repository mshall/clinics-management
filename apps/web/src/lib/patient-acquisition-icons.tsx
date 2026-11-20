import type { ReactNode } from "react";
import { FileSpreadsheet, Globe2, HelpCircle, Stethoscope, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { patientAcquisitionLabel, type PatientAcquisitionChannel } from "@/lib/patient-acquisition";

function BrandSvg({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden
      role="img"
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <BrandSvg className={cn("text-[#1877F2]", className)} title="Facebook">
      <path
        fill="currentColor"
        d="M14 9h3V6h-3c-1.9 0-3.5 1.5-3.5 3.4V12H8v3h2.5v7h3v-7H16l.5-3H13.5v-2.1c0-.5.3-.9.8-.9z"
      />
    </BrandSvg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <BrandSvg className={cn("text-[#E4405F]", className)} title="Instagram">
      <path
        fill="currentColor"
        d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9A4.5 4.5 0 0 1 16.5 21h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3zm0 1.6A2.9 2.9 0 0 0 4.6 7.5v9a2.9 2.9 0 0 0 2.9 2.9h9a2.9 2.9 0 0 0 2.9-2.9v-9a2.9 2.9 0 0 0-2.9-2.9h-9zm9.2 1.2a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2zM12 8.2A3.8 3.8 0 1 1 8.2 12 3.8 3.8 0 0 1 12 8.2zm0 1.6A2.2 2.2 0 1 0 14.2 12 2.2 2.2 0 0 0 12 9.8z"
      />
    </BrandSvg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <BrandSvg className={cn("text-foreground", className)} title="TikTok">
      <path
        fill="currentColor"
        d="M16.6 4.1c.7 1.5 2 2.6 3.6 3v2.4a6.8 6.8 0 0 1-3.6-1.1v5.7a5.8 5.8 0 1 1-5.8-5.8c.3 0 .6 0 .9.1v2.5a3.3 3.3 0 1 0 2.4 3.2V4.1h2.5z"
      />
    </BrandSvg>
  );
}

const CHANNEL_META: Record<
  PatientAcquisitionChannel | "UNKNOWN",
  { icon: (props: { className?: string }) => ReactNode; textClass: string; iconWrap: string }
> = {
  SOCIAL_FACEBOOK: {
    icon: FacebookIcon,
    textClass: "text-[#1877F2]",
    iconWrap: "bg-[#1877F2]/10",
  },
  SOCIAL_INSTAGRAM: {
    icon: InstagramIcon,
    textClass: "text-[#E4405F]",
    iconWrap: "bg-[#E4405F]/10",
  },
  SOCIAL_TIKTOK: {
    icon: TikTokIcon,
    textClass: "text-foreground",
    iconWrap: "bg-muted",
  },
  WEBSITE_GOOGLE: {
    icon: ({ className }) => <Globe2 className={cn("size-4 text-emerald-600 dark:text-emerald-400", className)} aria-hidden />,
    textClass: "text-emerald-700 dark:text-emerald-400",
    iconWrap: "bg-emerald-500/10",
  },
  DOCTOR_REFERRAL: {
    icon: ({ className }) => <Stethoscope className={cn("size-4 text-sky-600 dark:text-sky-400", className)} aria-hidden />,
    textClass: "text-sky-700 dark:text-sky-400",
    iconWrap: "bg-sky-500/10",
  },
  KIOREX: {
    icon: ({ className }) => <Store className={cn("size-4 text-violet-600 dark:text-violet-400", className)} aria-hidden />,
    textClass: "text-violet-700 dark:text-violet-400",
    iconWrap: "bg-violet-500/10",
  },
  OTHER: {
    icon: ({ className }) => <HelpCircle className={cn("size-4 text-amber-600 dark:text-amber-400", className)} aria-hidden />,
    textClass: "text-amber-700 dark:text-amber-400",
    iconWrap: "bg-amber-500/10",
  },
  IMPORT: {
    icon: ({ className }) => <FileSpreadsheet className={cn("size-4 text-teal-600 dark:text-teal-400", className)} aria-hidden />,
    textClass: "text-teal-700 dark:text-teal-400",
    iconWrap: "bg-teal-500/10",
  },
  UNKNOWN: {
    icon: ({ className }) => <HelpCircle className={cn("size-4 text-muted-foreground", className)} aria-hidden />,
    textClass: "text-muted-foreground",
    iconWrap: "bg-muted",
  },
};

export function AcquisitionChannelCell({
  channel,
  label,
  t,
}: {
  channel: string;
  label?: string;
  t: (key: string, fallback: string) => string;
}) {
  const key = (channel in CHANNEL_META ? channel : "UNKNOWN") as keyof typeof CHANNEL_META;
  const meta = CHANNEL_META[key];
  const Icon = meta.icon;
  const text =
    label ??
    (key === "UNKNOWN"
      ? t("reports.acquisitionUnknown", "Not specified")
      : patientAcquisitionLabel(key as PatientAcquisitionChannel, t));
  return (
    <span className={cn("inline-flex items-center gap-2 font-medium", meta.textClass)}>
      <span className={cn("inline-flex size-7 items-center justify-center rounded-md", meta.iconWrap)}>
        <Icon />
      </span>
      <span>{text}</span>
    </span>
  );
}

export function ReportColumnHead({
  icon,
  label,
  className,
  tone = "slate",
}: {
  icon: ReactNode;
  label: ReactNode;
  className?: string;
  tone?: "slate" | "sky" | "emerald" | "violet" | "amber" | "rose";
}) {
  const toneClass = {
    slate: "text-slate-700 dark:text-slate-300",
    sky: "text-sky-700 dark:text-sky-400",
    emerald: "text-emerald-700 dark:text-emerald-400",
    violet: "text-violet-700 dark:text-violet-400",
    amber: "text-amber-700 dark:text-amber-400",
    rose: "text-rose-700 dark:text-rose-400",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-semibold", toneClass, className)}>
      <span className="opacity-90" aria-hidden>
        {icon}
      </span>
      {label}
    </span>
  );
}
