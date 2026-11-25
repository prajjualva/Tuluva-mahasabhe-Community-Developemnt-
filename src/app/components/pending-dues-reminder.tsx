"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { paymentPurposeLabel } from "../member/payment-feedback";
import {
  pendingDuesKey,
  readPendingDues,
  shouldCheckPendingDues,
  type PendingDue,
} from "./pending-dues";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export function PendingDuesContent({ dues, onDismiss }: { dues: PendingDue[]; onDismiss(): void }) {
  return (
    <>
      <div className="dues-reminder-heading">
        <p className="eyebrow">YOUR MEMBERSHIP</p>
        <button
          type="button"
          className="dues-reminder-close"
          onClick={onDismiss}
          aria-label="Close payment reminder"
        >
          ×
        </button>
      </div>
      <h2 id="pending-dues-title">You have pending dues</h2>
      <p id="pending-dues-description">Review your dues and continue any unfinished payment.</p>
      <ul className="dues-reminder-list">
        {dues.slice(0, 3).map((due) => (
          <li key={due.externalId}>
            <div>
              <strong>{paymentPurposeLabel(due.purpose)}</strong>
              <span>
                Due{" "}
                {new Date(due.dueAt).toLocaleDateString("en-IN", {
                  timeZone: "UTC",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <strong className="dues-reminder-amount">{money.format(due.amountPaise / 100)}</strong>
          </li>
        ))}
      </ul>
      {dues.length > 3 && <p>And {dues.length - 3} more. View all dues to choose a payment.</p>}
      <div className="dues-reminder-actions">
        <Link className="button-link" href="/member/dues#payable-dues" onClick={onDismiss}>
          Continue payment →
        </Link>
        <button className="dues-reminder-later" type="button" onClick={onDismiss}>
          Later
        </button>
      </div>
    </>
  );
}

export function PendingDuesReminder() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const dismissed = useRef("");
  const [dues, setDues] = useState<PendingDue[]>([]);
  const enabled = shouldCheckPendingDues(pathname);
  const signature = pendingDuesKey(dues);

  useEffect(() => {
    setDues([]);
    if (!enabled) return;
    let current = true;
    let controller: AbortController | null = null;
    let lastChecked = 0;
    const refresh = async () => {
      if (document.visibilityState === "hidden" || Date.now() - lastChecked < 5_000) return;
      lastChecked = Date.now();
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const result = await readPendingDues(request.signal);
      if (current && !request.signal.aborted) setDues(result ?? []);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      current = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pathname, enabled]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (enabled && dues.length && dismissed.current !== signature) {
      if (!element.open) element.showModal();
    } else if (element.open) element.close();
  }, [dues, signature, enabled]);

  const dismiss = () => {
    dismissed.current = signature;
    dialog.current?.close();
  };

  return (
    <dialog
      ref={dialog}
      className="dues-reminder"
      aria-labelledby="pending-dues-title"
      aria-describedby="pending-dues-description"
      onCancel={() => {
        dismissed.current = signature;
      }}
    >
      <PendingDuesContent dues={dues} onDismiss={dismiss} />
    </dialog>
  );
}
