import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDensityStore } from "@/stores/density-store";
import { GO_TO } from "@/components/keyboard-shortcuts-data";

function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n || !n.tagName) return false;
  return n.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(n.tagName) || n.closest("[role=dialog],[role=menu],[role=listbox]") != null;
}

/** Desktop power-user shortcuts: `?` cheat-sheet, `g` + letter navigation, `Shift+D` density. Inert while typing or in dialogs. */
export function KeyboardShortcuts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toggleDensity = useDensityStore((s) => s.toggle);
  const [open, setOpen] = useState(false);
  const armed = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || document.documentElement.dataset.edition === "nurse") return;
      if (e.key === "?") { e.preventDefault(); setOpen((v) => !v); return; }
      if (e.key === "D" && e.shiftKey) { e.preventDefault(); toggleDensity(); return; }
      if (armed.current != null) {
        window.clearTimeout(armed.current); armed.current = null;
        const hit = GO_TO.find((g) => g.key === e.key.toLowerCase());
        if (hit) { e.preventDefault(); navigate(hit.path); }
        return;
      }
      if (e.key === "g") armed.current = window.setTimeout(() => { armed.current = null; }, 1200);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, toggleDensity]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md" data-testid="shortcuts-dialog">
        <DialogHeader>
          <DialogTitle>{t("kx2.shortcuts.title", "Keyboard shortcuts")}</DialogTitle>
          <DialogDescription>{t("kx2.shortcuts.hint", "Available on desktop when no field is focused.")}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-1.5 text-sm">
          <Row keys={["Ctrl/⌘", "K"]} label={t("frontDesk.searchPatients", "Find patient")} />
          <Row keys={["Shift", "D"]} label={t("kx2.shortcuts.density", "Toggle compact density")} />
          <Row keys={["?"]} label={t("kx2.shortcuts.title", "Keyboard shortcuts")} />
          <div className="my-2 border-t border-border/70 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground rtl:normal-case rtl:tracking-normal">{t("kx2.shortcuts.goTo", "Go to")}</div>
          {GO_TO.map((g) => <Row key={g.key} keys={["G", g.key.toUpperCase()]} label={t(g.labelKey, g.fallback)} />)}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-1 py-1">
      <dt className="text-foreground">{label}</dt>
      <dd className="flex items-center gap-1" dir="ltr">{keys.map((k, i) => <kbd key={i} className="kx-kbd">{k}</kbd>)}</dd>
    </div>
  );
}
