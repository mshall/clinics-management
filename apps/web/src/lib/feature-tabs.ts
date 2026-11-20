import { cn } from "@/lib/utils";

/** Shared list chrome for colorful feature-page tabs. */
export const featureTabsListClassName =
  "grid h-auto w-full gap-1.5 rounded-xl border border-border/60 bg-muted/40 p-1.5 sm:inline-flex sm:w-auto sm:max-w-full";

/** Active tab: filled brand surface; inactive: quiet. */
export function featureTabTriggerClassName(accent: "sky" | "violet" | "emerald" | "amber") {
  const active = {
    sky: "data-[state=active]:bg-sky-600 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-sky-500",
    violet:
      "data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-violet-500",
    emerald:
      "data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-emerald-500",
    amber:
      "data-[state=active]:bg-amber-600 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-amber-500",
  }[accent];
  return cn(
    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-all",
    "hover:bg-background/80 hover:text-foreground",
    "data-[state=inactive]:bg-transparent",
    active,
  );
}
