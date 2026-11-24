import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type FilterSelectOption = {
  value: string;
  label: string;
  description?: string;
};

type FilterSelectProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  /** Accessible name; also used as the menu heading when provided. */
  label: string;
  /** Optional visual label above the control (omit when a parent Label is already present). */
  showLabel?: boolean;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  "data-testid"?: string;
};

/**
 * Compact filter control: trigger + radio menu. Prefer this over native &lt;select&gt; when the
 * list is short and needs a consistent professional look (toolbar / card headers).
 */
export function FilterSelect({
  id,
  value,
  onChange,
  options,
  label,
  showLabel = false,
  placeholder,
  className,
  triggerClassName,
  disabled,
  "data-testid": testId,
}: FilterSelectProps) {
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const display = selected?.label ?? placeholder ?? label;

  return (
    <div className={cn("space-y-1.5", className)}>
      {showLabel ? (
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            id={id}
            type="button"
            data-testid={testId}
            aria-label={label}
            disabled={disabled}
            className={cn(
              "group flex h-10 min-h-10 w-full min-w-[12rem] max-w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-start text-sm shadow-xs transition-[border-color,box-shadow,background-color]",
              "hover:border-ring/40 hover:bg-accent/40",
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "data-[state=open]:border-ring/50 data-[state=open]:bg-accent/30 data-[state=open]:ring-2 data-[state=open]:ring-ring/30",
              triggerClassName,
            )}
          >
            <span className="min-w-0 truncate font-medium text-foreground">{display}</span>
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[min(100vw-2rem,22rem)] rounded-xl border border-border p-1.5 shadow-[var(--kx-shadow-3,0_10px_40px_-12px_rgb(0_0_0_/_.18))]"
        >
          <DropdownMenuLabel className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {label}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuRadioGroup value={value} onValueChange={onChange} className="max-h-72 overflow-y-auto">
            {options.map((opt) => (
              <DropdownMenuRadioItem
                key={opt.value || "__empty__"}
                value={opt.value}
                className={cn(
                  "cursor-pointer rounded-lg py-2.5 text-sm",
                  "data-[state=checked]:bg-primary/8 data-[state=checked]:font-medium",
                )}
              >
                <span className="flex min-w-0 flex-col gap-0.5 pe-1">
                  <span className="leading-snug">{opt.label}</span>
                  {opt.description ? (
                    <span className="text-xs font-normal text-muted-foreground">{opt.description}</span>
                  ) : null}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
