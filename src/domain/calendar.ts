/** Calendar-month deadlines keep UTC time and clamp month-end dates instead of rolling into the next month. */
export function addUtcCalendarMonths(value: Date, months: number) {
  if (!Number.isSafeInteger(months)) throw new Error("Calendar month offset must be an integer");
  const result = new Date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}
export function membershipBillingCycle(anchor: Date, now = new Date()) {
  let cycle = Math.max(0, now.getUTCFullYear() - anchor.getUTCFullYear());
  if (addUtcCalendarMonths(anchor, cycle * 12) > now) cycle -= 1;
  return Math.max(0, cycle);
}
