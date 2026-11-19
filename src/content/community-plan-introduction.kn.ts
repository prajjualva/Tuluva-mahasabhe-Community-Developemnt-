import { assertPositiveMoney } from "../domain/money";

type IntroductionSettings = {
  annualMembershipFeePaise: number;
  planRegistrationFeePaise: number;
  deathContributionPaise: number;
  supportPaymentPaise: number;
  initialWaitingMonths: number;
  planPaymentDueDays: number;
};

const money = (paise: number) => {
  assertPositiveMoney(paise);
  const remainder = paise % 100;
  return (
    "₹" +
    Math.floor(paise / 100).toLocaleString("en-IN") +
    (remainder ? "." + remainder.toString().padStart(2, "0") : "")
  );
};

export function kannadaCommunityPlanIntroduction(settings: IntroductionSettings) {
  return {
    title: "ತುಳುವ ಮಹಾಸಭೆ: ಸಮುದಾಯ ಸಹಾಯ ಯೋಜನೆಯ ಪರಿಚಯ",
    body: [
      "Tuluva Mahasabhe — community development program of Tuluworld Foundation",
      "ನಮ್ಮ ಸಮುದಾಯದ ಕುಟುಂಬಗಳಿಗೆ ಕಷ್ಟದ ಸಮಯದಲ್ಲಿ ಜೊತೆ ನಿಲ್ಲುವ ಉದ್ದೇಶದಿಂದ ಸಮುದಾಯ ಸಹಾಯ ಯೋಜನೆಯನ್ನು ಪರಿಚಯಿಸುತ್ತಿದ್ದೇವೆ. ಸದಸ್ಯತ್ವ, ಕೊಡುಗೆಗಳು, ದಾಖಲೆ ಪರಿಶೀಲನೆ ಮತ್ತು ಸಹಾಯದ ನಿರ್ಧಾರಗಳನ್ನು ಸ್ಪಷ್ಟ ನಿಯಮಗಳು ಹಾಗೂ ಲೆಕ್ಕಪತ್ರಗಳೊಂದಿಗೆ ನಿರ್ವಹಿಸುವುದು ಈ ಯೋಜನೆಯ ಉದ್ದೇಶ.",
      "ಈ ಯೋಜನೆ ಏಕೆ ಬೇಕು?",
      "ಕುಟುಂಬದಲ್ಲಿ ಒಬ್ಬರನ್ನು ಕಳೆದುಕೊಂಡಾಗ ಭಾವನಾತ್ಮಕ ನೋವಿನ ಜೊತೆಗೆ ಆರ್ಥಿಕ ಹೊರೆ ಕೂಡ ಎದುರಾಗಬಹುದು. ಇಂತಹ ಸಂದರ್ಭಗಳಲ್ಲಿ ಸಮುದಾಯ ಒಟ್ಟಾಗಿ ಬೆಂಬಲ ನೀಡಲು, ಪ್ರತಿ ಕೊಡುಗೆಗೆ ದಾಖಲೆ ಇರಲು ಮತ್ತು ನೆರವಿನ ಅರ್ಜಿಗಳನ್ನು ಜವಾಬ್ದಾರಿಯಿಂದ ಪರಿಶೀಲಿಸಲು ಈ ವ್ಯವಸ್ಥೆ ಸಹಾಯ ಮಾಡುತ್ತದೆ.",
      "ಸದಸ್ಯತ್ವ ಮತ್ತು ಯೋಜನೆಗೆ ನೋಂದಣಿ",
      `ವಾರ್ಷಿಕ ಸದಸ್ಯತ್ವ ಶುಲ್ಕ ${money(settings.annualMembershipFeePaise)}. ಸಮುದಾಯ ಸಹಾಯ ಯೋಜನೆಗೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಿದ ನಂತರ ಸಂಯೋಜಕರು ಮತ್ತು ಆಡಳಿತದ ಅನುಮೋದನೆ ಅಗತ್ಯ. ಅನುಮೋದನೆಯ ನಂತರ ಯೋಜನೆಯ ${money(settings.planRegistrationFeePaise)} ನೋಂದಣಿ ಶುಲ್ಕವನ್ನು ನೀಡಲಾದ ${settings.planPaymentDueDays} ದಿನಗಳ ಗಡುವಿನೊಳಗೆ ಪಾವತಿಸಬೇಕು. ಯೋಜನೆ ಮೊದಲ ಬಾರಿಗೆ ಸಕ್ರಿಯವಾದಾಗ ${settings.initialWaitingMonths} ತಿಂಗಳ ಆರಂಭಿಕ ಕಾಯುವ ಅವಧಿ ಅನ್ವಯಿಸುತ್ತದೆ.`,
      "ಸಮುದಾಯದ ಕೊಡುಗೆ ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ?",
      `ಮರಣ ಸಹಾಯ ಕಾರ್ಯಕ್ರಮವನ್ನು ಅನುಮೋದಿಸಿ ಪ್ರಕಟಿಸಿದಾಗ, ಆ ಕಾರ್ಯಕ್ರಮ ರಚನೆಯ ಸಮಯದಲ್ಲಿ ಈಗಾಗಲೇ ಸದಸ್ಯರಾಗಿದ್ದ ಸಂಬಂಧಿತ ಸದಸ್ಯರಿಗೆ ${money(settings.deathContributionPaise)} ಕೊಡುಗೆ ಬಾಕಿ ಸೃಷ್ಟಿಯಾಗುತ್ತದೆ. ನಿಷ್ಕ್ರಿಯ ಸದಸ್ಯರಿಗೂ ಈ ಬಾಕಿ ಅನ್ವಯಿಸುತ್ತದೆ. ಕಾರ್ಯಕ್ರಮ ರಚನೆಯ ನಂತರ ಹೊಸದಾಗಿ ಸೇರುವ ಸದಸ್ಯರಿಗೆ ಆ ಹಿಂದಿನ ಕಾರ್ಯಕ್ರಮದ ಬಾಕಿ ವಿಧಿಸಲಾಗುವುದಿಲ್ಲ.`,
      "ಸಹಾಯದ ಅರ್ಹತೆ",
      `ನಿಜವಾದ ಮರಣದ ದಿನಾಂಕದಲ್ಲಿದ್ದ ಸದಸ್ಯತ್ವ ಮತ್ತು ಯೋಜನೆಯ ಇತಿಹಾಸ, ಕಾಯುವ ಅವಧಿ, ನಾಮನಿರ್ದೇಶಿತ ವ್ಯಕ್ತಿಯ ವಿವರಗಳು ಹಾಗೂ ಅಗತ್ಯ ದಾಖಲೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ ${money(settings.supportPaymentPaise)} ಸಮುದಾಯ ಸಹಾಯದ ಕುರಿತು ನಿರ್ಧಾರ ಕೈಗೊಳ್ಳಲಾಗುತ್ತದೆ. ನೋಂದಣಿ ಅಥವಾ ಪಾವತಿ ಮಾಡಿದ ಮಾತ್ರಕ್ಕೆ ಸಹಾಯ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಮಂಜೂರಾಗುವುದಿಲ್ಲ.`,
      "ಬಾಕಿ ಮತ್ತು ಮರುಸಕ್ರಿಯಗೊಳಿಸುವಿಕೆ",
      `ನಿಷ್ಕ್ರಿಯ ಸ್ಥಿತಿಯಲ್ಲಿ ಒಂದು ${money(settings.deathContributionPaise)} ಕೊಡುಗೆ ಪಾವತಿಸಿದ ಮಾತ್ರಕ್ಕೆ ಸದಸ್ಯತ್ವ ಮತ್ತೆ ಸಕ್ರಿಯವಾಗುವುದಿಲ್ಲ. ಎಲ್ಲಾ ಬಾಕಿಗಳನ್ನು ಮತ್ತು ಪ್ರಸ್ತುತ ${money(settings.annualMembershipFeePaise)} ಸದಸ್ಯತ್ವ ಪಾವತಿಯನ್ನು ಪೂರ್ಣಗೊಳಿಸಿ ಮರುಸಕ್ರಿಯಗೊಳಿಸುವ ಕ್ರಮ ಅನುಸರಿಸಬೇಕು. ಸಾಮಾನ್ಯ ಮರುಸಕ್ರಿಯಗೊಳಿಸುವಿಕೆಗೆ ಮತ್ತೊಮ್ಮೆ ${money(settings.planRegistrationFeePaise)} ನೋಂದಣಿ ಶುಲ್ಕ ಬೇಕಾಗುವುದಿಲ್ಲ. ಮುಚ್ಚಲ್ಪಟ್ಟ ಸದಸ್ಯತ್ವವನ್ನು ಆಡಳಿತ ಮರುತೆರೆದರೆ ಹೊಸ ಯೋಜನೆ ನೋಂದಣಿಯ ನಿಯಮಗಳು ಅನ್ವಯಿಸುತ್ತವೆ.`,
      `ಸಂಯೋಜಕರಿಗೆ ${money(settings.annualMembershipFeePaise)} ಸದಸ್ಯತ್ವ ಮತ್ತು ${money(settings.planRegistrationFeePaise)} ನೋಂದಣಿ ಶುಲ್ಕದ ವಿನಾಯಿತಿ ಅನ್ವಯಿಸುತ್ತದೆ. ${money(settings.deathContributionPaise)} ಕಾರ್ಯಕ್ರಮದ ಕೊಡುಗೆಗಳು ಮುಂದುವರಿಯುತ್ತವೆ.`,
      "ಆ್ಯಪ್‌ನಲ್ಲಿ ಎಲ್ಲಿದೆ?",
      "ಮೆನು ತೆರೆಯಿರಿ. ಸದಸ್ಯತ್ವ ಮತ್ತು ಯೋಜನೆಯ ಸ್ಥಿತಿಯನ್ನು ಸಂಬಂಧಿತ ಪುಟಗಳಲ್ಲಿ ನೋಡಿ. ಬಾಕಿಗಳಿಗಾಗಿ Dues, ಪಾವತಿ ದಾಖಲೆ ಮತ್ತು ರಸೀದಿಗಳಿಗಾಗಿ Payments & receipts, ನಿಮ್ಮ ವಿವರ ಮತ್ತು ಫೋಟೋಗಾಗಿ Profile ಆಯ್ಕೆಮಾಡಿ. ಸಂದೇಹಗಳಿಗೆ ನಿಮ್ಮ ಸಂಯೋಜಕರನ್ನು ಸಂಪರ್ಕಿಸಿ ಅಥವಾ Member guide ಓದಿ. ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ಅಥವಾ ಪರಿಶೀಲನಾ ಕೋಡ್ ಅನ್ನು ಯಾರೊಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ.",
      "ಒಬ್ಬರ ಕಷ್ಟದಲ್ಲಿ ಮತ್ತೊಬ್ಬರು ಜೊತೆ ನಿಲ್ಲೋಣ. ಜವಾಬ್ದಾರಿಯುತ ಕೊಡುಗೆಗಳ ಮೂಲಕ ನಮ್ಮ ಸಮುದಾಯವನ್ನು ಬಲಪಡಿಸೋಣ.",
    ].join("\n\n"),
  };
}
