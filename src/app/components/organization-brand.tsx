import Image from "next/image";
import Link from "next/link";

/** Original Tuluworld wordmark, not a recreated or AI-generated logo. */
export function OrganizationBrand({ onDark = false }: { onDark?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand-lockup organization-brand${onDark ? " on-dark" : ""}`}
      aria-label="TuluWorld Foundation home"
    >
      <span className="organization-logo-frame">
        <Image
          src="/brand/tuluworld-logo-dark.png"
          width={1684}
          height={621}
          sizes="200px"
          alt="Tuluworld"
          className="organization-logo"
          priority
        />
      </span>
      <span className="organization-caption">COMMUNITY SUPPORT PLAN</span>
    </Link>
  );
}
