# TuluWorld on Google Play

The Android app opens the Community Support portal through a Trusted Web Activity on Android 7.0 and later. The proposed Google Play package ID is `org.tuluworld.communitysupport`. Confirm the ID and the permanent HTTPS hostname in `app.json` before creating the first Play listing.

## Build and test

1. Run the Android bundle workflow on the release branch. It builds an unsigned Android App Bundle targeting API 36. To reproduce locally, use Node 24, JDK 17 and the Android 36 SDK. Run `npm ci` and `npm run generate` from this directory, then run `gradlew.bat :app:bundleRelease` on Windows or `bash gradlew :app:bundleRelease` on Linux from `generated/`.
2. Sign the bundle with the organization's upload key and use Play App Signing. Keep the keystore, passwords and recovery copies in protected organization storage. The CI artifact is unsigned.
3. After Google issues the Play App Signing certificate, set its public SHA-256 fingerprint as `ANDROID_PLAY_SIGNING_SHA256` on the production portal. Deploy and verify that `/.well-known/assetlinks.json` returns the package ID and the Play certificate fingerprint. Test the bundle installed from the internal testing track on an Android device.

## Before submitting for public review

- Enroll in Play Console as the organization using its verified legal name and D‑U‑N‑S number.
- Put the real portal at the permanent hostname and confirm that the Play reviewer can reach it. Provide a separate reviewer account with synthetic data and the access instructions required to exercise member workflows.
- Publish the Foundation's privacy policy and implement the account deletion request flow in the app and at a public web URL. Confirm which records the Foundation must retain and disclose why.
- Prepare listing screenshots, support details, content rating, Data safety and the applicable financial features declarations. Confirm Play's treatment of membership and contributions before enabling online payments.
- Verify email sign-in, account recovery, document access and receipt downloads on Android before requesting production review.
