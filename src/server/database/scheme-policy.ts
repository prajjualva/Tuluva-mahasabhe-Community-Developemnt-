import { Prisma } from "@prisma/client";
import { SCHEME_DEFAULTS, SchemeSettings } from "../../domain/scheme-settings";
export async function effectiveSchemeNumber(
  tx: Pick<Prisma.TransactionClient, "schemeSettingVersion">,
  key: keyof SchemeSettings,
  at = new Date(),
) {
  const version = await tx.schemeSettingVersion.findFirst({
    where: { setting: { key }, effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: "desc" },
    select: { value: true },
  });
  const value = version?.value ?? SCHEME_DEFAULTS[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new Error("Foundation scheme settings are invalid");
  return value;
}
