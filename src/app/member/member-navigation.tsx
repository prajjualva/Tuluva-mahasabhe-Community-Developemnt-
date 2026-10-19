"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
const links = [
  ["Dashboard", "/member"],
  ["Profile", "/member/profile"],
  ["Membership", "/member/membership"],
  ["Community Support Plan", "/member/community-support-plan"],
  ["Nominee", "/member/nominee"],
  ["Dues", "/member/dues"],
  ["Payments & Receipts", "/member/payments-receipts"],
  ["Wallet", "/member/wallet"],
  ["Notifications", "/member/notifications"],
  ["Community News", "/member/community-news"],
  ["Coordinator", "/member/coordinator"],
  ["Death Support Events", "/death-support-events"],
  ["Report a death", "/death-report"],
  ["My cash remittances", "/member/cash-remittances"],
] as const;
export function MemberNavigation() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="mobile-nav-toggle"
        aria-controls="member-navigation"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close menu" : "Open menu"}
      </button>
      <nav id="member-navigation" aria-label="Member navigation" data-open={open}>
        {links.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
