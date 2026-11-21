# Tuluva Mahasabhe Android release

Package name is org.tuluworld.communitysupport. The first signed bundle, version code 1 and version name 1.0.0, is active on the internal testing track. The application opens the production portal through a Trusted Web Activity.

The updated bundle is version code **2**, version name **1.0.1**. It uses the Tuluva Mahasabhe launcher name and the supplied emblem. It has been built in CI, signed with the existing upload key and validated with bundletool. Its local handoff file is `C:/Users/Admin/Downloads/Tuluva-Mahasabhe-internal-v2.aab`. On 21 November, Play accepted this bundle and the release **Tuluva Mahasabhe 1.0.1** was published to the existing Internal testing track. Console explicitly showed **Available to internal testers**. It is not a public production release.

## Verified release progress — 21 November 2026

- Retrieved the official public app-signing certificate archive from this application's Play Console signing page. Verified the legacy certificate fingerprint against the package-specific Digital Asset Links statement shown by Play. Configured all three certificate fingerprints (legacy, hybrid classical and hybrid post-quantum) in Vercel Production as `ANDROID_PLAY_SIGNING_SHA256`.
- Promoted deployment `dpl_b7tGZgRrACoPK9fwfVhpGNEkwBZD`. The live `/.well-known/assetlinks.json` returns HTTP 200 with `org.tuluworld.communitysupport` and three certificate fingerprints. Google's Digital Asset Links API independently returned three matching statements. The Play-installed app still needs an Android-device check after refreshing/reopening it.
- Uploaded and published version code 2 / version 1.0.1 to Internal testing with the new launcher branding and release notes. The existing tester list and package remain in use. Public access remains inactive.
- Saved the live privacy-policy URL and the default store listing (new name, original supplied emblem, feature graphic and two isolated-data UI screenshots). The feature graphic carries the AI-assisted asset label; the supplied emblem and direct UI captures were not labeled as generated artwork. Listing changes are ready to send for review, not approved or public.
- Saved declarations for no ads, no advertising ID, non-government app and no health features. After the owner explicitly approved IARC terms, completed and saved the content-rating questionnaire: user interaction and remotely published content disclosed, with moderated comments. These saved changes still need submission through Publishing overview.
- Created the owner-approved dedicated reviewer Member through the normal persistent registration service, using owner-supplied Foundation contact details and the existing active referring Coordinator. Verified password login and Member profile/dues/wallet/receipt APIs return 200; Admin payments returns 403. No payments, receipts, paid entitlement or wallet credits were fabricated. Credentials are kept only in a protected local handoff, not this repository.
- Reviewer sign-in details are entered privately in Google's form but **not saved**: Google requires a full-access attestation, and the initial Add attempt returned a validation error. Resolve the scope of reviewer access and paid/staff workflows honestly before making that attestation; do not grant access to real members' private financial data merely to satisfy the form. Audience 18+ is owner-confirmed but its form remains blocked by incomplete sign-in details.
- Saved a **draft**, not a submitted declaration, for financial features: mobile payments/digital wallets and community crowdfunding are proposed classifications pending owner/policy review. The documentation step currently asks for no additional uploads; this does not establish that a Personal account is appropriate. Google's organization-account requirements for financial services must be resolved before public submission. See https://support.google.com/googleplay/android-developer/answer/13634885.
- Saved a partial Data safety draft with collection, transport encryption, password/OTP sign-in and the live account-deletion request URL. Initial data types include identity/contact details, payment/bank and transaction records, profile photos, evidence files, interactions and community content. Per-type handling, provider SDK disclosures and any health-related evidence/technical identifiers still require review; no completed Data safety declaration is claimed.
- Release review identified a source follow-up: users can post comments and staff can moderate them, but member-facing reporting and blocking controls were not found. Assess and implement the applicable UGC safeguards before public release; the rating questionnaire does not claim that those controls already exist.
- Console confirms zero Closed testing testers opted in and requires at least 12 opted-in testers continuously for 14 days before applying for production access on this Personal account.
- The security-patched Next.js 15.5.29 / Prisma configuration dependencies passed all 319 isolated CI tests and the production build, with zero known vulnerabilities in full-tree and production-only npm audits. A separate browser regression run passed the Member, Coordinator and Admin workflows. The CI workflow now checks npm audit explicitly.

The 20 November notes below remain historical evidence; the signing-association and version 2 upload blockers recorded there are now resolved.

## Verified release state — 20 November 2026

- Production serves the new name, supplied logo, privacy notice and account-deletion request page. The full program name appears in descriptive branding; the shorter Play title is **Tuluva Mahasabhe**.
- Commit `0989380` passed all **319 automated tests**, including database integration tests on disposable PostgreSQL, type checking, ESLint, Prettier, Prisma schema validation and production build. Separate mobile browser checks passed for Member/Coordinator/Admin destinations, return navigation, role-restricted guides, photo upload, dues layout, downloadable front/back ID cards and deletion-request submission/cancellation. Synthetic browser records were confined to a disposable database that was removed afterward.
- The public events API responds successfully. Anonymous access to Member receipts and Admin payments is denied; unauthenticated job requests are denied. These spot checks supplement, rather than replace, the automated authorization suite.
- Vercel reports all five daily cron definitions enabled on the promoted production deployment. Available request logs show scheduler-originated HTTP 200 responses for due reminders, cash reconciliation and notification delivery on 20 November. The other two definitions are enabled; their last runs fell outside the free request-log window inspected. No paid observability add-on was enabled.
- Production contains two pending online payments and no successful payment, receipt or processed payment webhook. Read-only Razorpay order checks confirm zero paid amount on both orders: the plan registration order has not been attempted; the annual membership order has been attempted but remains unpaid. This does not demonstrate a webhook fault, successful live capture, refund or bank settlement.
- Three queued email deliveries have recorded provider acceptance. Acceptance is not proof of inbox placement. Phone/SMS verification remains disabled for the agreed email-only pilot.
- The live Android association endpoint still returns 404 because `ANDROID_PLAY_SIGNING_SHA256` is not configured. Obtain the public **app signing** certificate fingerprint(s) from Google Play; do not substitute the local upload certificate. No private key needs to be shared.
- The connected-mailbox search found no recent response for D-U-N-S reference `DR111620263691302308`. This does not establish the contents of any other mailbox or the provider's review status.

The website is deployed. These checks do not constitute public Google Play approval, a completed live-money acceptance test, backup restoration or independent security acceptance.

## Next Play Console steps

1. On an Android phone, update to the available Internal testing release, close/reopen it, and verify launcher branding, navigation and website association. The certificate configuration and Google verification are complete; actual Android-device behavior is a separate acceptance check.
2. Version 2 is published to Internal testing as **Tuluva Mahasabhe 1.0.1** with these notes:

   ```text
   <en-GB>
   Updated Tuluva Mahasabhe name and emblem.
   Improved mobile navigation and role-specific guides.
   Added profile photos and downloadable member ID cards.
   Added a Kannada introduction to the Community Support Plan.
   Added privacy information and account-deletion requests.
   </en-GB>
   ```

3. Update the store listing using the copy below and the files in `C:/Users/Admin/Downloads/Tuluva-Mahasabhe-Play-Store`. The two phone screenshots use synthetic data from an isolated environment; never replace them with real members' private records.
4. Complete **App content**: privacy policy, app access, ads, content rating, target audience, Data safety and applicable financial-features declarations. Review the actual app and provider behavior before making declarations. Do not declare that financial functionality is absent merely because this is a community service. Give reviewers a dedicated, working Member account with the required access; never supply the Foundation Admin password.
5. Complete the required account/app setup and create a **Closed testing** release if the account remains Personal. Recruit at least 12 genuine testers, have them opt in continuously for 14 days, collect feedback and apply for production access when Console permits it. An Internal testing opt-in does not start the Closed testing requirement.

## Tester acceptance notes

Testers should record the Android version, app version, screen, exact steps and expected/actual result. Remove passwords, codes, bank details, private documents and other members' information from screenshots.

- Sign in, close/reopen the app and confirm the correct workspace returns.
- Open support events, About and the guide; use the logo and dashboard links to return. Confirm a Member cannot open staff-only guides or APIs.
- Check profile details, upload a suitable profile photo, and download the ID card. Check the name, phone, address, designation and validity against the actual account.
- Check dues, plan state, payment history, receipts and wallet activity. Do not invent live payments or credits. A designated owner performs the controlled real-money test separately; record the capture, webhook, receipt, ledger, any refund and bank settlement evidence together.
- Read Kannada community news and check notification readability. Check email inbox delivery separately from provider acceptance.
- Report genuine defects and verify fixes while remaining opted in. Keep a feedback record for the production-access application.

## Listing copy

App name

Tuluva Mahasabhe

Short description

Membership, contributions and community updates from Tuluworld Foundation.

Full description

Tuluva Mahasabhe community development program of Tuluworld Foundation brings Foundation membership and community services into one place.

Members can view their membership and Community Support Plan status, see contribution dues, access payment history and official receipts, and review Foundation Wallet activity. Members can maintain their profile and nominees, add a profile photo and download their member ID card.

Read approved Death Support Events, community news and private Foundation notifications. Contact your assigned Coordinator and follow the steps relevant to your membership through the Member Guide.

Coordinator and Admin workspaces provide authorized review, approval and reconciliation tools. Access depends on the permissions assigned by the Foundation.

Community support follows the Foundation's membership and plan rules, including eligibility checks and review. Membership or payment alone does not guarantee a support payment.

Support contact is tuluworld@gmail.com.

## Public links

- Application https://tuluva-mahasabhe.vercel.app/
- Privacy policy https://tuluva-mahasabhe.vercel.app/privacy
- Account deletion requests https://tuluva-mahasabhe.vercel.app/delete-account
- Organization https://www.tuluworld.org.in/

## Data safety preparation

The developer must review these declarations against the current providers and data handling before submitting the Play form.

- Account data includes name, email, phone, address, membership and Coordinator relationships.
- Financial data includes dues, payment references/history, wallet activity, receipts and support-case bank data.
- Optional photos are used for profiles and downloaded membership ID cards.
- Nominee and support workflows may process identity/support documents and incident data.
- User-generated content includes condolences and community news comments.
- Authentication, abuse prevention and audit records support account security and service operations.
- Vercel, Neon, AWS, Resend and Razorpay process their respective service data. Determine the applicable Play service-provider exception for each relationship when completing the sharing questions.
- Email-only pilot disables SMS verification. SMS production credentials and any India sender/template registration are pending.
- Account deletion initiation is supported through the website and in-app Profile links. Requests are durable, owner-scoped and auditable, with an Admin review queue. Actual fulfillment and record-specific retention decisions require Foundation privacy operations. The software does not claim a completed deletion merely because a request was recorded.

## Remaining owner/provider work

- Check the Play-installed Android app against the now-verified live website association and version 1.0.1 internal release.
- D-U-N-S application reference DR111620263691302308 is pending. Verify organization status and the developer account conversion with Google when the number is available.
- The Personal account's production-access requirements must be checked in Play Console. Internal testers do not satisfy the separate closed testing requirement. The current rule for new Personal accounts requires 12 opted-in testers for 14 continuous days before applying for production access.
- Complete Play Console store assets, content rating, app-access instructions, Data safety and applicable financial-features declarations. Confirm Google's classification of the Foundation plan, contributions and wallet before public submission.
- Perform a controlled real gateway collection, receipt/webhook/ledger reconciliation, refund and bank settlement check with the account owner.
- Review and approve actual data retention periods and the deletion fulfillment process. Record security acceptance, operational monitoring, backup restoration and encryption/upload-key recovery evidence.
- Back up the upload keystore and recovery material in Foundation-controlled secure storage.

Official references

- https://support.google.com/googleplay/android-developer/answer/13327111
- https://support.google.com/googleplay/android-developer/answer/9842756
- https://support.google.com/googleplay/android-developer/answer/14151465
