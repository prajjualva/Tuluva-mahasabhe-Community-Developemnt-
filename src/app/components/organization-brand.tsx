import Image from "next/image";
import Link from "next/link";
import { applicationBrand } from "../../content/organization";

/** Original Foundation artwork supplied by the organization. */
export function OrganizationBrand({
  onDark = false,
  href = "/",
}: {
  onDark?: boolean;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={`brand-lockup organization-brand${onDark ? " on-dark" : ""}`}
      aria-label={href === "/" ? "Tuluva Mahasabhe home" : "Tuluva Mahasabhe dashboard"}
    >
      <span className="organization-logo-frame">
        <Image
          src={applicationBrand.logo}
          width={1536}
          height={1536}
          sizes="56px"
          alt=""
          className="organization-logo"
          priority
        />
      </span>
      <span className="organization-brand-copy">
        <strong>{applicationBrand.name}</strong>
        <span className="organization-caption">{applicationBrand.description}</span>
      </span>
    </Link>
  );
}
