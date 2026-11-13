import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/http";
import type { PatientDto } from "@/lib/api-schema";
import { resolvePatientListLabel } from "@/lib/patient-display";

type SearchResult = { items: PatientDto[] };

export function GlobalPatientSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PatientDto[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void apiGet<SearchResult>(`/api/v1/front-desk/patients/search?q=${encodeURIComponent(term)}`).then((r) =>
        setItems(r.items ?? []),
      );
    }, 200);
    return () => window.clearTimeout(handle);
  }, [q, open]);

  const pick = (id: string) => {
    setOpen(false);
    setQ("");
    navigate(`/patients/${id}`);
  };

  return (
    <>
      <button
        type="button"
        className="hidden items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground hover:bg-muted md:flex"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5" />
        {t("frontDesk.searchPatients", "Find patient")}
        <kbd className="rounded border bg-background px-1 font-mono text-[10px]">⌘K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("frontDesk.globalSearchTitle", "Global patient search")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("frontDesk.globalSearchPh", "Phone, national ID, MRN, or name")}
          />
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {items.map((p) => {
              const label = resolvePatientListLabel({ patientId: p.id, patientMrn: p.mrn, patientName: `${p.firstNameEn} ${p.lastNameEn}` });
              return (
                <li key={p.id}>
                  <button type="button" className="w-full rounded-md px-2 py-2 text-start hover:bg-muted" onClick={() => pick(p.id)}>
                    <span className="font-medium">{label.text}</span>
                    <span className="ms-2 text-xs text-muted-foreground ltr-nums">{p.phone}</span>
                  </button>
                </li>
              );
            })}
            {q.trim().length >= 2 && items.length === 0 ? (
              <li className="px-2 py-4 text-muted-foreground">{t("frontDesk.noSearchResults", "No matches")}</li>
            ) : null}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
