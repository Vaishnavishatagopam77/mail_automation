// Data models for the Email Automation feature

export type UUID = string;
export type Timestamp = Date;

// ─── Recipient List ───────────────────────────────────────────────────────────

export interface RecipientList {
  id: UUID;
  senderID: UUID;
  name: string;
  emails: string[]; // deduplicated, validated
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Campaign ─────────────────────────────────────────────────────────────────

export type CampaignStatus = "Draft" | "Sending" | "Sent";

export interface Campaign {
  id: UUID;
  senderID: UUID;
  name: string;
  subject: string;
  body: string; // may contain {{name}}
  listID: UUID; // FK → RecipientList
  status: CampaignStatus;
  createdAt: Timestamp;
  sentAt: Timestamp | null;
}

// ─── Recipient Delivery ───────────────────────────────────────────────────────

export type DeliveryStatus = "Pending" | "Sent" | "Failed";

export interface RecipientDelivery {
  id: UUID;
  campaignID: UUID;
  email: string;
  name: string | null;
  deliveryStatus: DeliveryStatus;
  failureReason: string | null;
  tokenHash: string; // SHA-256 of Response_Token
  tokenExpiry: Timestamp;
  createdAt: Timestamp;
}

// ─── RSVP Response ────────────────────────────────────────────────────────────

export type Answer = "Coming" | "Not Coming";

export interface RSVPResponse {
  id: UUID;
  campaignID: UUID;
  email: string;
  answer: Answer;
  respondedAt: Timestamp;
}

// ─── Notification Log ─────────────────────────────────────────────────────────

export type NotificationStatus = "Pending" | "Delivered" | "Failed";

export interface NotificationLog {
  id: UUID;
  responseID: UUID;
  attempts: number;
  lastAttempt: Timestamp;
  status: NotificationStatus;
}
