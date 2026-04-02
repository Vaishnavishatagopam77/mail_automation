import { CampaignServiceImpl } from "../../src/services/CampaignService";
import { RecipientListService } from "../../src/services/RecipientListService";
import { DispatchService } from "../../src/services/DispatchService";
import { RecipientList, UUID } from "../../src/models";
import { ValidationError, NotFoundError } from "../../src/services/errors";

// ── Test doubles ──────────────────────────────────────────────────────────────

function makeRecipientListService(emails: string[] = ["a@example.com"]): RecipientListService {
  const list: RecipientList = {
    id: "list-1",
    senderID: "sender-1",
    name: "Test List",
    emails,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    createList: async () => list,
    getList: async (listID: UUID) => {
      if (listID !== list.id) throw new NotFoundError("RecipientList", listID);
      return list;
    },
    addRecipients: async () => list,
    removeRecipient: async () => list,
    importFromCSV: async () => ({ list, skipped: [] }),
    validateEmail: () => true,
  };
}

function makeDispatchService(): DispatchService & { calls: UUID[] } {
  const calls: UUID[] = [];
  return {
    calls,
    dispatch: async (campaignID: UUID) => {
      calls.push(campaignID);
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSvc(emails?: string[]) {
  const listSvc = makeRecipientListService(emails);
  const dispatchSvc = makeDispatchService();
  const svc = new CampaignServiceImpl(listSvc, dispatchSvc);
  return { svc, listSvc, dispatchSvc };
}

const VALID = {
  senderID: "sender-1",
  name: "My Campaign",
  subject: "You're invited",
  body: "Please RSVP",
  listID: "list-1",
};

// ── createCampaign ────────────────────────────────────────────────────────────

describe("CampaignService.createCampaign", () => {
  it("creates a campaign with valid fields", async () => {
    const { svc } = makeSvc();
    const campaign = await svc.createCampaign(
      VALID.senderID, VALID.name, VALID.subject, VALID.body, VALID.listID
    );
    expect(campaign.name).toBe(VALID.name);
    expect(campaign.subject).toBe(VALID.subject);
    expect(campaign.body).toBe(VALID.body);
    expect(campaign.listID).toBe(VALID.listID);
    expect(campaign.senderID).toBe(VALID.senderID);
    expect(campaign.status).toBe("Draft");
  });

  it("persists a creation timestamp", async () => {
    const { svc } = makeSvc();
    const before = new Date();
    const campaign = await svc.createCampaign(
      VALID.senderID, VALID.name, VALID.subject, VALID.body, VALID.listID
    );
    const after = new Date();
    expect(campaign.createdAt).toBeInstanceOf(Date);
    expect(campaign.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(campaign.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("sets sentAt to null on creation", async () => {
    const { svc } = makeSvc();
    const campaign = await svc.createCampaign(
      VALID.senderID, VALID.name, VALID.subject, VALID.body, VALID.listID
    );
    expect(campaign.sentAt).toBeNull();
  });

  it("throws ValidationError when name is empty", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createCampaign(VALID.senderID, "", VALID.subject, VALID.body, VALID.listID)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when name is whitespace only", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createCampaign(VALID.senderID, "   ", VALID.subject, VALID.body, VALID.listID)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when subject is empty", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createCampaign(VALID.senderID, VALID.name, "", VALID.body, VALID.listID)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when body is empty", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createCampaign(VALID.senderID, VALID.name, VALID.subject, "", VALID.listID)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("identifies the failing field in the error", async () => {
    const { svc } = makeSvc();
    try {
      await svc.createCampaign(VALID.senderID, "", VALID.subject, VALID.body, VALID.listID);
    } catch (err) {
      expect((err as ValidationError).field).toBe("name");
    }
  });

  it("does not persist a campaign when validation fails", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createCampaign(VALID.senderID, "", VALID.subject, VALID.body, VALID.listID)
    ).rejects.toBeInstanceOf(ValidationError);

    // The campaign should not be retrievable
    await expect(svc.getCampaign("any-id")).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── getCampaign ───────────────────────────────────────────────────────────────

describe("CampaignService.getCampaign", () => {
  it("returns the campaign after creation (round trip)", async () => {
    const { svc } = makeSvc();
    const created = await svc.createCampaign(
      VALID.senderID, VALID.name, VALID.subject, VALID.body, VALID.listID
    );
    const fetched = await svc.getCampaign(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe(created.name);
    expect(fetched.subject).toBe(created.subject);
    expect(fetched.body).toBe(created.body);
    expect(fetched.listID).toBe(created.listID);
    expect(fetched.createdAt).toEqual(created.createdAt);
  });

  it("throws NotFoundError for unknown campaignID", async () => {
    const { svc } = makeSvc();
    await expect(svc.getCampaign("nonexistent")).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── sendCampaign ──────────────────────────────────────────────────────────────

describe("CampaignService.sendCampaign", () => {
  it("delegates to DispatchService when list is non-empty", async () => {
    const { svc, dispatchSvc } = makeSvc(["a@example.com"]);
    const campaign = await svc.createCampaign(
      VALID.senderID, VALID.name, VALID.subject, VALID.body, VALID.listID
    );
    await svc.sendCampaign(campaign.id);
    // Allow the async fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchSvc.calls).toContain(campaign.id);
  });

  it("throws ValidationError when recipient list is empty", async () => {
    const { svc } = makeSvc([]); // empty list
    const campaign = await svc.createCampaign(
      VALID.senderID, VALID.name, VALID.subject, VALID.body, VALID.listID
    );
    await expect(svc.sendCampaign(campaign.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError when campaignID does not exist", async () => {
    const { svc } = makeSvc();
    await expect(svc.sendCampaign("nonexistent")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not call DispatchService when list is empty", async () => {
    const { svc, dispatchSvc } = makeSvc([]);
    const campaign = await svc.createCampaign(
      VALID.senderID, VALID.name, VALID.subject, VALID.body, VALID.listID
    );
    await expect(svc.sendCampaign(campaign.id)).rejects.toBeInstanceOf(ValidationError);
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchSvc.calls).toHaveLength(0);
  });
});
