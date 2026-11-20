import { useEffect } from "react";

let seq = 0;

/**
 * Safety net for legacy forms: a `<Label>` without `htmlFor` that sits next to exactly one unlabeled form control gets wired to it
 * (id + for), and decorative Recharts shapes that carry role="img" without a name are hidden from assistive tech.
 * Idempotent; runs once per animation frame after DOM changes.
 */
export function applyA11yAutoFixes(root: ParentNode = document): void {
  root.querySelectorAll<HTMLLabelElement>("label:not([for])").forEach((label) => {
    if (label.querySelector("input,select,textarea")) return;
    const scope = label.parentElement;
    if (!scope) return;
    const controls = Array.from(scope.querySelectorAll<HTMLElement>("input:not([type=hidden]), select, textarea")).filter(
      (c) => !c.hasAttribute("aria-label") && !c.hasAttribute("aria-labelledby") && !c.closest("label") && (!c.id || !document.querySelector(`label[for="${CSS.escape(c.id)}"]`)),
    );
    if (controls.length === 0) return;
    if (controls.length === 1) {
      const control = controls[0]!;
      if (!control.id) control.id = `kx-af-${++seq}`;
      label.htmlFor = control.id;
      return;
    }
    // Several controls under one label (e.g. a date + time pair in the next sibling): all share the label as their accessible name.
    const next = label.nextElementSibling;
    if (controls.length > 3 || !next || !controls.every((c) => next.contains(c))) return;
    if (!label.id) label.id = `kx-afl-${++seq}`;
    controls.forEach((c) => c.setAttribute("aria-labelledby", label.id));
  });
  root.querySelectorAll<SVGElement>('.recharts-wrapper [role="img"]:not([aria-label]):not([aria-labelledby])').forEach((el) => el.setAttribute("aria-hidden", "true"));
}

export function useA11yAutoFixes(): void {
  useEffect(() => {
    let raf = 0;
    const run = () => { raf = 0; applyA11yAutoFixes(); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(run); };
    schedule();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
}
