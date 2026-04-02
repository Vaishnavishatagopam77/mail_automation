import { UUID } from "../models";

export interface NotificationService {
  notifySender(responseID: UUID): Promise<void>;
}
