/**
 * Smoke tests for Task 1: project structure, data models, interfaces, and generators.
 * Validates that all types, error classes, and test generators are correctly defined.
 */
import * as fc from "fast-check";
import {
  arbitraryEmail,
  arbitraryMalformedEmail,
  arbitraryCampaign,
  arbitraryRecipientList,
  arbitraryCSVBuffer,
  arbitraryToken,
  arbitraryAnswer,
} from "../generators";
import {
  ValidationError,
  NotFoundError,
  ExpiredTokenError,
  DuplicateResponseError,
} from "../../src/services/errors";

// ─── Error classes ────────────────────────────────────────────────────────────

describe("ServiceError subclasses", () => {
  it("ValidationError has kind=validation and exposes field", () => {
    const err = new ValidationError("email", "bad email", "foo@");
    expect(err.kind).toBe("validation");
    expect(err.field).toBe("email");
    expect(err.invalidValue).toBe("foo@");
    expect(err.message).toBe("bad email");
  });

  it("NotFoundError has kind=not-found and exposes resource info", () => {
    const err = new NotFoundError("Campaign", "abc-123");
    expect(err.kind).toBe("not-found");
    expect(err.resourceType).toBe("Campaign");
    expect(err.resourceId).toBe("abc-123");
  });

  it("ExpiredTokenError has kind=expired-token", () => {
    const err = new ExpiredTokenError();
    expect(err.kind).toBe("expired-token");
  });

  it("DuplicateResponseError has kind=duplicate-response", () => {
    const err = new DuplicateResponseError("user@example.com", "camp-1");
    expect(err.kind).toBe("duplicate-response");
    expect(err.recipientEmail).toBe("user@example.com");
    expect(err.campaignID).toBe("camp-1");
  });
});

// ─── Generators ───────────────────────────────────────────────────────────────

describe("arbitraryEmail", () => {
  it("produces strings containing @", () => {
    fc.assert(
      fc.property(arbitraryEmail(), (email) => {
        expect(email).toContain("@");
        const parts = email.split("@");
        expect(parts.length).toBe(2);
        expect(parts[0].length).toBeGreaterThan(0);
        expect(parts[1].length).toBeGreaterThan(0);
      }),
      { numRuns: 50 }
    );
  });
});

describe("arbitraryMalformedEmail", () => {
  it("produces strings that are not valid RFC 5322 emails", () => {
    // RFC 5322 simplified check: local@domain.tld with no consecutive dots,
    // no leading/trailing dots in local, no spaces, valid structure.
    const validEmailRe =
      /^[a-zA-Z0-9]([a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
    const hasConsecutiveDots = (s: string) => s.includes("..");
    fc.assert(
      fc.property(arbitraryMalformedEmail(), (bad) => {
        const isInvalid =
          !validEmailRe.test(bad) || hasConsecutiveDots(bad);
        expect(isInvalid).toBe(true);
      }),
      { numRuns: 50 }
    );
  });
});

describe("arbitraryCampaign", () => {
  it("produces campaigns with non-empty required fields", () => {
    fc.assert(
      fc.property(arbitraryCampaign(), (c) => {
        expect(c.name.length).toBeGreaterThan(0);
        expect(c.subject.length).toBeGreaterThan(0);
        expect(c.body.length).toBeGreaterThan(0);
        expect(c.senderID).toBeTruthy();
        expect(c.listID).toBeTruthy();
      }),
      { numRuns: 50 }
    );
  });
});

describe("arbitraryRecipientList", () => {
  it("produces lists with at least one email", () => {
    fc.assert(
      fc.property(arbitraryRecipientList(), (list) => {
        expect(list.emails.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 }
    );
  });

  it("produces lists with exactly n emails when n is specified", () => {
    fc.assert(
      fc.property(arbitraryRecipientList(5), (list) => {
        expect(list.emails.length).toBe(5);
      }),
      { numRuns: 30 }
    );
  });
});

describe("arbitraryCSVBuffer", () => {
  it("produces a Buffer starting with the header row", () => {
    fc.assert(
      fc.property(arbitraryCSVBuffer(), (buf) => {
        expect(Buffer.isBuffer(buf)).toBe(true);
        const text = buf.toString("utf-8");
        expect(text.startsWith("email,name")).toBe(true);
      }),
      { numRuns: 30 }
    );
  });
});

describe("arbitraryToken", () => {
  it("produces non-empty hex strings", () => {
    fc.assert(
      fc.property(arbitraryToken(), (tok) => {
        expect(tok.length).toBeGreaterThan(0);
        expect(/^[0-9a-f]+$/.test(tok)).toBe(true);
      }),
      { numRuns: 50 }
    );
  });
});

describe("arbitraryAnswer", () => {
  it("produces only Coming or Not Coming", () => {
    fc.assert(
      fc.property(arbitraryAnswer(), (ans) => {
        expect(["Coming", "Not Coming"]).toContain(ans);
      }),
      { numRuns: 50 }
    );
  });
});
