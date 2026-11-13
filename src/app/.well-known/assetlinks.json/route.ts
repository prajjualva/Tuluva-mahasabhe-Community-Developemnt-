import androidApp from "../../../../android/app.json";

export const dynamic = "force-dynamic";

export function GET() {
  const fingerprint = process.env.ANDROID_PLAY_SIGNING_SHA256?.trim().toUpperCase();
  if (!fingerprint || !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint)) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: androidApp.packageId,
        sha256_cert_fingerprints: [fingerprint],
      },
    },
  ]);
}
