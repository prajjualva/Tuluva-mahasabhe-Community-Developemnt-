export type CoordinatorAppointmentState = {
  canAppoint: boolean;
  code: "READY" | "MEMBER_UNAVAILABLE" | "ALREADY_COORDINATOR" | "FEES_PENDING";
  message: string;
};

export function coordinatorAppointmentState(input: {
  memberStatus: string;
  hasCoordinatorProfile: boolean;
  pendingFeePayments: number;
}): CoordinatorAppointmentState {
  if (["CLOSED", "DECEASED"].includes(input.memberStatus))
    return {
      canAppoint: false,
      code: "MEMBER_UNAVAILABLE",
      message: "A closed or deceased member cannot be appointed as a Coordinator.",
    };
  if (input.hasCoordinatorProfile)
    return {
      canAppoint: false,
      code: "ALREADY_COORDINATOR",
      message: "This member already has a Coordinator profile. Manage it under Coordinators.",
    };
  if (input.pendingFeePayments > 0)
    return {
      canAppoint: true,
      code: "FEES_PENDING",
      message:
        "Confirm the Coordinator fee exemption below. The server will check pending online payments before appointment. Cash collections or payments already in progress require reconciliation first.",
    };
  return {
    canAppoint: true,
    code: "READY",
    message: "Appointment automatically grants Coordinator access and keeps Member access.",
  };
}

export class CoordinatorAppointmentError extends Error {
  constructor(
    readonly code: Exclude<CoordinatorAppointmentState["code"], "READY"> | "REFERRAL_CODE_TAKEN",
    message: string,
  ) {
    super(message);
    this.name = "CoordinatorAppointmentError";
  }
}
