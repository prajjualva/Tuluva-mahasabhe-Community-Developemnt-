import Link from "next/link";
const navigation = [
  "Dashboard",
  "Profile",
  "Membership",
  "Community Support Plan",
  "Nominee",
  "Dues",
  "Payments & Receipts",
  "Wallet",
  "Notifications",
  "Coordinator",
];
export default function MemberLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="shell">
      <aside>
        <h1>Community Support</h1>
        <p>Member portal</p>
        <nav>
          {navigation.map((item) => (
            <Link
              key={item}
              href={
                item === "Dashboard"
                  ? "/member"
                  : `/member/${item.toLowerCase().replaceAll(" ", "-").replace("&-", "")}`
              }
            >
              {item}
            </Link>
          ))}
        </nav>
      </aside>
      <section>{children}</section>
    </div>
  );
}
