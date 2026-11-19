import { MemberNavigation } from "./member-navigation";
import { OrganizationBrand } from "../components/organization-brand";
import { SignOutButton } from "./sign-out-button";
export default function MemberLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="shell member-shell">
      <aside className="portal-sidebar">
        <OrganizationBrand href="/member" />
        <MemberNavigation />
        <SignOutButton />
      </aside>
      <section className="workspace">{children}</section>
    </div>
  );
}
