import { useEffect, useState } from "react";
import type { GuideVisualKind } from "@/features/guide/guide-types";
import { cn } from "@/lib/utils";

type Props = {
  kind: GuideVisualKind;
  activeStep: number;
  playing?: boolean;
  labelEn?: string;
  labelAr?: string;
};

export function GuideWizardAnimation({ kind, activeStep, playing, labelEn, labelAr }: Props) {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setPulse((p) => (p + 1) % 4), 900);
    return () => window.clearInterval(id);
  }, [playing]);

  const step = playing ? pulse : activeStep % 4;

  return (
    <div
      className={cn(
        "guide-wizard-shell relative overflow-hidden rounded-xl border border-border bg-gradient-to-b from-muted/80 to-background p-3 shadow-inner",
        playing && "guide-wizard-playing",
      )}
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.12),transparent_55%)]" />
      <Scene kind={kind} step={step} />
      {(labelEn || labelAr) && (
        <div className="mt-2 grid gap-1 border-t border-border/60 pt-2 text-[10px] leading-snug text-muted-foreground">
          {labelEn ? <p dir="ltr">{labelEn}</p> : null}
          {labelAr ? <p dir="rtl" className="text-end font-medium text-foreground/80">{labelAr}</p> : null}
        </div>
      )}
    </div>
  );
}

function Scene({ kind, step }: { kind: GuideVisualKind; step: number }) {
  switch (kind) {
    case "search":
      return <SearchScene step={step} />;
    case "board":
      return <BoardScene step={step} />;
    case "payment":
      return <PaymentScene step={step} />;
    case "clinical":
      return <ClinicalScene step={step} />;
    case "admin":
      return <AdminScene step={step} />;
    case "operations":
      return <OperationsScene step={step} />;
    case "reports":
      return <ReportsScene step={step} />;
    case "support":
      return <SupportScene step={step} />;
    case "dashboard":
      return <DashboardScene step={step} />;
    case "chart":
      return <ChartScene step={step} />;
    default:
      return <NavigateScene step={step} />;
  }
}

function MiniSidebar({ active }: { active: number }) {
  const items = ["Home", "Patients", "Visits", "Money"];
  return (
    <div className="flex h-full w-14 shrink-0 flex-col gap-1 border-e border-border/80 bg-card/90 p-1">
      {items.map((label, i) => (
        <div
          key={label}
          className={cn(
            "rounded px-1 py-1 text-[8px] font-medium transition-all duration-500",
            i === active ? "bg-primary text-primary-foreground scale-105 shadow" : "text-muted-foreground",
          )}
        >
          {label.slice(0, 4)}
        </div>
      ))}
    </div>
  );
}

function MockCursor({ step }: { step: number }) {
  const positions = [
    "top-[28%] start-[22%]",
    "top-[42%] start-[48%]",
    "top-[58%] start-[72%]",
    "top-[70%] start-[55%]",
  ];
  return (
    <span
      className={cn(
        "guide-wizard-cursor absolute z-20 size-3 rounded-full border-2 border-primary bg-primary/30 shadow-md transition-all duration-700",
        positions[step % positions.length],
      )}
    />
  );
}

function NavigateScene({ step }: { step: number }) {
  return (
    <div className="relative flex h-36 gap-0 rounded-lg bg-background/60">
      <MiniSidebar active={step % 4} />
      <div className="relative min-w-0 flex-1 p-3">
        <MockCursor step={step} />
        <div className="mb-2 h-2 w-24 rounded bg-muted" />
        <div
          className={cn(
            "rounded-md border border-dashed border-primary/40 p-2 transition-all duration-500",
            step >= 1 && "border-primary bg-primary/5",
          )}
        >
          <div className="h-2 w-3/4 rounded bg-muted" />
          <div className="mt-2 h-2 w-1/2 rounded bg-muted" />
        </div>
        <MotionBar step={step} className="mt-3" />
      </div>
    </div>
  );
}

function SearchScene({ step }: { step: number }) {
  return (
    <div className="relative h-36 rounded-lg bg-background/60 p-4">
      <MockCursor step={step} />
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm transition-all duration-500",
          step >= 0 && "ring-2 ring-primary/40",
        )}
      >
        <span className="text-[10px] text-muted-foreground">⌘K</span>
        <span className="guide-wizard-typing text-xs text-foreground">
          {["M", "MR", "MRN", "MRN-1"][step] ?? "…"}
        </span>
      </div>
      <ul className="mt-3 space-y-1">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className={cn(
              "rounded border border-border/60 px-2 py-1 text-[9px] transition-all duration-300",
              step === i + 1 && "border-primary bg-primary/10 font-semibold",
            )}
          >
            Patient row {i + 1}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BoardScene({ step }: { step: number }) {
  const cols = ["Waiting", "Room", "Done"];
  return (
    <div className="grid h-36 grid-cols-3 gap-2">
      {cols.map((col, ci) => (
        <div key={col} className="flex flex-col gap-1 rounded-lg border border-border/70 bg-card/80 p-1.5">
          <p className="text-[9px] font-semibold text-muted-foreground">{col}</p>
          {[0, 1].map((card) => (
            <div
              key={card}
              className={cn(
                "rounded border border-border bg-muted/50 px-1 py-2 text-[8px] transition-all duration-500",
                step % 3 === ci && card === 0 && "translate-x-1 border-primary bg-primary/10 shadow",
              )}
            >
              #{card + 1}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PaymentScene({ step }: { step: number }) {
  return (
    <div className="relative h-36 rounded-lg bg-background/60 p-3">
      <MockCursor step={step} />
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>Due</span>
        <span className={cn("font-bold text-foreground transition-all", step >= 2 && "text-[hsl(var(--success))]")}>
          {step >= 2 ? "0.00" : "250.00"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {["Cash", "Card"].map((m, i) => (
          <button
            key={m}
            type="button"
            className={cn(
              "rounded-md border py-2 text-[9px] font-medium transition-all duration-400",
              step >= 1 && i === 0
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>
      <MotionBar step={step} className="mt-3" label="Collect" />
    </div>
  );
}

function ClinicalScene({ step }: { step: number }) {
  const blocks = ["S", "O", "A", "P"];
  return (
    <div className="h-36 space-y-1 rounded-lg bg-background/60 p-2">
      {blocks.map((b, i) => (
        <div
          key={b}
          className={cn(
            "flex gap-2 rounded border border-border/60 px-2 py-1 transition-all duration-500",
            step >= i && "border-primary/50 bg-primary/5",
          )}
        >
          <span className="text-[9px] font-bold text-primary">{b}</span>
          <div className="h-2 flex-1 rounded bg-muted guide-wizard-grow" style={{ animationDelay: `${i * 200}ms` }} />
        </div>
      ))}
    </div>
  );
}

function AdminScene({ step }: { step: number }) {
  return (
    <div className="h-36 rounded-lg bg-background/60 p-2">
      <div className="mb-2 flex gap-1">
        {["Users", "RBAC", "Clinics"].map((t, i) => (
          <span
            key={t}
            className={cn(
              "rounded-full px-2 py-0.5 text-[8px] transition-all",
              step === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {t}
          </span>
        ))}
      </div>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className={cn(
            "mb-1 flex items-center justify-between rounded border border-border/60 px-2 py-1 text-[8px]",
            step === row + 1 && "border-primary bg-primary/5",
          )}
        >
          <span>User {row + 1}</span>
          <span className="rounded bg-muted px-1">Role</span>
        </div>
      ))}
    </div>
  );
}

function OperationsScene({ step }: { step: number }) {
  const stages = ["Booked", "Pre-op", "In OR", "Done"];
  return (
    <div className="h-36 rounded-lg bg-background/60 p-2">
      <div className="flex justify-between gap-1">
        {stages.map((s, i) => (
          <div key={s} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn(
                "size-6 rounded-full border-2 text-[7px] leading-6 text-center transition-all duration-500",
                step >= i ? "border-primary bg-primary/20 text-primary" : "border-muted text-muted-foreground",
              )}
            >
              {i + 1}
            </div>
            <span className="text-[7px] text-muted-foreground">{s}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded border border-dashed border-border p-2 text-[8px] text-muted-foreground">
        {step >= 2 ? "Down payment recorded" : "Fees optional at booking"}
      </div>
    </div>
  );
}

function ReportsScene({ step }: { step: number }) {
  return (
    <div className="flex h-36 items-end gap-1 rounded-lg bg-background/60 p-3 pt-8">
      {[40, 65, 35, 80, 55].map((h, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-t bg-primary/30 transition-all duration-500",
            step >= i && "bg-primary",
          )}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function SupportScene({ step }: { step: number }) {
  return (
    <div className="h-36 space-y-2 rounded-lg bg-background/60 p-2">
      <div className="rounded border border-border bg-card p-2 text-[8px]">
        Ticket #{(step + 1) * 104}
      </div>
      <div className="guide-wizard-chat space-y-1 ps-4">
        {[0, 1, 2].map((m) => (
          <div
            key={m}
            className={cn(
              "max-w-[85%] rounded-lg bg-muted px-2 py-1 text-[8px] transition-all",
              step >= m && "bg-primary/15",
              m % 2 === 1 && "ms-auto",
            )}
          >
            Message {m + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardScene({ step }: { step: number }) {
  const tiles = ["Appts", "Wait", "Revenue", "No-show"];
  return (
    <div className="grid h-36 grid-cols-2 gap-2 p-1">
      {tiles.map((t, i) => (
        <div
          key={t}
          className={cn(
            "rounded-lg border border-border bg-card p-2 transition-all duration-500",
            step === i && "scale-105 border-primary shadow-md",
          )}
        >
          <p className="text-[8px] text-muted-foreground">{t}</p>
          <p className="text-sm font-bold text-primary ltr-nums">{12 + i * 3}</p>
        </div>
      ))}
    </div>
  );
}

function ChartScene({ step }: { step: number }) {
  return (
    <div className="h-36 rounded-lg bg-background/60 p-2">
      <svg viewBox="0 0 200 80" className="h-full w-full text-primary">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="guide-wizard-line"
          points={step >= 2 ? "10,60 50,45 90,50 130,25 170,30" : "10,60 50,55 90,52 130,48 170,45"}
        />
      </svg>
    </div>
  );
}

function MotionBar({ step, className, label }: { step: number; className?: string; label?: string }) {
  return (
    <div className={cn("h-6 overflow-hidden rounded-md bg-muted", className)}>
      <div
        className="flex h-full items-center justify-center bg-primary text-[8px] font-semibold text-primary-foreground transition-all duration-700"
        style={{ width: `${Math.min(100, 25 + step * 25)}%` }}
      >
        {label ?? "Next"}
      </div>
    </div>
  );
}