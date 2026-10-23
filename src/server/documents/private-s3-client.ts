import { S3Client } from "@aws-sdk/client-s3";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

/** Shared by request-time document storage and the read-only deployment gate. */
export function createPrivateS3Client(maxAttempts: number) {
  const roleArn = process.env.AWS_ROLE_ARN;
  if (roleArn && !/^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]+$/.test(roleArn))
    throw new Error("Private storage workload role is invalid");
  if (process.env.VERCEL === "1" && !roleArn)
    throw new Error("Private storage workload role is required on Vercel");
  return new S3Client({
    region: process.env.AWS_REGION,
    maxAttempts,
    // A configured workload role never silently falls back to permanent keys.
    ...(roleArn
      ? {
          credentials: awsCredentialsProvider({
            roleArn,
            roleSessionName: "tuluva-private-documents",
            durationSeconds: 900,
            clientConfig: { region: process.env.AWS_REGION, maxAttempts: 2 },
          }),
        }
      : {}),
  });
}
