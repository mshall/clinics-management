import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { KiorexLogo } from "../brand/components";
import { DOC_LINKS } from "../lib/navigation";

type ThemePref = "light" | "dark" | "system";
const readPref = (): ThemePref => { try { const v = localStorage.getItem("kx-theme"); return v === "dark" || v === "system" ? v : "light"; } catch { return "light"; } };

/** Light / Dark / System. Light is the default; an explicit choice is stored per origin (`kx-theme`) and restored before first paint (index.html). */
function ThemeControl() {
  const [pref, setPref] = useState<ThemePref>(readPref);
  return (
    <label className="theme-control">
      <span>Theme</span>
      <select
        value={pref}
        aria-label="Theme"
        onChange={(e) => {
          const next = e.target.value as ThemePref;
          setPref(next);
          document.documentElement.dataset.theme = next === "system" ? "auto" : next;
          try { localStorage.setItem("kx-theme", next); } catch { /* storage blocked: the choice applies for this visit only */ }
        }}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}

export function Layout() {
  const kiorly = DOC_LINKS.filter((l) => l.group === "kiorly");
  const reference = DOC_LINKS.filter((l) => l.group === "reference");

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <KiorexLogo variant="lockup" product="kiorly" height={40} className="logo-light" />
          <KiorexLogo variant="lockup" product="kiorly" tone="inverse" height={40} className="logo-dark" />
        </div>
        <h1 className="sr-only" style={{ position: "absolute", left: "-9999px" }}>Kiorly Clinics</h1>
        <p className="subtitle">Documentation portal</p>
        <ThemeControl />

        <nav className="nav-section">
          <h2>Project docs</h2>
          <ul>
            {kiorly.map((link) => (
              <li key={link.id}>
                <NavLink to={link.path} className={({ isActive }) => (isActive ? "active" : undefined)}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="nav-section">
          <h2>Reference (PiggyMetrics)</h2>
          <ul>
            {reference.map((link) => (
              <li key={link.id}>
                <NavLink to={link.path} className={({ isActive }) => (isActive ? "active" : undefined)}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
