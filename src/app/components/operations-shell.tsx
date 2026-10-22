"use client";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { SignOutButton } from "../member/sign-out-button";
import { OrganizationBrand } from "./organization-brand";
type Panel = { id: string; label: string; description: string; content: ReactNode };
export function OperationsShell({
  role,
  panels,
}: {
  role: "Admin" | "Coordinator";
  panels: Panel[];
}) {
  const [active, setActive] = useState(panels[0].id);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const update = () => {
      const id = window.location.hash.slice(1);
      if (panels.some((panel) => panel.id === id)) setActive(id);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [panels]);
  const selected = panels.find((panel) => panel.id === active) ?? panels[0];
  return (
    <div className="shell operations-shell">
      <aside className="portal-sidebar">
        <OrganizationBrand onDark />
        <p className="portal-role">{role} workspace</p>
        <button
          className="mobile-nav-toggle"
          aria-controls="operations-navigation"
          aria-expanded={menu}
          onClick={() => setMenu((value) => !value)}
        >
          {menu ? "Close menu" : "Open menu"}
        </button>
        <nav id="operations-navigation" aria-label={`${role} navigation`} data-open={menu}>
          {panels.map((panel) => (
            <a
              key={panel.id}
              href={`#${panel.id}`}
              aria-current={active === panel.id ? "page" : undefined}
              onClick={() => {
                setActive(panel.id);
                setMenu(false);
              }}
            >
              {panel.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          {role === "Coordinator" && <Link href="/member">My member portal</Link>}
          <Link href="/death-support-events">Public support events</Link>
          <SignOutButton />
        </div>
      </aside>
      <section className="workspace">
        <header className="workspace-topbar">
          <span>TuluWorld Foundation · Community Support</span>
          <span className="access-pill">{role} access</span>
        </header>
        <main id={selected.id}>
          <p className="eyebrow">
            {role === "Admin" ? "FOUNDATION COMMAND CENTER" : "COMMUNITY COORDINATION"}
          </p>
          <h1>{selected.label}</h1>
          <p className="page-description">{selected.description}</p>
          <div className="workspace-panel" key={selected.id}>
            {selected.content}
          </div>
          <footer className="workspace-footer">
            Private workspace · Sensitive and financial actions are authorized and audited.
          </footer>
        </main>
      </section>
    </div>
  );
}
