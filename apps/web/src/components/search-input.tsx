import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Mobile-friendly text search field (16px text, search keyboard hints). */
export function SearchInput({ className, type = "text", ...props }: InputProps) {
  return (
    <Input
      type={type}
      inputMode={type === "text" || type === "search" ? "search" : props.inputMode}
      enterKeyHint={props.enterKeyHint ?? "search"}
      autoComplete={props.autoComplete ?? "off"}
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      className={cn(className)}
      {...props}
    />
  );
}
