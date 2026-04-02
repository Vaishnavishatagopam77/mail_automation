import { UUID } from "../models";

export interface RecipientStatus {
  email: string;
  name: string | null;
  status: "Pending" | "Coming" | "Not Coming";
  respondedAt: Date | null;
}

export interface CampaignSummary {
  total: number;
  coming: number;
  notComing: number;
  pending: number;
}

export interface TrackerService {
  getSummary(campaignID: UUID): Promise<CampaignSummary>;
  getRecipientStatuses(campaignID: UUID): Promise<RecipientStatus[]>;
  exportCSV(campaignID: UUID): Promise<Buffer>;
}
