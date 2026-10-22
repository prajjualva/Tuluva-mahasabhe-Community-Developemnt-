import { z } from "zod";

// A separate, browser-local presentation simulator. No database or payment-provider imports.
export const DEMO_STORAGE_KEY = "csf:stakeholder-demo:v1";
export const DEMO_SESSION_KEY = "csf:stakeholder-role:v1";
export const demoRoles = ["MEMBER", "COORDINATOR", "ADMIN"] as const;
export type DemoRole = (typeof demoRoles)[number];
export const demoNavigation: Record<DemoRole, readonly (readonly [string, string])[]> = {
  MEMBER: [
    ["dashboard", "Dashboard"],
    ["events", "Support events"],
    ["payments", "Payments"],
    ["wallet", "Wallet"],
    ["receipts", "Receipts"],
    ["news", "Community news"],
    ["notifications", "Notifications"],
    ["membership", "My membership"],
    ["plan", "Support plan"],
  ],
  COORDINATOR: [
    ["coordinator", "Coordinator dashboard"],
    ["members", "Assigned members"],
    ["approvals", "Plan reviews"],
    ["events", "Support events"],
    ["referrals", "Referrals"],
    ["news", "Community news"],
  ],
  ADMIN: [
    ["admin", "Admin dashboard"],
    ["members", "Member directory"],
    ["approvals", "Plan approvals"],
    ["adminpayments", "Payments"],
    ["receipts", "Member receipts"],
    ["events", "Support events"],
    ["news", "Community news"],
  ],
};
export function demoSectionForRole(role: DemoRole, target: string) {
  return demoNavigation[role].some(([id]) => id === target) ? target : demoNavigation[role][0][0];
}
const money = z.number().int().nonnegative().max(100_000_000);
const dueSchema = z.object({
  id: z.string(),
  title: z.string(),
  amountPaise: money,
  status: z.enum(["PENDING", "PAID"]),
  eventId: z.string().nullable(),
  kind: z.enum(["CONTRIBUTION", "MEMBERSHIP", "PLAN"]),
});
const paymentSchema = z.object({
  id: z.string(),
  dueId: z.string().nullable(),
  title: z.string(),
  amountPaise: money,
  walletPaise: money,
  onlinePaise: money,
  method: z.string(),
  createdAt: z.string(),
  status: z.enum(["SUCCEEDED", "FAILED"]),
  receiptNumber: z.string().nullable(),
});
export const demoStateSchema = z.object({
  version: z.literal(1),
  walletPaise: money,
  dues: z.array(dueSchema).max(100),
  payments: z.array(paymentSchema).max(200),
  movements: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        amountPaise: z.number().int(),
        createdAt: z.string(),
      }),
    )
    .max(200),
  notices: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        body: z.string(),
        read: z.boolean(),
        target: z.string(),
      }),
    )
    .max(300),
  referrals: z.array(z.object({ id: z.string(), name: z.string(), area: z.string() })).max(100),
  comments: z.array(z.object({ id: z.string(), target: z.string(), body: z.string() })).max(200),
  planStage: z.enum(["COORDINATOR_REVIEW", "ADMIN_REVIEW", "PAYMENT_PENDING", "WAITING_PERIOD"]),
});
export type DemoState = z.infer<typeof demoStateSchema>;
export const demoEvents = [
  {
    id: "raghav",
    name: "Raghav Shetty",
    place: "Mangaluru",
    date: "12 October 2026",
    image: "/demo/fictional-member.png",
    initials: "RS",
    story:
      "Remembering a devoted father, neighbour and long-standing member of our community. Together, we stand beside his family with care and dignity.",
  },
  {
    id: "leela",
    name: "Leela Poojary",
    place: "Udupi",
    date: "15 October 2026",
    image: "/demo/fictional-member-woman.png",
    initials: "LP",
    story:
      "A beloved teacher whose kindness touched many families. Our community joins together in remembrance and support for her loved ones.",
  },
  {
    id: "suresh",
    name: "Suresh Rai",
    place: "Bantwal",
    date: "17 October 2026",
    image: "/demo/fictional-member-suresh.png",
    initials: "SR",
    story:
      "Honouring a generous community volunteer and a cherished friend. Every contribution is a small act of solidarity for the family he leaves behind.",
  },
] as const;
export const demoNews = [
  {
    id: "health",
    category: "COMMUNITY WELLBEING",
    date: "19 October 2026",
    title: "Free health check-up camp this Sunday",
    intro: "A morning of care for our members and their families in Mangaluru.",
    body: "Join us at the community hall in Mangaluru on Sunday, 25 October, from 9:00 am to 1:00 pm. The programme includes blood pressure and blood sugar screening, general consultations and a short session on preventive health. Members may bring their parents and children. Please carry your membership number and any current prescriptions. Contact your Coordinator to reserve a convenient time slot.",
  },
  {
    id: "gathering",
    category: "FOUNDATION UPDATE",
    date: "18 October 2026",
    title: "Growing together: our monthly community gathering",
    intro: "Meet your local Coordinators, welcome new members and share your ideas.",
    body: "Our next community gathering will take place on 31 October at 4:00 pm at the Udupi community centre. We will introduce newly appointed Coordinators, explain the membership and Community Support Plan, and answer questions about contribution dues and receipts. Families are welcome. Tea and refreshments will follow the meeting. Bring your ideas for local volunteering and member support.",
  },
  {
    id: "volunteers",
    category: "GET INVOLVED",
    date: "16 October 2026",
    title: "Volunteer with your neighbourhood team",
    intro: "Help older members access the portal and stay connected to their community.",
    body: "We are forming neighbourhood volunteer teams in Mangaluru, Udupi and Bantwal. Volunteers will help members find their Coordinator, understand payment receipts and read Foundation announcements. No technical experience is required. A short orientation will cover privacy, respectful communication and when to refer a question to the Foundation team. Speak to your Coordinator if you would like to take part.",
  },
] as const;

export function initialDemoState(): DemoState {
  return {
    version: 1,
    walletPaise: 25_000,
    dues: demoEvents.map((event) => ({
      id: `due-${event.id}`,
      title: `Contribution · ${event.name}`,
      amountPaise: 10_000,
      status: "PENDING",
      eventId: event.id,
      kind: "CONTRIBUTION",
    })),
    payments: [],
    movements: [
      {
        id: "opening",
        title: "Opening wallet balance",
        amountPaise: 25_000,
        createdAt: "2026-10-19T04:00:00.000Z",
      },
    ],
    notices: [
      {
        id: "welcome",
        title: "Welcome, Ananya",
        body: "Your membership is active. You are connected to Coordinator Prakash Alva in Mangaluru. Open your dashboard to see your membership, wallet and latest community updates.",
        read: false,
        target: "dashboard",
      },
      {
        id: "news-health",
        title: "Free health check-up camp this Sunday",
        body: demoNews[0].body,
        read: false,
        target: "news",
      },
      {
        id: "events",
        title: "Three contribution dues are ready",
        body: "Your ₹100 contribution dues for Raghav Shetty, Leela Poojary and Suresh Rai are available. You can pay the oldest due first or choose a specific event. Receipts will be available immediately after a successful simulated payment.",
        read: false,
        target: "payments",
      },
    ],
    referrals: [
      { id: "ref-1", name: "Kavya Shetty", area: "Mangaluru" },
      { id: "ref-2", name: "Arun Poojary", area: "Udupi" },
    ],
    comments: [],
    planStage: "COORDINATOR_REVIEW",
  };
}

type Action =
  | {
      type: "PAY_ALL";
      dueIds: string[];
      method: "ONLINE" | "WALLET_FIRST";
      success: boolean;
      id: string;
      now: string;
    }
  | {
      type: "PAY";
      dueId: string;
      method: "ONLINE" | "WALLET_FIRST";
      success: boolean;
      id: string;
      now: string;
    }
  | { type: "TOP_UP"; amountPaise: number; id: string; now: string }
  | { type: "READ"; id: string }
  | { type: "REFER"; name: string; area: string; id: string }
  | { type: "COMMENT"; target: string; body: string; id: string }
  | { type: "APPROVE_PLAN" }
  | { type: "RENEW_MEMBERSHIP" };

export function demoReducer(state: DemoState, action: Action): DemoState {
  if (action.type === "PAY_ALL") {
    if (
      state.payments.some(
        (payment) => payment.id === action.id || payment.id.startsWith(`${action.id}:`),
      )
    )
      return state;
    const selected = [...new Set(action.dueIds)];
    if (
      !selected.length ||
      selected.some((id) => !state.dues.some((due) => due.id === id && due.status === "PENDING"))
    )
      throw new Error("Dues changed; review the outstanding amount again.");
    const amountPaise = selected.reduce(
      (sum, id) => sum + state.dues.find((due) => due.id === id)!.amountPaise,
      0,
    );
    if (!action.success)
      return {
        ...state,
        payments: [
          {
            id: action.id,
            dueId: null,
            title: "All outstanding dues",
            amountPaise,
            walletPaise: 0,
            onlinePaise: amountPaise,
            method: "ONLINE",
            createdAt: action.now,
            status: "FAILED",
            receiptNumber: null,
          },
          ...state.payments,
        ],
        notices: [
          {
            id: action.id,
            title: "Payment unsuccessful",
            body: "Your dues are unchanged. No wallet funds were deducted and no receipts were issued.",
            read: false,
            target: "payments",
          },
          ...state.notices,
        ],
      };
    return selected.reduce(
      (current, dueId) =>
        demoReducer(current, { ...action, type: "PAY", dueId, id: `${action.id}:${dueId}` }),
      state,
    );
  }
  if (action.type === "READ")
    return {
      ...state,
      notices: state.notices.map((notice) =>
        notice.id === action.id ? { ...notice, read: true } : notice,
      ),
    };
  if (action.type === "REFER") {
    if (
      !action.name.trim() ||
      !action.area.trim() ||
      state.referrals.some((item) => item.id === action.id)
    )
      return state;
    return {
      ...state,
      referrals: [
        ...state.referrals,
        {
          id: action.id,
          name: action.name.trim().slice(0, 100),
          area: action.area.trim().slice(0, 100),
        },
      ],
    };
  }
  if (action.type === "COMMENT") {
    if (!action.body.trim() || state.comments.some((item) => item.id === action.id)) return state;
    return {
      ...state,
      comments: [
        ...state.comments,
        { id: action.id, target: action.target, body: action.body.trim().slice(0, 1000) },
      ],
    };
  }
  if (action.type === "RENEW_MEMBERSHIP") {
    if (state.dues.some((due) => due.kind === "MEMBERSHIP")) return state;
    return {
      ...state,
      dues: [
        ...state.dues,
        {
          id: "due-membership",
          title: "Annual membership renewal",
          amountPaise: 36_900,
          status: "PENDING",
          eventId: null,
          kind: "MEMBERSHIP",
        },
      ],
    };
  }
  if (action.type === "APPROVE_PLAN") {
    if (state.planStage === "COORDINATOR_REVIEW") return { ...state, planStage: "ADMIN_REVIEW" };
    if (state.planStage !== "ADMIN_REVIEW") return state;
    return {
      ...state,
      planStage: "PAYMENT_PENDING",
      dues: [
        ...state.dues,
        {
          id: "due-plan",
          title: "Community Support Plan registration",
          amountPaise: 100_000,
          status: "PENDING",
          eventId: null,
          kind: "PLAN",
        },
      ],
    };
  }
  if (state.payments.some((payment) => payment.id === action.id)) return state;
  if (action.type === "TOP_UP") {
    if (
      !Number.isSafeInteger(action.amountPaise) ||
      action.amountPaise < 100 ||
      action.amountPaise > 1_000_000
    )
      throw new Error("Enter an amount from ₹1 to ₹10,000.");
    return {
      ...state,
      walletPaise: state.walletPaise + action.amountPaise,
      payments: [
        {
          id: action.id,
          dueId: null,
          title: "Wallet top-up",
          amountPaise: action.amountPaise,
          walletPaise: 0,
          onlinePaise: action.amountPaise,
          status: "SUCCEEDED",
          method: "ONLINE",
          createdAt: action.now,
          receiptNumber: `DEMO-${String(state.payments.filter((p) => p.receiptNumber).length + 1).padStart(5, "0")}`,
        },
        ...state.payments,
      ],
      movements: [
        {
          id: action.id,
          title: "Wallet top-up",
          amountPaise: action.amountPaise,
          createdAt: action.now,
        },
        ...state.movements,
      ],
      notices: [
        {
          id: action.id,
          title: "Wallet credited",
          body: "Your wallet top-up is complete. Your balance and receipt are ready to view.",
          read: false,
          target: "wallet",
        },
        ...state.notices,
      ],
    };
  }
  const due = state.dues.find((item) => item.id === action.dueId && item.status === "PENDING");
  if (!due) return state;
  if (!action.success)
    return {
      ...state,
      payments: [
        {
          id: action.id,
          dueId: due.id,
          title: due.title,
          amountPaise: due.amountPaise,
          walletPaise: 0,
          onlinePaise: due.amountPaise,
          method: action.method === "WALLET_FIRST" ? "WALLET FIRST" : "ONLINE",
          createdAt: action.now,
          status: "FAILED",
          receiptNumber: null,
        },
        ...state.payments,
      ],
      notices: [
        {
          id: action.id,
          title: "Payment unsuccessful",
          body: `${due.title} remains outstanding. Your wallet has not been debited and no receipt was issued. You can retry from Payments.`,
          read: false,
          target: "payments",
        },
        ...state.notices,
      ],
    };
  const useWallet =
    action.method === "WALLET_FIRST" &&
    (due.kind === "PLAN" || state.walletPaise >= due.amountPaise);
  const walletPaise = useWallet ? Math.min(state.walletPaise, due.amountPaise) : 0;
  const receiptNumber = `DEMO-${String(state.payments.filter((p) => p.receiptNumber).length + 1).padStart(5, "0")}`;
  return {
    ...state,
    walletPaise: state.walletPaise - walletPaise,
    planStage: due.kind === "PLAN" ? "WAITING_PERIOD" : state.planStage,
    dues: state.dues.map((item) => (item.id === due.id ? { ...item, status: "PAID" } : item)),
    payments: [
      {
        id: action.id,
        dueId: due.id,
        title: due.title,
        amountPaise: due.amountPaise,
        walletPaise,
        onlinePaise: due.amountPaise - walletPaise,
        method:
          walletPaise === due.amountPaise ? "WALLET" : walletPaise ? "WALLET + ONLINE" : "ONLINE",
        createdAt: action.now,
        status: "SUCCEEDED",
        receiptNumber,
      },
      ...state.payments,
    ],
    movements: walletPaise
      ? [
          { id: action.id, title: due.title, amountPaise: -walletPaise, createdAt: action.now },
          ...state.movements,
        ]
      : state.movements,
    notices: [
      {
        id: action.id,
        title: "Payment received",
        body: `${due.title} has been paid. Receipt ${receiptNumber} is ready in Payments & Receipts.`,
        read: false,
        target: "receipts",
      },
      ...state.notices,
    ],
  };
}

/** Same deterministic allocation for checkout preview and simulated settlement. */
export function demoCheckoutQuote(
  state: DemoState,
  dueIds: readonly string[],
  method: "ONLINE" | "WALLET_FIRST",
) {
  let walletBalance = state.walletPaise;
  let totalPaise = 0;
  let walletPaise = 0;
  for (const id of new Set(dueIds)) {
    const due = state.dues.find((item) => item.id === id && item.status === "PENDING");
    if (!due) continue;
    const used =
      method === "WALLET_FIRST" && (due.kind === "PLAN" || walletBalance >= due.amountPaise)
        ? Math.min(walletBalance, due.amountPaise)
        : 0;
    totalPaise += due.amountPaise;
    walletPaise += used;
    walletBalance -= used;
  }
  return { totalPaise, walletPaise, onlinePaise: totalPaise - walletPaise };
}

/** Role separation for the presentation only; not production authentication. */
export function applyDemoRoleAction(state: DemoState, role: DemoRole, action: Action) {
  if (action.type === "APPROVE_PLAN") {
    if (
      (role === "COORDINATOR" && state.planStage === "COORDINATOR_REVIEW") ||
      (role === "ADMIN" && state.planStage === "ADMIN_REVIEW")
    )
      return demoReducer(state, action);
    throw new Error("This review belongs to another role.");
  }
  if (action.type === "REFER") {
    if (role !== "COORDINATOR") throw new Error("Referrals belong to the Coordinator workspace.");
    return demoReducer(state, action);
  }
  if (role !== "MEMBER") throw new Error("This action belongs to the member workspace.");
  return demoReducer(state, action);
}
