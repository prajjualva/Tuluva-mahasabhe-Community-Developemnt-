# Stakeholder presentation

Open `/demo` on the development server. The small top-bar label identifies simulated payments; the rest of the interface uses realistic community content.

This is a separate browser-local presentation simulator, not a payment provider, database seed, integration test, or evidence that money has been collected. It never calls production payment, wallet, receipt, membership or event APIs. The sample people, news and opening wallet balance are fictional. Aggregate contributed/remaining figures are intentionally omitted from demo event cards; members see only their own contribution status. Live public event counts are separately calculated from persistent dues.

## Walkthrough

1. Choose Member, Coordinator or Admin on the demo login screen. These are separate presentation roles, not real authenticated accounts. The Member menu contains no Admin or Coordinator functions. Sign out / switch demo login to change roles without resetting the shared presentation data.
2. As Member, open Support events to see three remembrance notices and your own contribution status. In Payments, pay one event, the oldest contribution, or all outstanding dues in one checkout. Wallet-first allocates regular dues without partial wallet splits; plan registration supports wallet plus online. Bulk success creates individual receipts. A failed bulk attempt changes no dues or wallet balance.
3. Inspect the changed personal status, outstanding dues, wallet movements, receipts and inbox. Sign into the Admin demo separately to inspect payment activity.
4. Add funds in Wallet; inspect the credit and receipt. A plan payment can combine wallet and online; normal dues use one source.
5. In the Coordinator login, recommend the plan from Plan reviews. Switch to Admin, approve it from Plan approvals, then switch back to Member to pay registration. Members cannot approve their own plans; Coordinators cannot perform the Admin approval. Inspect the initial waiting-period state after payment.
6. Open full news articles, post comments, open notifications, and add referral introductions.
7. Use Reset demo data → Reset demo only after the presentation. This removes only the `csf:stakeholder-demo:v1` localStorage entry on this origin and returns sample data to its initial state. It does not touch the database, real users, sessions, records, or any other storage key. Repeat in another browser/origin if the demo was used there.

The route and presentation links are disabled in production. Payment receipts are explicitly marked DEMO and are not valid financial receipts. No automatic timed cleanup is used, so a stakeholder's presentation cannot unexpectedly reset itself.

## Shareable static hosting

Public stakeholder demo: https://tuluva-mahasabhe.vercel.app/ (Vercel project `tuluva-mahasabhe`, Hobby workspace `tuluworld`). Deployed by uploading the allowlisted static export, not importing the live repository. No GitHub auto-deployment is configured; future demo updates require a fresh export and deployment.

Run `node scripts/build-shareable-demo.mjs` to create `.stakeholder-export/out`. Upload only that output folder to a separate static Vercel project. The exporter copies an explicit list of demo UI, fictional data and images, builds without the live application's environment, and checks the output for common credential patterns. No Prisma, server services, API routes, real records or `.env` files are copied. The live app's production demo-denial guard remains unchanged.

The hosted demo uses password-free demo role logins. The selected role is stored only in sessionStorage key `csf:stakeholder-role:v1`. This is presentation separation, not security for real data; production authentication and authorization remain server-backed and separate. State is browser-local, not shared between stakeholders. Reset only clears that visitor's generated demo state. The hosted interface has no live-member-portal link. Search indexing is disabled. This is a public fictional presentation, not a production launch.

For a same-project browser update, zip the contents of `.stakeholder-export/out` and drop the ZIP onto the existing Vercel project overview, then review and confirm the deployment. `.stakeholder-export/demo-role-update.zip` is the prepared role-separated update. Do not upload the workspace or `.env`.

## Portrait assets

Generated using the built-in image-generation tool and saved in `public/demo/fictional-member.png`, `public/demo/fictional-member-woman.png` and `public/demo/fictional-member-suresh.png`. All three were visually inspected.

Prompt 1: fictional South Indian man, approximately 65, salt-and-pepper hair and moustache, cream shirt, dignified expression, head-and-shoulders square portrait, soft daylight, muted green garden background, no text/logo/watermark, no real deceased identity.

Prompt 2: fictional South Indian woman, approximately 68, grey hair tied back, cream and muted burgundy sari, dignified expression, head-and-shoulders square portrait, soft daylight, muted green garden background, no text/logo/watermark, no real deceased identity.

Prompt 3: fictional South Indian man around 58, short dark hair with slight grey, neat moustache, light blue shirt, dignified expression, head-and-shoulders square portrait, soft daylight, muted green garden background, different identity from other sample portraits, no text/logo/watermark, no real deceased identity.
