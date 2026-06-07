import { describe, expect, it } from "vitest";
import { extractPublicEmails, validateProfileEmail } from "@/src/safety/public-email";

describe("public email extraction", () => {
  it("rejects guessed or unlabeled email-like strings", () => {
    expect(
      extractPublicEmails(
        "The maintainer is Jane Doe. jane@company.dev",
        "https://github.com/acme/project#readme",
        "repository_readme",
      ),
    ).toEqual([]);
  });

  it("accepts explicitly public professional contact evidence", () => {
    const results = extractPublicEmails(
      "For business inquiries, contact team@acme.dev.",
      "https://acme.dev/contact",
      "official_website",
    );
    expect(results[0]?.email).toBe("team@acme.dev");
    expect(results[0]?.sourceUrl).toBe("https://acme.dev/contact");
  });

  it("rejects placeholder and noreply profile addresses", () => {
    expect(validateProfileEmail("user@users.noreply.github.com", "https://github.com/user")).toBeNull();
    expect(validateProfileEmail("name@example.com", "https://github.com/user")).toBeNull();
  });
});
