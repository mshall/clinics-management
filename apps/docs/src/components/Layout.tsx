import { NavLink, Outlet } from "react-router-dom";
import { DOC_LINKS } from "../lib/navigation";

export function Layout() {
  const kiorly = DOC_LINKS.filter((l) => l.group === "kiorly");
  const reference = DOC_LINKS.filter((l) => l.group === "reference");

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Kiorly Clinics</h1>
        <p className="subtitle">Documentation portal</p>

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
