/** Check mark whose stroke draws in when an ancestor has data-just-done / data-success (see setup.css). */
export function SetupCheck({ className, animate }: { className?: string; animate?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`kx-setup-check ${className ?? ""}`} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={animate ? { animation: "kx-setup-check .6s cubic-bezier(.22,1,.36,1) both" } : undefined}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
