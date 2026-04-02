# Requirements Document

## Introduction

The Email Automation feature allows a sender to upload or define a list of recipients and automatically send each recipient an RSVP email containing "Coming" and "Not Coming" action buttons. When a recipient clicks a button, the system records the response and sends a confirmation message back to the original sender. The feature also provides response tracking so the sender can monitor who has replied and what their answer was.

## Glossary

- **System**: The email automation application
- **Sender**: The user who initiates the email campaign and receives RSVP responses
- **Recipient**: A person on the mailing list who receives the RSVP email
- **Recipient_List**: A collection of recipient email addresses managed by the Sender
- **RSVP_Email**: The automated email sent to each Recipient containing Coming and Not Coming action buttons
- **RSVP_Response**: The Recipient's answer, either "Coming" or "Not Coming"
- **Response_Token**: A unique, single-use token embedded in each RSVP button link to identify the Recipient and the campaign
- **Campaign**: A single batch of RSVP emails sent to a Recipient_List by a Sender
- **Confirmation_Email**: The email sent to the Sender summarizing a Recipient's RSVP_Response
- **Response_Tracker**: The component that records and displays RSVP_Response data per Campaign
- **Email_Service**: The external service used to deliver emails

---

## Requirements

### Requirement 1: Manage Recipient List

**User Story:** As a Sender, I want to create and manage a list of recipient email addresses, so that I can target the right people with my RSVP campaign.

#### Acceptance Criteria

1. THE System SHALL allow the Sender to create a Recipient_List by providing one or more valid email addresses.
2. THE System SHALL validate that each entry in the Recipient_List is a properly formatted email address before saving.
3. IF an email address in the Recipient_List is malformed, THEN THE System SHALL reject that entry and return a descriptive validation error identifying the invalid address.
4. THE System SHALL allow the Sender to add or remove individual email addresses from an existing Recipient_List.
5. THE System SHALL allow the Sender to import a Recipient_List from a CSV file where each row contains at least one email address column.
6. IF a duplicate email address is added to the same Recipient_List, THEN THE System SHALL deduplicate the list and retain only one entry for that address.

---

### Requirement 2: Create and Configure a Campaign

**User Story:** As a Sender, I want to configure an RSVP campaign with a subject, message body, and a selected Recipient_List, so that I can send a personalised invitation to each recipient.

#### Acceptance Criteria

1. THE System SHALL require the Sender to provide a campaign name, email subject line, and email body before a Campaign can be created.
2. THE System SHALL require the Sender to associate a non-empty Recipient_List with a Campaign before the Campaign can be sent.
3. THE System SHALL allow the Sender to include a personalisation placeholder `{{name}}` in the email body, which THE System SHALL replace with the Recipient's name when available, or omit gracefully when the name is not provided.
4. WHEN a Campaign is saved, THE System SHALL persist the campaign name, subject, body, associated Recipient_List, and creation timestamp.

---

### Requirement 3: Send RSVP Emails

**User Story:** As a Sender, I want the system to automatically send an RSVP email to every recipient in my list, so that I don't have to send individual emails manually.

#### Acceptance Criteria

1. WHEN the Sender initiates a Campaign, THE System SHALL send an RSVP_Email to each Recipient in the associated Recipient_List.
2. THE System SHALL generate a unique Response_Token for each Recipient within a Campaign before sending the RSVP_Email.
3. THE System SHALL embed the Response_Token in both the "Coming" and "Not Coming" action links within the RSVP_Email so that each link uniquely identifies the Recipient and the Campaign.
4. THE System SHALL deliver each RSVP_Email via the Email_Service within 60 seconds of the Sender initiating the Campaign for lists of up to 500 recipients.
5. IF the Email_Service returns a delivery failure for a Recipient, THEN THE System SHALL mark that Recipient's status as "Failed" and record the failure reason without stopping delivery to remaining recipients.
6. WHILE a Campaign is being sent, THE System SHALL track the delivery status (Pending, Sent, Failed) for each Recipient.

---

### Requirement 4: Capture RSVP Response

**User Story:** As a Recipient, I want to click a Coming or Not Coming button in the email, so that I can respond to the invitation without needing to log in or fill out a form.

#### Acceptance Criteria

1. WHEN a Recipient clicks the "Coming" link, THE System SHALL record an RSVP_Response of "Coming" for that Recipient against the associated Campaign.
2. WHEN a Recipient clicks the "Not Coming" link, THE System SHALL record an RSVP_Response of "Not Coming" for that Recipient against the associated Campaign.
3. THE System SHALL associate each RSVP_Response with the correct Recipient and Campaign by validating the Response_Token embedded in the link.
4. IF a Response_Token is invalid or not found, THEN THE System SHALL return an error page informing the Recipient that the link is invalid or expired.
5. IF a Recipient clicks a response link after already submitting an RSVP_Response for the same Campaign, THEN THE System SHALL display a message indicating the response has already been recorded and SHALL NOT overwrite the original response.
6. WHEN an RSVP_Response is recorded, THE System SHALL display a confirmation page to the Recipient acknowledging their response.

---

### Requirement 5: Notify Sender of Responses

**User Story:** As a Sender, I want to receive an automatic notification when a recipient responds, so that I can stay informed without checking a dashboard constantly.

#### Acceptance Criteria

1. WHEN an RSVP_Response is recorded, THE System SHALL send a Confirmation_Email to the Sender within 30 seconds.
2. THE Confirmation_Email SHALL include the Recipient's email address, the Recipient's RSVP_Response ("Coming" or "Not Coming"), the Campaign name, and the timestamp of the response.
3. IF the Confirmation_Email cannot be delivered to the Sender, THEN THE System SHALL log the failure and retry delivery up to 3 times with a 60-second interval between attempts.

---

### Requirement 6: Track and View Campaign Responses

**User Story:** As a Sender, I want to view a summary of all responses for a campaign, so that I can see who is coming and who is not.

#### Acceptance Criteria

1. THE Response_Tracker SHALL display a list of all Recipients for a given Campaign along with each Recipient's current status: Pending, Coming, or Not Coming.
2. THE Response_Tracker SHALL display aggregate counts: total recipients, total "Coming" responses, total "Not Coming" responses, and total pending (no response yet).
3. WHEN a new RSVP_Response is recorded, THE Response_Tracker SHALL reflect the updated status within 5 seconds for a Sender viewing the Campaign dashboard.
4. THE System SHALL allow the Sender to export the response data for a Campaign as a CSV file containing Recipient email, name (if available), RSVP_Response, and response timestamp.

---

### Requirement 7: Response Token Security

**User Story:** As a system operator, I want each RSVP link to be cryptographically unique and single-use, so that responses cannot be forged or replayed.

#### Acceptance Criteria

1. THE System SHALL generate each Response_Token using a cryptographically secure random generator producing at least 128 bits of entropy.
2. THE System SHALL store a hashed representation of each Response_Token and SHALL NOT store the raw token value.
3. IF the same Response_Token is submitted more than once, THEN THE System SHALL reject the duplicate submission and SHALL NOT record a second RSVP_Response.
4. THE System SHALL expire Response_Tokens that have not been used within 30 days of the Campaign send date, after which THE System SHALL treat them as invalid.
