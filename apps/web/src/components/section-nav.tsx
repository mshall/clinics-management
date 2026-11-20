import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionNavItem<T extends string> {
  id: T;
  label: ReactNode;
  /** Optional count / status rendered as a small chip after the label. */
  badge?: ReactNode;
  hidden?: boolean;
}

/**
 * Underline section navigation for consoles (Admin, HR, Platform). Buttons (not links) with aria-current so the
 * page state stays in React; scrolls sideways on phones, 44 px targets, mirrors in RTL.
 */
export function SectionNav<T extends string>({ items, value, onChange, label, className, trailing }: {
  items: SectionNavItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={cn("flex items-end gap-3", className)}>
      <nav aria-label={label} className="kx-secnav min-w-0 flex-1">
        {items.filter((i) => !i.hidden).map((i) => (
          <button key={i.id} type="button" aria-current={value === i.id ? "true" : undefined} onClick={() => onChange(i.id)} className="touch-manipulation focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
            <span className="inline-flex items-center gap-1.5">
              {i.label}
              {i.badge != null && <span className="rounded-full bg-muted px-1.5 text-[0.6875rem] font-semibold tabular-nums text-muted-foreground">{i.badge}</span>}
            </span>
          </button>
        ))}
      </nav>
      {trailing ? <div className="shrink-0 pb-1">{trailing}</div> : null}
    </div>
  );
}
