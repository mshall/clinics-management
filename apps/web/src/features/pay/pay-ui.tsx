import type { ReactNode } from "react";

/** A table whose scroll area is keyboard-focusable and named (WCAG 2.1.1): on a 320 px screen the table scrolls sideways. */
export function Tbl({ label, testid, children }: { label: string; testid: string; children: ReactNode }) {
  return <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-lg"><table className="w-full text-sm" data-testid={testid}>{children}</table></div>;
}
export const TH = ({ children }: { children: ReactNode }) => <th scope="col" className="h-10 whitespace-nowrap px-3 text-start font-medium text-muted-foreground">{children}</th>;
export const TD = ({ children, className = "" }: { children: ReactNode; className?: string }) => <td className={`border-t p-3 align-top ${className}`}>{children}</td>;

const TONE: Record<string, string> = { good: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200", warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", bad: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200", info: "bg-muted text-foreground" };
export function Pill({ tone = "info", children, testid }: { tone?: "good" | "warn" | "bad" | "info"; children: ReactNode; testid?: string }) {
  return <span data-testid={testid} className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>{children}</span>;
}
