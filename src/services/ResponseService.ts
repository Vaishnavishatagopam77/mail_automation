import { Answer, RSVPResponse, UUID } from "../models";

export interface ResponseService {
  recordResponse(rawToken: string, answer: Answer): Promise<RSVPResponse>;
  getResponse(recipientID: UUID, campaignID: UUID): Promise<RSVPResponse | null>;
}
