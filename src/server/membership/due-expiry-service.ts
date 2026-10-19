import { processMembershipLifecycle } from "./membership-lifecycle-service";

/** Renewal generation, expiry, inactivity and closure share one persistent lifecycle. */
export async function processMembershipDueExpiry(now = new Date()) {
  return processMembershipLifecycle(now);
}
