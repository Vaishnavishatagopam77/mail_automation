// EmailService interface — concrete implementations (SendGrid, SES, etc.)
// are injected at runtime.

export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  failureReason?: string;
}

export interface EmailService {
  send(to: string, subject: string, htmlBody: string): Promise<DeliveryResult>;
}
