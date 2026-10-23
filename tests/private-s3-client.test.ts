import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), provider: vi.fn(), credentials: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(options: unknown) {
      mocks.client(options);
    }
  },
}));
vi.mock("@vercel/oidc-aws-credentials-provider", () => ({
  awsCredentialsProvider: mocks.provider,
}));
import { createPrivateS3Client } from "../src/server/documents/private-s3-client";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("private S3 workload credentials", () => {
  it("uses short-lived role credentials without copying environment keys into the client", () => {
    vi.stubEnv("AWS_ROLE_ARN", "arn:aws:iam::123456789012:role/private-documents");
    vi.stubEnv("AWS_REGION", "ap-south-2");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "must-not-use-this-key");
    mocks.provider.mockReturnValue(mocks.credentials);
    createPrivateS3Client(3);
    expect(mocks.provider).toHaveBeenCalledWith({
      roleArn: "arn:aws:iam::123456789012:role/private-documents",
      roleSessionName: "tuluva-private-documents",
      durationSeconds: 900,
      clientConfig: { region: "ap-south-2", maxAttempts: 2 },
    });
    expect(mocks.client).toHaveBeenCalledWith({
      region: "ap-south-2",
      maxAttempts: 3,
      credentials: mocks.credentials,
    });
  });
  it("refuses missing Vercel roles rather than falling back to permanent keys", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("AWS_ROLE_ARN", "");
    expect(() => createPrivateS3Client(2)).toThrow("role is required");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects invalid roles without exposing their contents", () => {
    vi.stubEnv("AWS_ROLE_ARN", "private-invalid-role-value");
    expect(() => createPrivateS3Client(2)).toThrow(/^Private storage workload role is invalid$/);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("retains the AWS SDK local workload credential chain outside Vercel", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("AWS_ROLE_ARN", "");
    vi.stubEnv("AWS_REGION", "ap-south-2");
    createPrivateS3Client(2);
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.client).toHaveBeenCalledWith({ region: "ap-south-2", maxAttempts: 2 });
  });
});
