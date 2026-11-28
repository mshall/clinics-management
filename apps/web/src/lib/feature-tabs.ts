import { cn } from "@/lib/utils";

/** Shared list chrome for colorful feature-page tabs. */
export const featureTabsListClassName =
  "grid h-auto w-full gap-1.5 rounded-xl border border-border/60 bg-muted/40 p-1.5 sm:inline-flex sm:w-auto sm:max-w-full";

/** Active tab: filled brand surface; inactive: quiet. The 700 shades keep white label text above the WCAG AA 4.5:1 ratio in light and dark. */
export function featureTabTriggerClassName(accent: "sky" | "violet" | "emerald" | "amber") {
  const active = {
    sky: "data-[state=active]:bg-sky-700 data-[state=active]:text-white data-[state=active]:shadow-md",
    violet:
      "data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-violet-600",
    emerald:
      "data-[state=active]:bg-emerald-700 data-[state=active]:text-white data-[state=active]:shadow-md",
    amber:
      "data-[state=active]:bg-amber-700 data-[state=active]:text-white data-[state=active]:shadow-md",
  }[accent];
  return cn(
    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-all",
    "hover:bg-background/80 hover:text-foreground",
    "data-[state=inactive]:bg-transparent",
    active,
  );
}
