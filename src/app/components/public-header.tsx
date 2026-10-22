import Link from "next/link";
import { OrganizationBrand } from "./organization-brand";
export function PublicHeader() {
  return (
    <header className="public-header">
      <OrganizationBrand />
      <div className="public-links">
        <Link href="/about">About Tuluworld</Link>
        {process.env.NODE_ENV !== "production" && <Link href="/demo">Explore demo</Link>}
        <Link href="/death-support-events">Support events</Link>
        <Link href="/login">
          Member sign in <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </header>
  );
}
