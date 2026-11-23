import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { SignInMethod } from "@/lib/sign-in-method";

const ORDER: SignInMethod[] = ["passport", "password"];

/** The two-option sign-in switch (Kiorex Passport first, Password second): a real tablist, arrow keys move between the tabs, 44px touch targets. */
export function SignInMethodTabs({ value, onChange, labels, className }: { value: SignInMethod; onChange: (m: SignInMethod) => void; labels: { group: string; passport: string; password: string }; className?: string }) {
  const refs = useRef<Partial<Record<SignInMethod, HTMLButtonElement | null>>>({});
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? "passport" : e.key === "End" ? "password" : ORDER[1 - ORDER.indexOf(value)];
    onChange(next); refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={labels.group} data-testid="signin-method" className={cn("grid grid-cols-2 gap-1 rounded-xl bg-muted p-1", className)}>
      {ORDER.map((m) => {
        const selected = m === value;
        return (
          <button key={m} ref={(el) => { refs.current[m] = el; }} type="button" role="tab" id={`signin-tab-${m}`} aria-selected={selected} aria-controls={`signin-panel-${m}`} tabIndex={selected ? 0 : -1}
            data-testid={`signin-method-${m}`} onClick={() => onChange(m)} onKeyDown={onKeyDown}
            className={cn("min-h-11 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring", selected ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {labels[m]}
          </button>
        );
      })}
    </div>
  );
}
