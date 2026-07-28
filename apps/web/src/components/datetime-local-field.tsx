import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DatetimeLocalFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Earliest selectable time (HH:mm), e.g. "09:00" */
  minTime?: string;
  /** Time input step in seconds (900 = 15 minutes) */
  stepSeconds?: number;
  /** Default time when date is set but time is empty */
  defaultTime?: string;
};

function splitDatetimeLocal(value: string): { date: string; time: string } {
  if (!value.trim()) return { date: "", time: "" };
  const [date, time = ""] = value.split("T");
  return { date: date ?? "", time: time.slice(0, 5) };
}

/** Split date + time fields — more reliable than `datetime-local` on iOS/Android. */
export function DatetimeLocalField({
  id,
  value,
  onChange,
  disabled,
  className,
  minTime,
  stepSeconds,
  defaultTime = "00:00",
}: DatetimeLocalFieldProps) {
  const { date, time } = splitDatetimeLocal(value);

  const update = (nextDate: string, nextTime: string) => {
    if (!nextDate.trim()) {
      onChange("");
      return;
    }
    onChange(`${nextDate}T${nextTime || defaultTime}`);
  };

  return (
    <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", className)}>
      <Input
        id={id}
        type="date"
        className="ltr-nums"
        value={date}
        disabled={disabled}
        onChange={(e) => update(e.target.value, time)}
      />
      <Input
        type="time"
        className="ltr-nums"
        value={time}
        disabled={disabled}
        min={minTime}
        step={stepSeconds}
        onChange={(e) => update(date, e.target.value)}
      />
    </div>
  );
}
