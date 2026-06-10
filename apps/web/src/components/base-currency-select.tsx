import { BASE_CURRENCY_OPTIONS } from "@/lib/base-currencies";
import { cn } from "@/lib/utils";

type BaseCurrencySelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function BaseCurrencySelect({ id, value, onChange, className }: BaseCurrencySelectProps) {
  return (
    <select
      id={id}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        className,
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {BASE_CURRENCY_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
