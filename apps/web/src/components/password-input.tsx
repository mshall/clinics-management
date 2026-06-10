import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  /** When true, user must confirm before the field is shown (edit flows). */
  requirePromptToEdit?: boolean;
  className?: string;
};

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
  requirePromptToEdit = false,
  className,
}: PasswordInputProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [unlocked, setUnlocked] = useState(!requirePromptToEdit);

  function requestUnlock() {
    if (window.confirm(t("platform.confirmRevealPassword"))) {
      setUnlocked(true);
      setVisible(true);
    }
  }

  if (requirePromptToEdit && !unlocked) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <Input id={id} value="••••••••" disabled className="max-w-[12rem]" />
        <Button type="button" variant="outline" size="sm" onClick={requestUnlock}>
          {t("platform.changePassword")}
        </Button>
        <p className="w-full text-xs text-muted-foreground">{t("platform.passwordNotRetrievable")}</p>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pe-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute end-0 top-0 h-10 w-10"
        aria-label={visible ? t("platform.hidePassword") : t("platform.showPassword")}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
}
