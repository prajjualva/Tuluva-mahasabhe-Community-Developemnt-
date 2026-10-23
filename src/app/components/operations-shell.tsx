"use client";
import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
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
  const heading = useRef<HTMLHeadingElement>(null);
  const previousPanel = useRef(active);
  useEffect(() => {
    if (previousPanel.current !== active) heading.current?.focus();
    previousPanel.current = active;
  }, [active]);
  useEffect(() => {
    const update = () => {
      const id = window.location.hash.slice(1);
      setActive(panels.some((panel) => panel.id === id) ? id : panels[0].id);
    };
    update();
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, [panels]);
  const selected = panels.find((panel) => panel.id === active) ?? panels[0];
  return (
    <div className="shell operations-shell">
      <aside className="portal-sidebar">
        <OrganizationBrand />
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
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                if (window.location.hash !== `#${panel.id}`)
                  window.history.pushState(null, "", `#${panel.id}`);
                setActive(panel.id);
                setMenu(false);
                heading.current?.focus();
              }}
            >
              {panel.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Link href="/guide">Platform guide</Link>
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
        <main id={selected.id} aria-labelledby="operations-heading">
          <p className="eyebrow">
            {role === "Admin" ? "FOUNDATION COMMAND CENTER" : "COMMUNITY COORDINATION"}
          </p>
          <h1 id="operations-heading" ref={heading} tabIndex={-1}>
            {selected.label}
          </h1>
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
