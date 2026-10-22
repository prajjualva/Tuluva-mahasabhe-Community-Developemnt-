import { MemberNavigation } from "./member-navigation";
import { OrganizationBrand } from "../components/organization-brand";
import { SignOutButton } from "./sign-out-button";
export default function MemberLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="shell">
      <aside className="portal-sidebar">
        <OrganizationBrand onDark />
        <p className="portal-role">Member workspace</p>
        <MemberNavigation />
        <SignOutButton />
      </aside>
      <section className="workspace">
        <header className="workspace-topbar">
          <span>Here for our community</span>
          <span className="access-pill">Member access</span>
        </header>
        {children}
      </section>
    </div>
  );
}
