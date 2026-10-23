export const guideAudiences = ["Everyone", "Member", "Coordinator", "Admin"] as const;
export type GuideAudience = (typeof guideAudiences)[number];
export type GuideEntry = {
  id: string;
  audience: GuideAudience;
  topic: string;
  title: string;
  summary: string;
  steps: string[];
  note?: string;
  href: string;
  action: string;
};

// Educational navigation only. Amounts, eligibility and transitions remain server-authoritative.
export const platformGuide: GuideEntry[] = [
  {
    id: "getting-started",
    audience: "Everyone",
    topic: "Start here",
    title: "What is this platform?",
    summary:
      "A Community Support Foundation workspace connecting members, Coordinators and Foundation Admins.",
    steps: [
      "Read about TuluWorld Foundation and the Community Support Plan.",
      "Create a member account or sign in to your existing account.",
      "Use your private workspace to manage records, dues and support requests.",
    ],
    note: "This is community support, not insurance. Registration or payment alone does not guarantee a support payment.",
    href: "/about",
    action: "About the Foundation",
  },
  {
    id: "registration",
    audience: "Member",
    topic: "Start here",
    title: "Create an account and sign in",
    summary: "Your account gives you access to your own member records.",
    steps: [
      "Open registration and enter the requested identity, contact and membership details.",
      "Use a Coordinator referral code if you have one; the Foundation manages assignments.",
      "Sign in with your registered email and password. Member, Coordinator and Admin accounts share the same secure sign-in page.",
      "If you cannot sign in, expand the verification-code or password-reset section on the sign-in page.",
    ],
    note: "Your workspace is determined by your assigned permissions. Signing in does not give access to other members' private information.",
    href: "/register",
    action: "Create an account",
  },
  {
    id: "dashboard",
    audience: "Member",
    topic: "Your account",
    title: "Dashboard: where should I begin?",
    summary: "An overview of your membership and shortcuts to everyday tasks.",
    steps: [
      "Check your membership status and any outstanding actions.",
      "Open Membership for annual renewal or reactivation, and Community Support Plan for plan registration and review status.",
      "Open Dues to see unpaid obligations. Use Payments & Receipts to check what actually settled.",
      "Loading or unavailable records are not a zero balance. Retry the relevant screen before making a decision.",
    ],
    href: "/member",
    action: "Open my dashboard",
  },
  {
    id: "profile",
    audience: "Member",
    topic: "Your account",
    title: "Profile and contact verification",
    summary: "Maintain your name, address and verified contact details.",
    steps: [
      "Open Profile to review your member reference, Coordinator and contact verification state.",
      "Edit the profile fields provided, then select Save profile.",
      "Use the contact-verification controls to verify or change your email or mobile number.",
      "Enter a verification code only in the verification form. Never share codes or passwords with another person.",
    ],
    href: "/member/profile",
    action: "Manage my profile",
  },
  {
    id: "membership",
    audience: "Member",
    topic: "Membership & plan",
    title: "Membership, renewal and status",
    summary:
      "Your annual Foundation membership is separate from Community Support Plan registration.",
    steps: [
      "Open Membership to see the current annual charge, billing dates and status returned by the Foundation.",
      "Pay an eligible renewal using an available payment method.",
      "If your membership is inactive, review all outstanding dues and the current membership charge before requesting reactivation.",
      "A closed membership requires an Admin reopening decision; it cannot be reopened simply by paying an old due.",
    ],
    note: "Paying one contribution while inactive does not automatically reactivate membership.",
    href: "/member/membership",
    action: "Check membership",
  },
  {
    id: "plan",
    audience: "Member",
    topic: "Membership & plan",
    title: "Community Support Plan: registration and approvals",
    summary: "Follow the plan record through payment, Coordinator review and final Admin review.",
    steps: [
      "Open Community Support Plan and review the registration requirements, charge and payment deadline shown for your record.",
      "A PAYMENT_PENDING record is awaiting its required payment; starting checkout is not the same as successful settlement.",
      "After successful registration payment, the application moves through Coordinator review and final Admin approval.",
      "Review the persisted waiting-period dates on your plan. Payment alone does not bypass review or the waiting period.",
      "If a deadline extension is needed, contact the Foundation. An Admin must record a reason; members cannot extend their own deadline.",
    ],
    note: "Normal reactivation does not require a second plan-registration payment or restart the initial waiting period. Reopening a CLOSED membership is different: new applicable fees and a new waiting period are required. Coordinator fee exemptions do not waive event contributions.",
    href: "/member/community-support-plan",
    action: "View my plan",
  },
  {
    id: "nominee",
    audience: "Member",
    topic: "Your account",
    title: "Nominee: who receives support on behalf of a family?",
    summary: "Submit and maintain nominee information and the requested evidence.",
    steps: [
      "Open Nominee to review the current nominee and verification state.",
      "Enter the required relationship and identity details, then provide the requested documents through the protected upload controls.",
      "Wait for the authorized verification decision and respond to evidence requests.",
      "Tell the Foundation when nominee details need to change; an uploaded document is not itself approval.",
    ],
    note: "Support-case bank details require a fresh authorized review. Registration-time verification is not payout authorization.",
    href: "/member/nominee",
    action: "Manage nominee",
  },
  {
    id: "contributions",
    audience: "Member",
    topic: "Payments & wallet",
    title: "Dues: why was a contribution created?",
    summary:
      "An event contribution is based on whether you were already a member when the event was created.",
    steps: [
      "Open Dues to see outstanding membership, plan or event obligations.",
      "Both ACTIVE and INACTIVE members can receive a contribution due for a newly approved event if they existed as members at event creation.",
      "Members joining after an event was created do not receive a historical contribution for that event.",
      "Contribution generation and entitlement to family support are separate decisions; support eligibility uses the actual date of death and the applicable history.",
    ],
    note: "Inactive status does not erase an outstanding contribution. Reprocessing an event must not create a duplicate due.",
    href: "/member/dues",
    action: "Review my dues",
  },
  {
    id: "pay-dues",
    audience: "Member",
    topic: "Payments & wallet",
    title: "Pay contributions: oldest-first or a specific event",
    summary:
      "Choose the contribution-payment option that matches the obligation you want to settle.",
    steps: [
      "Review the outstanding dues and choose Pay oldest or the payment controls beside a specific event.",
      "FIFO payments settle eligible contributions in oldest-first order. A specific-event payment targets the selected event instead.",
      "Review the server-returned amount and method before continuing. The Foundation applies wallet-first rules where supported.",
      "Wait for confirmation, then check Payments & Receipts. A pending online checkout is not a paid receipt.",
    ],
    note: "If the result is uncertain, check the existing payment before retrying. Payment-facing commands use duplicate protection; opening another checkout is not proof that the first one failed.",
    href: "/member/dues",
    action: "Open contribution payments",
  },
  {
    id: "wallet",
    audience: "Member",
    topic: "Payments & wallet",
    title: "Foundation Wallet: balance, movements and wallet-first payments",
    summary: "The wallet records Foundation credits and debits against your member account.",
    steps: [
      "Open Wallet to view the confirmed balance and transaction history.",
      "Use an available wallet payment option for an eligible due. The server checks the balance and records the debit transactionally.",
      "Wallet-first payments use available wallet funds before asking for an online balance where that workflow supports it.",
      "Plan registration supports a wallet-plus-online split when the wallet does not cover the full charge. The remaining online amount must settle before the payment is complete.",
      "If a balance looks wrong, contact the Foundation with the transaction reference rather than paying again.",
    ],
    note: "A wallet balance is not a bank payout account. Credits and settled movements require authorized, audited actions.",
    href: "/member/wallet",
    action: "View wallet",
  },
  {
    id: "receipts",
    audience: "Member",
    topic: "Payments & wallet",
    title: "Payments & Receipts: did my payment succeed?",
    summary: "Track the recorded payment state and open an official receipt for settled payments.",
    steps: [
      "Open Payments & Receipts and locate your payment by its reference, purpose, amount and date.",
      "Succeeded means the recorded payment settled. Pending means confirmation is outstanding; failed or cancelled does not mean paid.",
      "Open the official numbered receipt when it is available.",
      "If captured money cannot be applied to an obligation, the Foundation records it for Admin review rather than reviving an expired entitlement.",
      "For missing confirmation, give the Foundation the payment reference. Never send card details, passwords or verification codes.",
    ],
    href: "/member/payments-receipts",
    action: "View payments and receipts",
  },
  {
    id: "cash",
    audience: "Member",
    topic: "Payments & wallet",
    title: "Paying through a Coordinator or reporting a cash remittance",
    summary:
      "Cash is verified through the Foundation workflow; a promise to pay is not settlement.",
    steps: [
      "Check your assigned Coordinator and ask which cash-collection option is authorized for the relevant due.",
      "Provide the collection or deposit evidence requested in your workflow.",
      "Use My cash remittances to track a remittance you are responsible for, where applicable.",
      "Wait for the authorized verification and receipt. Do not treat an unverified submission as a completed payment.",
    ],
    note: "Discrepancies are reconciled against evidence and actual funds received. They are not erased by rejecting a collection.",
    href: "/member/cash-remittances",
    action: "View my cash remittances",
  },
  {
    id: "news",
    audience: "Member",
    topic: "Community",
    title: "Notifications and Community News",
    summary: "Notifications show your updates; Community News contains the published articles.",
    steps: [
      "Open Notifications and expand an item to read its contents. Opening an unread item also marks it as read; Mark all as read updates the whole inbox.",
      "Open Community News for published Foundation articles and comments.",
      "Use Show comments to read an article's discussion. Submit a respectful comment only when you intend to publish it.",
      "An empty result means no items were returned. An unavailable message means the request failed and should be retried.",
    ],
    href: "/member/notifications",
    action: "Read notifications",
  },
  {
    id: "events",
    audience: "Everyone",
    topic: "Support requests",
    title: "Death Support Events and remembrance pages",
    summary: "Read the verified information the Foundation has approved for publication.",
    steps: [
      "Open Support events to see officially published events.",
      "Open the event's remembrance page for the approved description and public information.",
      "Sign in to review your own contribution obligation and payment options.",
      "Public event visibility is not permission to see private evidence, family bank details or internal review notes.",
    ],
    href: "/death-support-events",
    action: "View support events",
  },
  {
    id: "report",
    audience: "Everyone",
    topic: "Support requests",
    title: "Report a death and understand the support review",
    summary:
      "Anyone can submit a report; authorized reviewers verify it before publication and support approval.",
    steps: [
      "Use Report a death and provide the requested member, incident and contact details accurately.",
      "Keep the acknowledgement or report reference and provide further evidence when requested.",
      "The Foundation reviews the report, actual date of death, membership and plan history, nominee and required documents.",
      "Support payment review includes a fresh bank review and authorized decisions. Submitting a report does not guarantee approval or immediate payment.",
    ],
    href: "/death-report",
    action: "Submit a death report",
  },
  {
    id: "coordinator-contact",
    audience: "Member",
    topic: "Your account",
    title: "Coordinator: who helps with my membership?",
    summary: "Your assigned Coordinator helps with Foundation processes and required follow-up.",
    steps: [
      "Open Coordinator to see your current assignment and the available contact information.",
      "Ask for help with evidence requests, plan review or an authorized collection.",
      "For a disputed assignment, suspended Coordinator or an Admin-only decision, contact the Foundation.",
      "Do not share your password or verification codes. A Coordinator acts through their own authorized workspace.",
    ],
    href: "/member/coordinator",
    action: "Find my Coordinator",
  },
  {
    id: "coordinator-work",
    audience: "Coordinator",
    topic: "Staff workspaces",
    title: "Coordinator workspace: what does each queue do?",
    summary:
      "Work on assigned members and authorized queues without accessing unrelated private records.",
    steps: [
      "Use your Coordinator workspace to review assigned-member requests and pending evidence.",
      "Plan approvals record the Coordinator-stage review; final Admin approval is separate.",
      "Nominee and death-report queues collect and review the evidence allowed by your permissions.",
      "Collection and remittance screens record cash received, evidence and settlement progress. They do not replace Admin reconciliation.",
      "Use your permanent referral code for referrals. Suspension disables Coordinator permissions immediately; the code does not override suspension.",
    ],
    note: "Your own outstanding cash remittance remains recoverable even if your Coordinator permissions are suspended.",
    href: "/coordinator",
    action: "Open Coordinator workspace",
  },
  {
    id: "admin-members",
    audience: "Admin",
    topic: "Staff workspaces",
    title: "Admin: members, Coordinators and account access",
    summary: "Manage identities, relationships and lifecycle decisions with recorded reasons.",
    steps: [
      "Overview summarizes activity and links to operational queues.",
      "Members searches profiles and their histories, assignments, dues, plans and payments. Opening a profile is not permission to alter settled financial records.",
      "Coordinators manages appointments, assignments, suspension and restoration.",
      "Account access manages authorized role assignments, including Admin identities without a member profile.",
      "Reopening a closed membership requires the prescribed lifecycle workflow, recorded identity, timestamp and reason; history is preserved.",
    ],
    href: "/admin#members",
    action: "Open member administration",
  },
  {
    id: "admin-finance",
    audience: "Admin",
    topic: "Staff workspaces",
    title: "Admin: approvals, payments, wallet and reconciliation",
    summary: "Financial decisions use protected server workflows, not editable dashboard totals.",
    steps: [
      "Plan approvals handles final review and authorized deadline extensions. Extensions require a reason and are audited.",
      "Payments & refunds handles received payments, unapplied funds and refund review. A refund must follow the provider and ledger workflow.",
      "Foundation Wallet issues authorized credits with a reason and duplicate protection.",
      "Cash reconciliation compares collection evidence with actual funds received and resolves discrepancies.",
      "Due waivers handles waiver decisions; Foundation Ledger and Audit trail provide financial and action history. Settled records are corrected through compensating entries, not deletion.",
    ],
    href: "/admin#payments",
    action: "Open financial administration",
  },
  {
    id: "admin-support",
    audience: "Admin",
    topic: "Staff workspaces",
    title: "Admin: support cases, nominees and published news",
    summary:
      "Separate evidence review, eligibility decisions, publication and support-payment authorization.",
    steps: [
      "Death Support Events handles report review and publication of approved public information.",
      "Nominee verification reviews the restricted identity evidence for the relevant nominee.",
      "Support payments checks actual-date-of-death eligibility, documents and fresh case-specific bank review before authorization.",
      "Community News handles publication approvals and moderation. Never publish private bank data, restricted documents or internal notes.",
      "Use Audit trail to trace sensitive decisions to the acting identity and time.",
    ],
    href: "/admin#support",
    action: "Open support administration",
  },
  {
    id: "privacy",
    audience: "Everyone",
    topic: "Safety & help",
    title: "Privacy, safe use and unavailable services",
    summary:
      "Know what is private and what to do when a screen or service cannot complete an action.",
    steps: [
      "Use your own account and sign out on shared devices. Access is checked on the server, even if you know a page address.",
      "Private documents and bank information are available only through explicitly authorized workflows.",
      "Retry a failed read using the screen's retry control. Do not infer a zero balance or an approval from missing data.",
      "For an uncertain payment, check payment history before starting another request and retain its reference.",
      "A service that has not been configured cannot send real verification messages or process real online payments. Contact the Foundation if an essential action is unavailable.",
    ],
    note: "This guide explains navigation; your current charges, deadlines and eligibility are determined by the Foundation's applicable settings and authorized records.",
    href: "/login",
    action: "Sign in securely",
  },
];

export function filterGuide(query: string, audience: GuideAudience) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return platformGuide.filter((entry) => {
    if (audience !== "Everyone" && entry.audience !== audience && entry.audience !== "Everyone")
      return false;
    const text = [entry.title, entry.topic, entry.summary, ...entry.steps, entry.note ?? ""]
      .join(" ")
      .toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}
