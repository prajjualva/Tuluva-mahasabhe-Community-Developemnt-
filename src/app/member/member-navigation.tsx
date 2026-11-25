"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
const groups = [
  [
    "My account",
    [
      ["Dashboard", "/member"],
      ["Profile", "/member/profile"],
      ["Member ID card", "/member/id-card"],
      ["Membership documents", "/member/membership-documents"],
      ["Membership", "/member/membership"],
      ["Community Support Plan", "/member/community-support-plan"],
      ["Nominee", "/member/nominee"],
    ],
  ],
  [
    "Payments",
    [
      ["Dues", "/member/dues"],
      ["Payments & receipts", "/member/payments-receipts"],
      ["Wallet", "/member/wallet"],
      ["Cash remittances", "/member/cash-remittances"],
    ],
  ],
  [
    "Community",
    [
      ["Notifications", "/member/notifications"],
      ["Community news", "/member/community-news"],
      ["My Coordinator", "/member/coordinator"],
      ["Death Support Events", "/death-support-events"],
      ["Report a death", "/death-report"],
      ["Member guide", "/guide"],
    ],
  ],
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
        {open ? "Close" : "Menu"}
      </button>
      <nav id="member-navigation" aria-label="Member navigation" data-open={open}>
        {process.env.NODE_ENV !== "production" && <Link href="/demo">Stakeholder demo ↗</Link>}
        {groups.map(([group, links]) => (
          <div className="member-nav-group" role="group" aria-label={group} key={group}>
            <p>{group}</p>
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
          </div>
        ))}
      </nav>
    </>
  );
}
