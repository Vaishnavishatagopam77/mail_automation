import { UUID } from "../models";

export interface DispatchService {
  dispatch(campaignID: UUID): Promise<void>;
}
