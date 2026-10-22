"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  DEMO_STORAGE_KEY,
  DEMO_SESSION_KEY,
  demoRoles,
  demoNavigation,
  demoSectionForRole,
  demoCheckoutQuote,
  applyDemoRoleAction,
  type DemoRole,
  demoEvents,
  demoNews,
  demoReducer,
  demoStateSchema,
  initialDemoState,
  type DemoState,
} from "../../demo/stakeholder-state";

function currency(paise: number) {
  return `₹${Math.trunc(paise / 100).toLocaleString("en-IN")}${paise % 100 ? `.${String(paise % 100).padStart(2, "0")}` : ""}`;
}
function timestamp() {
  return { id: crypto.randomUUID(), now: new Date().toISOString() };
}

export function StakeholderDemo({ livePortal = true }: { livePortal?: boolean }) {
  const [state, setState] = useState<DemoState | null>(null);
  const currentState = useRef<DemoState | null>(null);
  const [role, setRole] = useState<DemoRole | null>(null);
  const roleRef = useRef<DemoRole | null>(null);
  const [requestedSection, setSection] = useState("dashboard");
  const section = role ? demoSectionForRole(role, requestedSection) : "login";
  const navigation = role ? demoNavigation[role] : [];
  const [batchDueIds, setBatchDueIds] = useState<string[]>([]);
  const [openMenu, setOpenMenu] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<string | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<string | null>(null);
  const [method, setMethod] = useState<"ONLINE" | "WALLET_FIRST">("WALLET_FIRST");
  const [topUp, setTopUp] = useState("500");
  const [message, setMessage] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DEMO_STORAGE_KEY);
      const parsed = stored ? demoStateSchema.safeParse(JSON.parse(stored)) : null;
      currentState.current = parsed?.success ? parsed.data : initialDemoState();
    } catch {
      currentState.current = initialDemoState();
    }
    setState(currentState.current);
    try {
      const savedRole = sessionStorage.getItem(DEMO_SESSION_KEY);
      if (demoRoles.includes(savedRole as DemoRole)) {
        roleRef.current = savedRole as DemoRole;
        setRole(roleRef.current);
      }
    } catch {
      /* A presentation can still run without session persistence. */
    }
    const readHash = () => {
      const target = location.hash.slice(1);
      if (roleRef.current) setSection(demoSectionForRole(roleRef.current, target));
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  function navigate(target: string) {
    if (!roleRef.current) return;
    const allowed = demoSectionForRole(roleRef.current, target);
    setSection(allowed);
    setOpenMenu(false);
    setCheckout(null);
    setBatchDueIds([]);
    setReceipt(null);
    setSelectedEvent(null);
    setSelectedNews(null);
    setSelectedNotice(null);
    setMessage("");
    history.replaceState(null, "", `#${allowed}`);
  }
  function login(nextRole: DemoRole) {
    roleRef.current = nextRole;
    setRole(nextRole);
    try {
      sessionStorage.setItem(DEMO_SESSION_KEY, nextRole);
    } catch {
      /* Browser-local demo only. */
    }
    navigate(demoNavigation[nextRole][0][0]);
  }
  function logout() {
    roleRef.current = null;
    setRole(null);
    setCheckout(null);
    setReceipt(null);
    setBatchDueIds([]);
    setMessage("");
    setResetOpen(false);
    try {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
    } catch {
      /* No real session exists. */
    }
    history.replaceState(null, "", "#login");
  }
  function act(action: Parameters<typeof demoReducer>[1]) {
    if (!currentState.current) return false;
    try {
      if (!roleRef.current) return false;
      const next = demoStateSchema.parse(
        applyDemoRoleAction(currentState.current, roleRef.current, action),
      );
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
      currentState.current = next;
      setState(next);
      return true;
    } catch {
      setMessage(
        "This change could not be saved. Check your amount or browser storage and try again.",
      );
      return false;
    }
  }
  if (!state)
    return (
      <main>
        <p role="status">Opening your workspace…</p>
      </main>
    );
  if (!role)
    return (
      <main className="demo-login-page">
        <Link className="brand-lockup" href="/">
          <span className="brand-seal">CS</span>
          <span>
            Community Support<small>FOUNDATION</small>
          </span>
        </Link>
        <div className="demo-login-intro">
          <p className="eyebrow">TULUVA MAHASABHE</p>
          <h1>A community that stands together.</h1>
          <p>Choose your demo login. No password needed.</p>
          <span className="access-pill">Stakeholder demo · Simulated payments</span>
        </div>
        <div className="demo-login-grid">
          {(
            [
              [
                "MEMBER",
                "Member",
                "Ananya Shetty",
                "Your membership, contributions, wallet and receipts.",
              ],
              [
                "COORDINATOR",
                "Coordinator",
                "Prakash Alva",
                "Assigned members, referrals and plan reviews.",
              ],
              [
                "ADMIN",
                "Admin",
                "Foundation Admin",
                "Approvals, member records and financial oversight.",
              ],
            ] as const
          ).map(([value, label, name, description]) => (
            <article key={value}>
              <p className="eyebrow">{label.toUpperCase()} PORTAL</p>
              <h2>{name}</h2>
              <p>{description}</p>
              <button onClick={() => login(value)}>{label} login →</button>
            </article>
          ))}
        </div>
      </main>
    );
  const pending = state.dues.filter((due) => due.status === "PENDING");
  const outstanding = pending.reduce((total, due) => total + due.amountPaise, 0);
  const receipts = state.payments.filter((payment) => payment.receiptNumber);
  const membershipRenewed = state.dues.some(
    (item) => item.kind === "MEMBERSHIP" && item.status === "PAID",
  );
  const unread = state.notices.filter((notice) => !notice.read).length;
  const selectedDues = state.dues.filter(
    (item) =>
      (checkout === "all" ? batchDueIds.includes(item.id) : item.id === checkout) &&
      item.status === "PENDING",
  );
  const quote = demoCheckoutQuote(
    state,
    selectedDues.map((item) => item.id),
    method,
  );
  const due = selectedDues.length
    ? {
        id: checkout!,
        title: checkout === "all" ? "All outstanding dues" : selectedDues[0].title,
        amountPaise: quote.totalPaise,
      }
    : null;
  const walletPart = quote.walletPaise;
  const activeNews = demoNews.find((item) => item.id === selectedNews);
  const activeNotice = state.notices.find((item) => item.id === selectedNotice);
  const activeReceipt = receipts.find((item) => item.id === receipt);
  const submitComment = (event: FormEvent, target: string) => {
    event.preventDefault();
    act({ type: "COMMENT", target, body: comment, id: crypto.randomUUID() });
    setComment("");
  };
  const settleCheckout = (success: boolean) => {
    if (!due) return;
    const command =
      checkout === "all"
        ? { type: "PAY_ALL" as const, dueIds: batchDueIds }
        : { type: "PAY" as const, dueId: due.id };
    if (!act({ ...command, method, success, ...timestamp() })) return;
    setCheckout(null);
    setBatchDueIds([]);
    setMessage(
      success
        ? "Payment successful. Dues, wallet, receipts and notifications are updated."
        : "Payment failed. No wallet deduction or receipts; your dues remain payable.",
    );
  };

  return (
    <div className="shell stakeholder-demo">
      <aside className="portal-sidebar">
        <Link className="brand-lockup" href="/">
          <span className="brand-seal">CS</span>
          <span>
            Community Support<small>FOUNDATION</small>
          </span>
        </Link>
        <p className="portal-role">
          {role === "MEMBER"
            ? "Ananya Shetty · Member"
            : role === "COORDINATOR"
              ? "Prakash Alva · Coordinator"
              : "Foundation Admin · Admin"}
        </p>
        <button
          className="mobile-nav-toggle"
          aria-expanded={openMenu}
          aria-controls="demo-navigation"
          onClick={() => setOpenMenu(!openMenu)}
        >
          Menu
        </button>
        <nav id="demo-navigation" aria-label="Demo navigation" data-open={openMenu}>
          {navigation.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={section === id ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate(id);
              }}
            >
              {label}
              {id === "notifications" && unread > 0 ? ` (${unread})` : ""}
            </a>
          ))}
        </nav>
        <button onClick={logout}>Sign out / switch demo login</button>
        {livePortal && (
          <div className="sidebar-footer">
            <Link href="/member">Live member portal ↗</Link>
          </div>
        )}
      </aside>
      <section className="workspace">
        <header className="workspace-topbar">
          <span>Stakeholder demo · Simulated payments</span>
          <button className="demo-text-button" onClick={() => setResetOpen(true)}>
            Reset demo data
          </button>
        </header>
        <main>
          <div className="demo-page-heading">
            <div>
              <p className="eyebrow">TULUVA MAHASABHE · COMMUNITY SUPPORT</p>
              <h1>{navigation.find(([id]) => id === section)?.[1] ?? "Dashboard"}</h1>
            </div>
            <span className="access-pill">
              {role === "MEMBER"
                ? "CSF-2026-0042 · Active"
                : role === "COORDINATOR"
                  ? "Mangaluru · Coordinator"
                  : "Foundation administration"}
            </span>
          </div>
          {message && (
            <div role="status" className="demo-feedback">
              {message}
            </div>
          )}
          {section === "coordinator" && (
            <>
              <div className="demo-welcome">
                <p className="eyebrow">MANGALURU COORDINATOR</p>
                <h2>Namaskara, Prakash.</h2>
                <p>Your community, connected through care.</p>
                <button onClick={() => navigate("members")}>View assigned members →</button>
              </div>
              <div className="demo-stat-grid">
                {[
                  ["Assigned members", "3", "members"],
                  [
                    "Plans awaiting your review",
                    state.planStage === "COORDINATOR_REVIEW" ? "1" : "0",
                    "approvals",
                  ],
                  ["Community notices", "3", "events"],
                  ["Referral introductions", String(state.referrals.length), "referrals"],
                ].map(([label, value, target]) => (
                  <button key={label} className="demo-stat-card" onClick={() => navigate(target)}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>View details →</small>
                  </button>
                ))}
              </div>
              <article>
                <h2>Your permanent referral code</h2>
                <div className="demo-referral-code">TULUVA01</div>
                <p>Welcome new members to your Mangaluru community.</p>
                <button onClick={() => navigate("referrals")}>Manage introductions →</button>
              </article>
            </>
          )}
          {section === "members" && (
            <article>
              <h2>{role === "COORDINATOR" ? "Your assigned members" : "Member directory"}</h2>
              {[
                ["Ananya Shetty", "CSF-2026-0042", "Active", currency(outstanding)],
                ["Kavya Shetty", "CSF-2026-0043", "Active", "No outstanding dues"],
                ["Arun Poojary", "CSF-2026-0044", "Inactive", "Follow-up required"],
              ].map(([name, number, status, detail]) => (
                <div className="demo-list-row" key={number}>
                  <div>
                    <strong>{name}</strong>
                    <small>{number} · Mangaluru</small>
                  </div>
                  <span className="demo-status">{status}</span>
                  <span>{detail}</span>
                </div>
              ))}
            </article>
          )}
          {section === "approvals" && (
            <article>
              <p className="eyebrow">COMMUNITY SUPPORT PLAN</p>
              <h2>Ananya Shetty</h2>
              <p>CSF-2026-0042 · Coordinator Prakash Alva</p>
              <ol className="demo-plan-steps">
                <li>
                  Coordinator review {state.planStage !== "COORDINATOR_REVIEW" ? "✓" : "· Pending"}
                </li>
                <li>
                  Admin approval{" "}
                  {["PAYMENT_PENDING", "WAITING_PERIOD"].includes(state.planStage)
                    ? "✓"
                    : "· Pending"}
                </li>
                <li>Member payment {state.planStage === "WAITING_PERIOD" ? "✓" : ""}</li>
                <li>Initial 6-month waiting period</li>
              </ol>
              {(role === "COORDINATOR" && state.planStage === "COORDINATOR_REVIEW") ||
              (role === "ADMIN" && state.planStage === "ADMIN_REVIEW") ? (
                <button
                  onClick={() => {
                    if (act({ type: "APPROVE_PLAN" }))
                      setMessage(
                        role === "COORDINATOR"
                          ? "Reviewed and forwarded to the Admin."
                          : "Approved. The member can now pay the ₹1,000 registration fee.",
                      );
                  }}
                >
                  {role === "COORDINATOR" ? "Recommend to Admin" : "Approve plan registration"}
                </button>
              ) : (
                <p className="demo-feedback">
                  {state.planStage === "COORDINATOR_REVIEW"
                    ? "Awaiting Coordinator review."
                    : state.planStage === "ADMIN_REVIEW"
                      ? "Forwarded to the Admin for approval."
                      : state.planStage === "PAYMENT_PENDING"
                        ? "Approved · Awaiting the member’s registration payment."
                        : "Registration paid · Initial waiting period in progress."}
                </p>
              )}
            </article>
          )}
          {section === "adminpayments" && (
            <article>
              <h2>Member payment activity</h2>
              {state.payments.length ? (
                state.payments.map((payment) => (
                  <div className="demo-list-row" key={payment.id}>
                    <div>
                      <strong>{payment.title}</strong>
                      <small>Ananya Shetty · {payment.method}</small>
                    </div>
                    <strong>{currency(payment.amountPaise)}</strong>
                    <span className={`demo-status ${payment.status === "FAILED" ? "failed" : ""}`}>
                      {payment.status}
                    </span>
                    {payment.receiptNumber && (
                      <button
                        onClick={() => {
                          navigate("receipts");
                          setReceipt(payment.id);
                        }}
                      >
                        View receipt
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p>No payments have been recorded yet.</p>
              )}
            </article>
          )}
          {resetOpen && (
            <article className="demo-confirm" role="alert">
              <h2>Reset this demo?</h2>
              <p>
                Only this browser’s generated demo payments, receipts, comments and referrals will
                be cleared. Real records stay untouched.
              </p>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem(DEMO_STORAGE_KEY);
                    currentState.current = initialDemoState();
                    setState(currentState.current);
                    setResetOpen(false);
                    setCheckout(null);
                    setReceipt(null);
                    setMessage("Demo restored to its starting state.");
                  } catch {
                    setMessage("Browser storage could not be reset.");
                  }
                }}
              >
                Reset demo only
              </button>{" "}
              <button onClick={() => setResetOpen(false)}>Keep demo data</button>
            </article>
          )}

          {section === "dashboard" && (
            <>
              <div className="demo-welcome">
                <p className="eyebrow">STRONGER, TOGETHER</p>
                <h2>Namaskara, Ananya.</h2>
                <p>A little support from each of us makes a meaningful difference.</p>
                <button onClick={() => navigate("events")}>Support our community →</button>
              </div>
              <div className="demo-stat-grid">
                {[
                  ["Outstanding dues", currency(outstanding), "payments"],
                  ["Wallet balance", currency(state.walletPaise), "wallet"],
                  ["Receipts", String(receipts.length), "receipts"],
                  ["Community events", String(demoEvents.length), "events"],
                ].map(([label, value, target]) => (
                  <button className="demo-stat-card" key={label} onClick={() => navigate(target)}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>View details ↗</small>
                  </button>
                ))}
              </div>
              <div className="demo-two-column">
                <article>
                  <p className="eyebrow">YOUR MEMBERSHIP</p>
                  <h2>Part of something bigger.</h2>
                  <p>
                    Your membership is active through 18 October{" "}
                    {membershipRenewed ? "2028" : "2027"}.
                  </p>
                  <p>
                    Coordinator <strong>Prakash Alva</strong> · Mangaluru
                  </p>
                  <button onClick={() => navigate("membership")}>View membership</button>
                </article>
                <article>
                  <p className="eyebrow">LATEST FROM THE COMMUNITY</p>
                  <h2>{demoNews[0].title}</h2>
                  <p>{demoNews[0].intro}</p>
                  <button
                    onClick={() => {
                      navigate("news");
                      setSelectedNews("health");
                    }}
                  >
                    Read full story →
                  </button>
                </article>
              </div>
            </>
          )}

          {section === "events" && (
            <>
              <p>In remembrance. In solidarity. Stand beside the families in our community.</p>
              {selectedEvent && (
                <button className="demo-text-button" onClick={() => setSelectedEvent(null)}>
                  ← All events
                </button>
              )}
              {demoEvents
                .filter((event) => !selectedEvent || event.id === selectedEvent)
                .map((event) => {
                  const eventDue = state.dues.find((item) => item.eventId === event.id);
                  return (
                    <article className="memorial-card" key={event.id}>
                      <div className="memorial-portrait">
                        <Image
                          src={event.image}
                          width={420}
                          height={420}
                          alt={`Illustrative portrait for ${event.name}`}
                        />
                        <span className="memorial-ribbon">IN LOVING MEMORY</span>
                      </div>
                      <div className="memorial-content">
                        <p className="eyebrow">COMMUNITY SUPPORT EVENT</p>
                        <h2>{event.name}</h2>
                        <p className="muted">
                          {event.date} · {event.place}
                        </p>
                        <p>{event.story}</p>
                        <div className="demo-event-status">
                          <p className="eyebrow">TOGETHER IN SUPPORT</p>
                          <strong>Small acts. Meaningful support.</strong>
                          <p>
                            {role === "MEMBER"
                              ? eventDue?.status === "PAID"
                                ? "Your ₹100 contribution has been received. Thank you for standing with this family."
                                : "Your ₹100 contribution helps us stand beside this family in their time of need."
                              : "Published community notice · Verified by the Foundation"}
                          </p>
                          {role === "MEMBER" && (
                            <span className="demo-status">
                              {eventDue?.status === "PAID"
                                ? "Your contribution · Paid ✓"
                                : "Your contribution · ₹100 due"}
                            </span>
                          )}
                        </div>
                        <div className="demo-action-row">
                          {role === "MEMBER" && (
                            <button
                              disabled={eventDue?.status === "PAID"}
                              onClick={() => {
                                navigate("payments");
                                setCheckout(eventDue?.id ?? null);
                              }}
                            >
                              {eventDue?.status === "PAID"
                                ? "Your contribution is paid ✓"
                                : "Contribute ₹100"}
                            </button>
                          )}
                          {!selectedEvent && (
                            <button
                              className="demo-text-button"
                              onClick={() => setSelectedEvent(event.id)}
                            >
                              View remembrance →
                            </button>
                          )}
                        </div>
                        {selectedEvent && (
                          <>
                            <h3>Messages of support</h3>
                            <p className="demo-quote">
                              “Our heartfelt condolences. We stand with the family during this
                              difficult time.”
                              <br />
                              <small>Prakash Alva · Coordinator</small>
                            </p>
                            {state.comments
                              .filter((item) => item.target === event.id)
                              .map((item) => (
                                <p className="demo-quote" key={item.id}>
                                  {item.body}
                                  <br />
                                  <small>Ananya Shetty</small>
                                </p>
                              ))}
                            {role === "MEMBER" && (
                              <form onSubmit={(form) => submitComment(form, event.id)}>
                                <label htmlFor="event-condolence">Leave a condolence</label>
                                <textarea
                                  id="event-condolence"
                                  value={comment}
                                  onChange={(change) => setComment(change.target.value)}
                                  required
                                  maxLength={1000}
                                />
                                <button>Post message</button>
                              </form>
                            )}
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
            </>
          )}

          {section === "payments" && (
            <>
              <article>
                <div className="demo-card-heading">
                  <div>
                    <p className="eyebrow">YOUR CONTRIBUTIONS</p>
                    <h2>{currency(outstanding)} outstanding</h2>
                  </div>
                  <button
                    disabled={!pending.some((item) => item.kind === "CONTRIBUTION")}
                    onClick={() =>
                      setCheckout(pending.find((item) => item.kind === "CONTRIBUTION")?.id ?? null)
                    }
                  >
                    Pay oldest contribution first
                  </button>
                  <button
                    disabled={!pending.length}
                    onClick={() => {
                      setBatchDueIds(pending.map((item) => item.id));
                      setCheckout("all");
                    }}
                  >
                    Pay all outstanding dues · {currency(outstanding)}
                  </button>
                </div>
                {pending.length ? (
                  pending.map((item) => (
                    <div className="demo-list-row" key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <small>Awaiting payment</small>
                      </div>
                      <strong>{currency(item.amountPaise)}</strong>
                      <button onClick={() => setCheckout(item.id)}>Pay now</button>
                    </div>
                  ))
                ) : (
                  <p>All caught up. Thank you for supporting your community.</p>
                )}
              </article>
              {due && (
                <article className="demo-checkout">
                  <p className="eyebrow">SECURE CHECKOUT · SIMULATION</p>
                  <h2>{due.title}</h2>
                  <p className="demo-checkout-amount">{currency(due.amountPaise)}</p>
                  {checkout === "all" && (
                    <>
                      <p>{selectedDues.length} dues · One checkout · Individual receipts</p>
                      {selectedDues.map((item) => (
                        <div className="demo-list-row" key={item.id}>
                          <span>{item.title}</span>
                          <strong>{currency(item.amountPaise)}</strong>
                        </div>
                      ))}
                    </>
                  )}
                  <label htmlFor="demo-method">Payment method</label>
                  <select
                    id="demo-method"
                    value={method}
                    onChange={(event) => setMethod(event.target.value as typeof method)}
                  >
                    <option value="WALLET_FIRST">Wallet first, then online if needed</option>
                    <option value="ONLINE">Online payment</option>
                  </select>
                  <div className="demo-list-row">
                    <span>From wallet</span>
                    <strong>{currency(walletPart)}</strong>
                  </div>
                  <div className="demo-list-row">
                    <span>Online payment</span>
                    <strong>{currency(due.amountPaise - walletPart)}</strong>
                  </div>
                  {method === "WALLET_FIRST" && !walletPart && state.walletPaise > 0 && (
                    <p className="muted">
                      Your wallet does not cover this due. Regular contributions use one payment
                      source; plan registration supports a split.
                    </p>
                  )}
                  <div className="demo-action-row">
                    <button onClick={() => settleCheckout(true)}>
                      Simulate successful payment
                    </button>
                    <button className="demo-text-button" onClick={() => settleCheckout(false)}>
                      Simulate failure
                    </button>
                    <button className="demo-text-button" onClick={() => setCheckout(null)}>
                      Cancel
                    </button>
                  </div>
                </article>
              )}
              <article>
                <h2>Payment history</h2>
                {state.payments.length ? (
                  state.payments.map((payment) => (
                    <div className="demo-list-row" key={payment.id}>
                      <div>
                        <strong>{payment.title}</strong>
                        <small>
                          {payment.method} · {new Date(payment.createdAt).toLocaleString("en-IN")}
                        </small>
                      </div>
                      <strong>{currency(payment.amountPaise)}</strong>
                      <span
                        className={`demo-status ${payment.status === "FAILED" ? "failed" : ""}`}
                      >
                        {payment.status === "SUCCEEDED" ? "Successful" : "Failed"}
                      </span>
                      {payment.receiptNumber && (
                        <button
                          className="demo-text-button"
                          onClick={() => {
                            navigate("receipts");
                            setReceipt(payment.id);
                          }}
                        >
                          View receipt
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p>Your payments will appear here.</p>
                )}
              </article>
            </>
          )}

          {section === "wallet" && (
            <>
              <div className="demo-welcome">
                <p className="eyebrow">AVAILABLE WALLET BALANCE</p>
                <h2>{currency(state.walletPaise)}</h2>
                <p>Keep your contributions ready, in one place.</p>
              </div>
              <div className="demo-two-column">
                <article>
                  <h2>Add to wallet</h2>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (
                        !act({ type: "TOP_UP", amountPaise: Number(topUp) * 100, ...timestamp() })
                      )
                        return;
                      setMessage("Wallet credited. Your new balance and receipt are available.");
                    }}
                  >
                    <label htmlFor="top-up">Amount in rupees</label>
                    <input
                      id="top-up"
                      type="number"
                      min="1"
                      max="10000"
                      step="1"
                      required
                      value={topUp}
                      onChange={(event) => setTopUp(event.target.value)}
                    />
                    <button>Simulate wallet top-up</button>
                  </form>
                </article>
                <article>
                  <h2>Wallet activity</h2>
                  {state.movements.map((movement) => (
                    <div className="demo-list-row" key={movement.id}>
                      <div>
                        <strong>{movement.title}</strong>
                        <small>{new Date(movement.createdAt).toLocaleDateString("en-IN")}</small>
                      </div>
                      <strong>
                        {movement.amountPaise < 0 ? "−" : "+"}
                        {currency(Math.abs(movement.amountPaise))}
                      </strong>
                    </div>
                  ))}
                </article>
              </div>
            </>
          )}

          {section === "receipts" && (
            <>
              {activeReceipt ? (
                <article className="demo-receipt">
                  <div className="demo-card-heading">
                    <div>
                      <p className="eyebrow">COMMUNITY SUPPORT FOUNDATION</p>
                      <h2>Payment receipt</h2>
                    </div>
                    <span className="access-pill">DEMO · NOT VALID FOR PAYMENT</span>
                  </div>
                  <p>{activeReceipt.receiptNumber}</p>
                  <hr />
                  <p>
                    <strong>Ananya Shetty</strong>
                    <br />
                    CSF-2026-0042 · Mangaluru
                  </p>
                  <div className="demo-list-row">
                    <span>{activeReceipt.title}</span>
                    <strong>{currency(activeReceipt.amountPaise)}</strong>
                  </div>
                  <p>
                    Payment method: {activeReceipt.method}
                    <br />
                    Wallet: {currency(activeReceipt.walletPaise)} · Online:{" "}
                    {currency(activeReceipt.onlinePaise)}
                    <br />
                    {new Date(activeReceipt.createdAt).toLocaleString("en-IN")}
                  </p>
                  <p>Thank you for standing with your community.</p>
                  <div className="demo-action-row">
                    <button onClick={() => window.print()}>Print / save PDF</button>
                    <button className="demo-text-button" onClick={() => setReceipt(null)}>
                      ← All receipts
                    </button>
                  </div>
                </article>
              ) : (
                <article>
                  <h2>Your receipts</h2>
                  {receipts.length ? (
                    receipts.map((payment) => (
                      <div className="demo-list-row" key={payment.id}>
                        <div>
                          <strong>{payment.receiptNumber}</strong>
                          <small>{payment.title}</small>
                        </div>
                        <strong>{currency(payment.amountPaise)}</strong>
                        <button onClick={() => setReceipt(payment.id)}>Open receipt</button>
                      </div>
                    ))
                  ) : (
                    <p>Complete a payment to see your receipt here.</p>
                  )}
                </article>
              )}
            </>
          )}

          {section === "news" && (
            <>
              {activeNews ? (
                <article className="demo-news-detail">
                  <button className="demo-text-button" onClick={() => setSelectedNews(null)}>
                    ← Community news
                  </button>
                  <p className="eyebrow">
                    {activeNews.category} · {activeNews.date}
                  </p>
                  <h2>{activeNews.title}</h2>
                  <p className="demo-news-intro">{activeNews.intro}</p>
                  <p>{activeNews.body}</p>
                  <h3>Community conversation</h3>
                  {state.comments
                    .filter((item) => item.target === activeNews.id)
                    .map((item) => (
                      <p className="demo-quote" key={item.id}>
                        {item.body}
                        <br />
                        <small>Ananya Shetty</small>
                      </p>
                    ))}
                  {role === "MEMBER" && (
                    <form onSubmit={(event) => submitComment(event, activeNews.id)}>
                      <label htmlFor="news-comment">Your comment</label>
                      <textarea
                        id="news-comment"
                        required
                        maxLength={1000}
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                      />
                      <button>Post comment</button>
                    </form>
                  )}
                </article>
              ) : (
                <div className="demo-news-grid">
                  {demoNews.map((item, index) => (
                    <article key={item.id}>
                      <div className={`demo-news-art art-${index}`} aria-hidden="true">
                        {["Care.", "Together.", "Give back."][index]}
                      </div>
                      <p className="eyebrow">{item.category}</p>
                      <h2>{item.title}</h2>
                      <p>{item.intro}</p>
                      <small>{item.date}</small>
                      <p>
                        <button
                          className="demo-text-button"
                          onClick={() => setSelectedNews(item.id)}
                        >
                          Read full story →
                        </button>
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {section === "notifications" && (
            <article>
              <h2>Your inbox {unread > 0 ? `· ${unread} unread` : ""}</h2>
              {activeNotice ? (
                <>
                  <button className="demo-text-button" onClick={() => setSelectedNotice(null)}>
                    ← Inbox
                  </button>
                  <h3>{activeNotice.title}</h3>
                  <p className="notification-content">{activeNotice.body}</p>
                  <button onClick={() => navigate(activeNotice.target)}>View related page →</button>
                </>
              ) : (
                state.notices.map((notice) => (
                  <button
                    className="demo-notice-row"
                    key={notice.id}
                    onClick={() => {
                      setSelectedNotice(notice.id);
                      act({ type: "READ", id: notice.id });
                    }}
                  >
                    <span>
                      <strong>{notice.title}</strong>
                      <small>{notice.body.slice(0, 95)}…</small>
                    </span>
                    <span>{notice.read ? "Open →" : "Unread · Open →"}</span>
                  </button>
                ))
              )}
            </article>
          )}

          {section === "referrals" && (
            <>
              <article>
                <p className="eyebrow">GROW OUR COMMUNITY</p>
                <h2>Invite someone to belong.</h2>
                <p>Your Coordinator’s referral code</p>
                <div className="demo-referral-code">TULUVA01</div>
                <p>Coordinator Prakash Alva · Mangaluru</p>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText("TULUVA01").then(
                      () => setMessage("Referral code copied."),
                      () => setMessage("Copy this code: TULUVA01"),
                    );
                  }}
                >
                  Copy referral code
                </button>
              </article>
              <div className="demo-two-column">
                <article>
                  <h2>Register an introduction</h2>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      if (
                        !act({
                          type: "REFER",
                          name: String(form.get("name")),
                          area: String(form.get("area")),
                          id: crypto.randomUUID(),
                        })
                      )
                        return;
                      event.currentTarget.reset();
                      setMessage("Introduction added to your referral list.");
                    }}
                  >
                    <label htmlFor="referral-name">Name</label>
                    <input id="referral-name" name="name" required maxLength={100} />
                    <label htmlFor="referral-area">Town / locality</label>
                    <input id="referral-area" name="area" required maxLength={100} />
                    <button>Add introduction</button>
                  </form>
                </article>
                <article>
                  <h2>Your introductions · {state.referrals.length}</h2>
                  {state.referrals.map((item) => (
                    <div className="demo-list-row" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.area}</small>
                      </div>
                      <span className="demo-status">Introduced</span>
                    </div>
                  ))}
                </article>
              </div>
            </>
          )}

          {section === "membership" && (
            <article>
              <p className="eyebrow">MEMBERSHIP CERTIFICATE</p>
              <h2>Ananya Shetty</h2>
              <p>CSF-2026-0042 · Member since 19 October 2025</p>
              <span className="demo-status">Active member</span>
              <div className="demo-list-row">
                <span>Annual membership</span>
                <strong>₹369</strong>
              </div>
              <div className="demo-list-row">
                <span>Current term</span>
                <strong>
                  {membershipRenewed
                    ? "19 October 2027 – 18 October 2028"
                    : "19 October 2026 – 18 October 2027"}
                </strong>
              </div>
              <p>Coordinator Prakash Alva · Mangaluru</p>
              {state.dues.find((item) => item.kind === "MEMBERSHIP")?.status === "PAID" ? (
                <p className="demo-feedback">
                  Renewal paid. Your next term is recorded through 18 October 2028.
                </p>
              ) : (
                <button
                  onClick={() => {
                    act({ type: "RENEW_MEMBERSHIP" });
                    navigate("payments");
                    setCheckout("due-membership");
                  }}
                >
                  Try annual renewal · ₹369
                </button>
              )}
            </article>
          )}

          {section === "plan" && (
            <article>
              <p className="eyebrow">COMMUNITY SUPPORT PLAN</p>
              <h2>Care for the people who matter.</h2>
              <p>One-time registration ₹1,000 · Initial waiting period 6 months</p>
              <ol className="demo-plan-steps">
                <li>
                  Coordinator approval{" "}
                  {state.planStage !== "COORDINATOR_REVIEW" ? "✓" : "· Awaiting review"}
                </li>
                <li>
                  Admin approval{" "}
                  {["PAYMENT_PENDING", "WAITING_PERIOD"].includes(state.planStage) ? "✓" : ""}
                </li>
                <li>Registration payment {state.planStage === "WAITING_PERIOD" ? "✓" : ""}</li>
                <li>Initial waiting period</li>
              </ol>
              {state.planStage === "COORDINATOR_REVIEW" && (
                <p className="demo-feedback">Your application is awaiting Coordinator review.</p>
              )}
              {state.planStage === "ADMIN_REVIEW" && (
                <p className="demo-feedback">
                  Your Coordinator has recommended the application. Admin approval is pending.
                </p>
              )}
              {state.planStage === "PAYMENT_PENDING" && (
                <>
                  <p className="demo-feedback">
                    Approved · Payment pending. Pay within 30 days of approval.
                  </p>
                  <button
                    onClick={() => {
                      navigate("payments");
                      setCheckout("due-plan");
                    }}
                  >
                    Pay registration · ₹1,000
                  </button>
                </>
              )}
              {state.planStage === "WAITING_PERIOD" && (
                <p className="demo-feedback">
                  Registration paid. Your initial 6-month waiting period has started.
                </p>
              )}
            </article>
          )}

          {section === "admin" && (
            <>
              <div className="demo-stat-grid">
                {[
                  [
                    "Member payments",
                    currency(
                      state.payments
                        .filter((item) => item.status === "SUCCEEDED")
                        .reduce((sum, item) => sum + item.amountPaise, 0),
                    ),
                  ],
                  [
                    "Contribution receipts",
                    String(
                      receipts.filter(
                        (item) =>
                          item.dueId?.startsWith("due-") &&
                          demoEvents.some((event) => `due-${event.id}` === item.dueId),
                      ).length,
                    ),
                  ],
                  ["Outstanding member dues", currency(outstanding)],
                  ["New introductions", String(state.referrals.length)],
                ].map(([label, value]) => (
                  <div className="demo-stat-card" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <article>
                <h2>Published community notices</h2>
                {demoEvents.map((event) => {
                  return (
                    <div key={event.id} className="demo-list-row">
                      <strong>{event.name}</strong>
                      <span>
                        {event.place} · {event.date}
                      </span>
                      <span className="demo-status">Published</span>
                    </div>
                  );
                })}
              </article>
              <article>
                <h2>Latest transactions</h2>
                {state.payments.length ? (
                  state.payments.map((payment) => (
                    <div className="demo-list-row" key={payment.id}>
                      <div>
                        <strong>{payment.title}</strong>
                        <small>Ananya Shetty · {payment.method}</small>
                      </div>
                      <strong>{currency(payment.amountPaise)}</strong>
                      <span className="demo-status">{payment.status}</span>
                    </div>
                  ))
                ) : (
                  <p>Complete a member payment to see it reflected here.</p>
                )}
              </article>
            </>
          )}
        </main>
      </section>
    </div>
  );
}
