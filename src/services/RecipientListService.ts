import { RecipientList, UUID } from "../models";
import { ValidationError, NotFoundError } from "./errors";
import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";

// RFC 5322 compliant email regex (simplified but robust)
const RFC5322_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface RecipientListService {
  createList(senderID: UUID, name: string, emails: string[]): Promise<RecipientList>;
  getList(listID: UUID): Promise<RecipientList>;
  addRecipients(listID: UUID, emails: string[]): Promise<RecipientList>;
  removeRecipient(listID: UUID, email: string): Promise<RecipientList>;
  importFromCSV(
    senderID: UUID,
    csvBuffer: Buffer
  ): Promise<{ list: RecipientList; skipped: Array<{ row: number; email: string; reason: string }> }>;
  validateEmail(email: string): boolean;
}

export class RecipientListServiceImpl implements RecipientListService {
  private store = new Map<UUID, RecipientList>();

  // ── Task 2.1 ──────────────────────────────────────────────────────────────

  validateEmail(email: string): boolean {
    if (typeof email !== "string") return false;
    // Reject emails with consecutive dots in local part
    const [local] = email.split("@");
    if (local && local.includes("..")) return false;
    return RFC5322_REGEX.test(email);
  }

  async createList(senderID: UUID, name: string, emails: string[]): Promise<RecipientList> {
    const invalid = emails.filter((e) => !this.validateEmail(e));
    if (invalid.length > 0) {
      throw new ValidationError(
        "emails",
        `Invalid email address(es): ${invalid.join(", ")}`,
        invalid
      );
    }

    const now = new Date();
    const list: RecipientList = {
      id: uuidv4(),
      senderID,
      name,
      emails: deduplicate(emails),
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(list.id, list);
    return list;
  }

  async addRecipients(listID: UUID, emails: string[]): Promise<RecipientList> {
    const list = this.getOrThrow(listID);

    const invalid = emails.filter((e) => !this.validateEmail(e));
    if (invalid.length > 0) {
      throw new ValidationError(
        "emails",
        `Invalid email address(es): ${invalid.join(", ")}`,
        invalid
      );
    }

    const updated: RecipientList = {
      ...list,
      emails: deduplicate([...list.emails, ...emails]),
      updatedAt: new Date(),
    };

    this.store.set(listID, updated);
    return updated;
  }

  async removeRecipient(listID: UUID, email: string): Promise<RecipientList> {
    const list = this.getOrThrow(listID);

    const updated: RecipientList = {
      ...list,
      emails: deduplicate(list.emails.filter((e) => e !== email)),
      updatedAt: new Date(),
    };

    this.store.set(listID, updated);
    return updated;
  }

  // ── Task 2.5 ──────────────────────────────────────────────────────────────

  async importFromCSV(
    senderID: UUID,
    csvBuffer: Buffer
  ): Promise<{ list: RecipientList; skipped: Array<{ row: number; email: string; reason: string }> }> {
    let records: Record<string, string>[];

    try {
      records = parse(csvBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, string>[];
    } catch (err) {
      throw new ValidationError("csvBuffer", `Failed to parse CSV: ${(err as Error).message}`);
    }

    const validEmails: string[] = [];
    const skipped: Array<{ row: number; email: string; reason: string }> = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      // row index is 1-based (header is row 0, first data row is row 1)
      const rowNumber = i + 1;
      const email = row["email"] ?? row["Email"] ?? row["EMAIL"] ?? "";

      if (!email) {
        skipped.push({ row: rowNumber, email: "", reason: "Missing email column" });
        continue;
      }

      if (!this.validateEmail(email)) {
        skipped.push({ row: rowNumber, email, reason: `Invalid email address: ${email}` });
        continue;
      }

      validEmails.push(email);
    }

    const now = new Date();
    const list: RecipientList = {
      id: uuidv4(),
      senderID,
      name: "Imported List",
      emails: deduplicate(validEmails),
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(list.id, list);
    return { list, skipped };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getOrThrow(listID: UUID): RecipientList {
    const list = this.store.get(listID);
    if (!list) throw new NotFoundError("RecipientList", listID);
    return list;
  }

  /** Expose store for testing purposes */
  async getList(listID: UUID): Promise<RecipientList> {
    const list = this.store.get(listID);
    if (!list) throw new NotFoundError("RecipientList", listID);
    return list;
  }
}

function deduplicate(emails: string[]): string[] {
  return [...new Set(emails.map((e) => e.toLowerCase()))];
}
