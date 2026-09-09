import { describe, expect, it } from "vitest";
import {
  duesNeedingReminder,
  planDuesNeedingExpiry,
} from "../src/server/notifications/reminder-scheduler";

describe("payment reminders", () => {
  it("sends plan reminders every five days only while a due remains payable", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    expect(
      duesNeedingReminder(
        [
          {
            id: "due",
            status: "PENDING",
            dueAt: new Date("2026-02-10"),
            lastReminderAt: new Date("2026-01-27"),
          },
        ],
        now,
      ),
    ).toHaveLength(1);
    expect(
      duesNeedingReminder([{ id: "paid", status: "PAID", dueAt: new Date("2026-02-10") }], now),
    ).toHaveLength(0);
  });
});

describe("plan registration expiry", () => {
  it("expires a payable registration due at its recorded deadline", () => {
    expect(
      planDuesNeedingExpiry(
        [{ id: "due", status: "PENDING", dueAt: new Date("2026-01-31") }],
        new Date("2026-02-01"),
      ),
    ).toHaveLength(1);
    expect(
      planDuesNeedingExpiry(
        [{ id: "paid", status: "PAID", dueAt: new Date("2026-01-31") }],
        new Date("2026-02-01"),
      ),
    ).toHaveLength(0);
  });
});
