/**
 * Shared fast-check arbitraries for the email-automation test suite.
 * Import these in both unit and property tests.
 */
import * as fc from "fast-check";
import { Campaign, RecipientList } from "../src/models";

// ─── Email arbitraries ────────────────────────────────────────────────────────

/** Generates valid RFC 5322-style email addresses. */
export const arbitraryEmail = (): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.stringMatching(/^[a-z][a-z0-9._-]{0,30}[a-z0-9]$/),
      fc.stringMatching(/^[a-z][a-z0-9-]{1,20}[a-z0-9]$/),
      fc.constantFrom("com", "org", "net", "io", "dev", "co.uk")
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/**
 * Generates strings that look like emails but are invalid
 * (missing @, missing domain, double dots, etc.).
 */
export const arbitraryMalformedEmail = (): fc.Arbitrary<string> =>
  fc.oneof(
    // Missing @
    fc.stringMatching(/^[a-z]{3,10}[a-z]{3,10}\.[a-z]{2,4}$/),
    // Missing domain
    fc.string({ minLength: 1, maxLength: 15 }).map((s) => `${s}@`),
    // Missing local part
    fc.stringMatching(/^@[a-z]{3,10}\.[a-z]{2,4}$/),
    // Double dots in local
    fc.stringMatching(/^[a-z]{2,5}\.\.[a-z]{2,5}@[a-z]{3,8}\.[a-z]{2,4}$/),
    // Spaces inside
    fc.string({ minLength: 1, maxLength: 8 }).map((s) => `${s} @example.com`),
    // Plain random string (no @ at all)
    fc.string({ minLength: 3, maxLength: 30 }).filter((s) => !s.includes("@"))
  );

// ─── Campaign arbitrary ───────────────────────────────────────────────────────

/** Generates a Campaign with all required fields populated. */
export const arbitraryCampaign = (): fc.Arbitrary<Omit<Campaign, "id" | "createdAt" | "sentAt">> =>
  fc.record({
    senderID: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 80 }),
    subject: fc.string({ minLength: 1, maxLength: 120 }),
    body: fc.string({ minLength: 1, maxLength: 2000 }),
    listID: fc.uuid(),
    status: fc.constantFrom("Draft" as const, "Sending" as const, "Sent" as const),
  });

// ─── RecipientList arbitrary ──────────────────────────────────────────────────

/**
 * Generates a RecipientList with `n` unique valid email addresses.
 * If `n` is omitted, a random count between 1 and 20 is used.
 */
export const arbitraryRecipientList = (
  n?: number
): fc.Arbitrary<Omit<RecipientList, "id" | "createdAt" | "updatedAt">> => {
  const emailsArb =
    n !== undefined
      ? fc.uniqueArray(arbitraryEmail(), { minLength: n, maxLength: n })
      : fc.uniqueArray(arbitraryEmail(), { minLength: 1, maxLength: 20 });

  return fc.record({
    senderID: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 60 }),
    emails: emailsArb,
  });
};

// ─── CSV buffer arbitrary ─────────────────────────────────────────────────────

/**
 * Generates a CSV Buffer with a mix of valid and invalid email rows.
 * Each row has the shape: email,name
 */
export const arbitraryCSVBuffer = (): fc.Arbitrary<Buffer> =>
  fc
    .array(
      fc.oneof(
        // Valid row
        fc
          .tuple(arbitraryEmail(), fc.string({ minLength: 0, maxLength: 20 }))
          .map(([email, name]) => `${email},${name}`),
        // Invalid row
        arbitraryMalformedEmail().map((bad) => `${bad},SomeName`)
      ),
      { minLength: 1, maxLength: 30 }
    )
    .map((rows) => {
      const csv = ["email,name", ...rows].join("\n");
      return Buffer.from(csv, "utf-8");
    });

// ─── Token arbitrary ──────────────────────────────────────────────────────────

/**
 * Generates a random hex string that is NOT a valid token
 * (used for invalid-token testing).
 */
export const arbitraryToken = (): fc.Arbitrary<string> =>
  fc
    .uint8Array({ minLength: 8, maxLength: 64 })
    .map((bytes) => Buffer.from(bytes).toString("hex"));

// ─── Answer arbitrary ─────────────────────────────────────────────────────────

/** Generates one of the two valid RSVP answers. */
export const arbitraryAnswer = (): fc.Arbitrary<"Coming" | "Not Coming"> =>
  fc.constantFrom("Coming" as const, "Not Coming" as const);
