import { RecipientListServiceImpl } from "../../src/services/RecipientListService";
import { ValidationError, NotFoundError } from "../../src/services/errors";

describe("RecipientListService", () => {
  let svc: RecipientListServiceImpl;

  beforeEach(() => {
    svc = new RecipientListServiceImpl();
  });

  // ── validateEmail ─────────────────────────────────────────────────────────

  describe("validateEmail", () => {
    it("accepts a standard valid email", () => {
      expect(svc.validateEmail("user@example.com")).toBe(true);
    });

    it("accepts email with subdomain", () => {
      expect(svc.validateEmail("user@mail.example.co.uk")).toBe(true);
    });

    it("rejects missing @", () => {
      expect(svc.validateEmail("userexample.com")).toBe(false);
    });

    it("rejects missing domain", () => {
      expect(svc.validateEmail("user@")).toBe(false);
    });

    it("rejects missing local part", () => {
      expect(svc.validateEmail("@example.com")).toBe(false);
    });

    it("rejects double dots in local part", () => {
      expect(svc.validateEmail("us..er@example.com")).toBe(false);
    });

    it("rejects spaces inside", () => {
      expect(svc.validateEmail("us er@example.com")).toBe(false);
    });

    it("rejects plain string with no @", () => {
      expect(svc.validateEmail("notanemail")).toBe(false);
    });
  });

  // ── createList ────────────────────────────────────────────────────────────

  describe("createList", () => {
    it("creates a list with valid emails", async () => {
      const list = await svc.createList("sender-1", "My List", ["a@example.com", "b@example.com"]);
      expect(list.emails).toHaveLength(2);
      expect(list.senderID).toBe("sender-1");
      expect(list.createdAt).toBeInstanceOf(Date);
    });

    it("deduplicates emails on creation", async () => {
      const list = await svc.createList("sender-1", "Dupes", [
        "a@example.com",
        "A@example.com",
        "a@example.com",
      ]);
      expect(list.emails).toHaveLength(1);
    });

    it("throws ValidationError for invalid email", async () => {
      await expect(
        svc.createList("sender-1", "Bad", ["notanemail"])
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("identifies the invalid address in the error", async () => {
      try {
        await svc.createList("sender-1", "Bad", ["notanemail"]);
      } catch (err) {
        expect((err as ValidationError).message).toContain("notanemail");
      }
    });
  });

  // ── addRecipients ─────────────────────────────────────────────────────────

  describe("addRecipients", () => {
    it("adds valid emails to an existing list", async () => {
      const list = await svc.createList("s1", "L", ["a@example.com"]);
      const updated = await svc.addRecipients(list.id, ["b@example.com"]);
      expect(updated.emails).toHaveLength(2);
    });

    it("deduplicates when adding existing email", async () => {
      const list = await svc.createList("s1", "L", ["a@example.com"]);
      const updated = await svc.addRecipients(list.id, ["a@example.com"]);
      expect(updated.emails).toHaveLength(1);
    });

    it("throws NotFoundError for unknown listID", async () => {
      await expect(svc.addRecipients("nonexistent", ["a@example.com"])).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it("throws ValidationError for invalid email", async () => {
      const list = await svc.createList("s1", "L", ["a@example.com"]);
      await expect(svc.addRecipients(list.id, ["bad"])).rejects.toBeInstanceOf(ValidationError);
    });
  });

  // ── removeRecipient ───────────────────────────────────────────────────────

  describe("removeRecipient", () => {
    it("removes an existing email", async () => {
      const list = await svc.createList("s1", "L", ["a@example.com", "b@example.com"]);
      const updated = await svc.removeRecipient(list.id, "a@example.com");
      expect(updated.emails).not.toContain("a@example.com");
      expect(updated.emails).toHaveLength(1);
    });

    it("is a no-op when email is not in the list", async () => {
      const list = await svc.createList("s1", "L", ["a@example.com"]);
      const updated = await svc.removeRecipient(list.id, "z@example.com");
      expect(updated.emails).toHaveLength(1);
    });

    it("throws NotFoundError for unknown listID", async () => {
      await expect(svc.removeRecipient("nonexistent", "a@example.com")).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });

  // ── importFromCSV ─────────────────────────────────────────────────────────

  describe("importFromCSV", () => {
    function csv(rows: string[]): Buffer {
      return Buffer.from(["email,name", ...rows].join("\n"), "utf-8");
    }

    it("imports valid emails from CSV", async () => {
      const buf = csv(["alice@example.com,Alice", "bob@example.com,Bob"]);
      const { list, skipped } = await svc.importFromCSV("s1", buf);
      expect(list.emails).toHaveLength(2);
      expect(skipped).toHaveLength(0);
    });

    it("skips invalid emails and reports them", async () => {
      const buf = csv(["alice@example.com,Alice", "notanemail,Bob"]);
      const { list, skipped } = await svc.importFromCSV("s1", buf);
      expect(list.emails).toHaveLength(1);
      expect(skipped).toHaveLength(1);
      expect(skipped[0].email).toBe("notanemail");
      expect(skipped[0].reason).toMatch(/invalid/i);
    });

    it("deduplicates valid emails from CSV", async () => {
      const buf = csv(["alice@example.com,Alice", "alice@example.com,Alice2"]);
      const { list } = await svc.importFromCSV("s1", buf);
      expect(list.emails).toHaveLength(1);
    });

    it("handles empty CSV (headers only)", async () => {
      const buf = Buffer.from("email,name\n", "utf-8");
      const { list, skipped } = await svc.importFromCSV("s1", buf);
      expect(list.emails).toHaveLength(0);
      expect(skipped).toHaveLength(0);
    });

    it("handles CSV with all invalid rows", async () => {
      const buf = csv(["bad1,Name1", "bad2,Name2"]);
      const { list, skipped } = await svc.importFromCSV("s1", buf);
      expect(list.emails).toHaveLength(0);
      expect(skipped).toHaveLength(2);
    });

    it("returns skipped row numbers (1-based)", async () => {
      const buf = csv(["alice@example.com,Alice", "bad,Bob", "carol@example.com,Carol"]);
      const { skipped } = await svc.importFromCSV("s1", buf);
      expect(skipped[0].row).toBe(2);
    });
  });
});
