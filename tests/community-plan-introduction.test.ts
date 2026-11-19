import { expect, it } from "vitest";
import { SCHEME_DEFAULTS } from "../src/domain/scheme-settings";
import { kannadaCommunityPlanIntroduction } from "../src/content/community-plan-introduction.kn";

it("uses current scheme values in the Kannada plan explanation and keeps membership and support review separate", () => {
  const { title, body } = kannadaCommunityPlanIntroduction(SCHEME_DEFAULTS);
  expect(title).toContain("ತುಳುವ ಮಹಾಸಭೆ");
  for (const amount of ["₹369", "₹1,000", "₹100", "₹1,00,000"]) expect(body).toContain(amount);
  expect(body).toContain("ನಿಷ್ಕ್ರಿಯ ಸದಸ್ಯರಿಗೂ");
  expect(body).toContain("ನಿಜವಾದ ಮರಣದ ದಿನಾಂಕ");
  expect(body).toContain("ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಮಂಜೂರಾಗುವುದಿಲ್ಲ");
  const changed = kannadaCommunityPlanIntroduction({
    ...SCHEME_DEFAULTS,
    annualMembershipFeePaise: 40000,
  });
  expect(changed.body).toContain("₹400");
  expect(changed.body).not.toContain("₹369");
});
