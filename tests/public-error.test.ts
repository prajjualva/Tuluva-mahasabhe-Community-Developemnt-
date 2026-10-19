import { describe, expect, it } from "vitest";
import { publicErrorMessage } from "../src/server/http/public-error";
describe("API error allowlisting", () => {
  it("preserves selected business guidance without leaking provider or database internals", () => {
    expect(publicErrorMessage(new Error("Due is not payable"), "Request denied")).toBe(
      "Due is not payable",
    );
    expect(
      publicErrorMessage(
        new Error("Prisma failed at postgresql://credential@host secret-token"),
        "Request denied",
      ),
    ).toBe("Request denied");
    expect(publicErrorMessage(new Error("User supplied HTML <script>"), "Request denied")).toBe(
      "Request denied",
    );
  });
});
