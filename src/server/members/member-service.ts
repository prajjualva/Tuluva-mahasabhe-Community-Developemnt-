import { z } from "zod";

export const registrationInput = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  mobile: z.string().regex(/^\+[1-9]\d{7,14}$/),
  referralCode: z.string().trim().min(6).max(32),
  address: z.string().trim().min(5).max(1000),
  password: z.string().min(12).max(128),
});
export type RegistrationInput = z.input<typeof registrationInput>;
export type RegistrationStore = {
  findUserByEmail(email: string): Promise<boolean>;
  findUserByMobile(mobile: string): Promise<boolean>;
  findActiveCoordinator(referralCode: string): Promise<{ id: string } | null>;
  createMember(
    input: z.output<typeof registrationInput>,
    coordinatorId: string,
  ): Promise<{ memberExternalId: string }>;
};
export async function registerMember(store: RegistrationStore, raw: RegistrationInput) {
  const input = registrationInput.parse(raw);
  if (await store.findUserByEmail(input.email)) throw new Error("Email is already in use");
  if (await store.findUserByMobile(input.mobile))
    throw new Error("Mobile number is already in use");
  const coordinator = await store.findActiveCoordinator(input.referralCode);
  if (!coordinator) throw new Error("Referral code is invalid or inactive");
  return store.createMember(input, coordinator.id);
}
export function assertMemberAccess(
  actorMemberExternalId: string,
  requestedMemberExternalId: string,
) {
  if (actorMemberExternalId !== requestedMemberExternalId)
    throw new Error("Forbidden: member resource ownership required");
}
export function canChangeCoordinator(isSuspended: boolean) {
  return !isSuspended;
}
