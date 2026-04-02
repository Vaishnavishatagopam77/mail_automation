import { UUID } from "../models";

export interface GeneratedToken {
  token: string;
  hash: string;
}

export interface TokenPayload {
  recipientID: UUID;
  campaignID: UUID;
}

export interface TokenService {
  generate(recipientID: UUID, campaignID: UUID): GeneratedToken;
  validate(rawToken: string): TokenPayload | null;
  expire(campaignID: UUID, cutoffDate: Date): Promise<void>;
}
