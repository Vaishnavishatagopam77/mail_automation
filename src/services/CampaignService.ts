import { Campaign, UUID } from "../models";
import { ValidationError, NotFoundError } from "./errors";
import { RecipientListService } from "./RecipientListService";
import { DispatchService } from "./DispatchService";
import { v4 as uuidv4 } from "uuid";

export interface CampaignService {
  createCampaign(senderID: UUID, name: string, subject: string, body: string, listID: UUID): Promise<Campaign>;
  getCampaign(campaignID: UUID): Promise<Campaign>;
  sendCampaign(campaignID: UUID): Promise<void>;
}

export class CampaignServiceImpl implements CampaignService {
  private store = new Map<UUID, Campaign>();

  constructor(
    private readonly recipientListService: RecipientListService,
    private readonly dispatchService: DispatchService
  ) {}

  async createCampaign(
    senderID: UUID,
    name: string,
    subject: string,
    body: string,
    listID: UUID
  ): Promise<Campaign> {
    if (!name || !name.trim()) {
      throw new ValidationError("name", "Campaign name must not be empty");
    }
    if (!subject || !subject.trim()) {
      throw new ValidationError("subject", "Campaign subject must not be empty");
    }
    if (!body || !body.trim()) {
      throw new ValidationError("body", "Campaign body must not be empty");
    }

    const campaign: Campaign = {
      id: uuidv4(),
      senderID,
      name: name.trim(),
      subject: subject.trim(),
      body: body.trim(),
      listID,
      status: "Draft",
      createdAt: new Date(),
      sentAt: null,
    };

    this.store.set(campaign.id, campaign);
    return campaign;
  }

  async getCampaign(campaignID: UUID): Promise<Campaign> {
    const campaign = this.store.get(campaignID);
    if (!campaign) throw new NotFoundError("Campaign", campaignID);
    return campaign;
  }

  async sendCampaign(campaignID: UUID): Promise<void> {
    const campaign = await this.getCampaign(campaignID);

    const list = await this.recipientListService.getList(campaign.listID);
    if (list.emails.length === 0) {
      throw new ValidationError(
        "listID",
        "Cannot send campaign: the associated recipient list is empty"
      );
    }

    // Delegate to DispatchService asynchronously (fire-and-forget)
    this.dispatchService.dispatch(campaignID).catch(() => {
      // Dispatch errors are handled internally by DispatchService
    });
  }
}
