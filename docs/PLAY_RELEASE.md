# Tuluva Mahasabhe Android release

Package name is org.tuluworld.communitysupport. The first signed bundle, version code 1 and version name 1.0.0, is active on the internal testing track. The application opens the production portal through a Trusted Web Activity.

The updated bundle is version code **2**, version name **1.0.1**. It uses the Tuluva Mahasabhe launcher name and the supplied emblem. It has been built in CI, signed with the existing upload key and validated with bundletool. Its local handoff file is `C:/Users/Admin/Downloads/Tuluva-Mahasabhe-internal-v2.aab`. This is a prepared artifact, not evidence that Play has received or released version 2. Upload it to a new Internal testing release without creating another package or signing key.

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

1. Open **Protected with Play → Play app signing**. Copy each relevant public SHA-256 fingerprint under **App signing key certificate**. Configure the comma-separated values as `ANDROID_PLAY_SIGNING_SHA256` in Vercel Production, deploy, and verify `/.well-known/assetlinks.json` before checking the installed app's browser bar. Include applicable older/newer device signing certificates if Play shows multiple keys.
2. Under **Internal testing → Create new release**, upload the signed version 2 bundle. Use release name `Tuluva Mahasabhe 1.0.1` and these notes:

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

- Obtain the Play app signing public SHA-256 fingerprint(s) and configure ANDROID_PLAY_SIGNING_SHA256 in Production. Validate the live association endpoint and the Play-installed app.
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
