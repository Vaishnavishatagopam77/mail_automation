# Implementation Plan: Email Automation

## Overview

Implement the email automation feature incrementally, starting with data models and core services, then wiring up the HTTP API layer. Each step builds on the previous and integrates immediately — no orphaned code.

## Tasks

- [x] 1. Set up project structure, data models, and interfaces
  - Create directory structure: `src/services/`, `src/api/`, `src/models/`, `tests/unit/`, `tests/property/`
  - Define TypeScript interfaces and types for all data models: `RecipientList`, `Campaign`, `RecipientDelivery`, `RSVPResponse`, `NotificationLog`
  - Define the `EmailService` interface with `send()` method and `DeliveryResult` type
  - Define typed service error classes (validation error, not-found, expired-token, duplicate-response)
  - Set up testing framework (Jest + fast-check) and shared test generators: `arbitraryEmail`, `arbitraryMalformedEmail`, `arbitraryCampaign`, `arbitraryRecipientList`, `arbitraryCSVBuffer`, `arbitraryToken`, `arbitraryAnswer`
  - _Requirements: 1.1, 2.1, 3.2, 4.1, 7.1_

- [x] 2. Implement RecipientListService
  - [x] 2.1 Implement `validateEmail`, `createList`, `addRecipients`, `removeRecipient` with RFC 5322 validation and deduplication on every write
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_
  - [ ]* 2.2 Write property test for email validation rejects malformed addresses
    - **Property 1: Email validation rejects malformed addresses with identification**
    - **Validates: Requirements 1.2, 1.3**
  - [ ]* 2.3 Write property test for deduplication idempotence
    - **Property 2: Recipient list deduplication is idempotent**
    - **Validates: Requirements 1.6**
  - [ ]* 2.4 Write property test for add/remove round trip
    - **Property 3: Add then remove is a round trip**
    - **Validates: Requirements 1.4**
  - [x] 2.5 Implement `importFromCSV` — parse CSV buffer, validate each row, import valid emails, return skipped rows with reasons
    - _Requirements: 1.5_
  - [ ]* 2.6 Write property test for CSV import preserves valid emails
    - **Property 4: CSV import preserves valid emails**
    - **Validates: Requirements 1.5**
  - [ ]* 2.7 Write unit tests for RecipientListService
    - Known valid/invalid email examples, empty CSV, CSV with only headers, single-address list
    - _Requirements: 1.1–1.6_

- [-] 3. Implement CampaignService
  - [x] 3.1 Implement `createCampaign` with required-field validation and timestamp persistence, and `getCampaign`
    - _Requirements: 2.1, 2.4_
  - [ ]* 3.2 Write property test for campaign creation rejects missing required fields
    - **Property 5: Campaign creation rejects missing required fields**
    - **Validates: Requirements 2.1**
  - [ ]* 3.3 Write property test for campaign persistence round trip
    - **Property 8: Campaign persistence round trip**
    - **Validates: Requirements 2.4**
  - [-] 3.4 Implement `sendCampaign` — validate non-empty recipient list, then delegate to DispatchService asynchronously
    - _Requirements: 2.2_
  - [ ]* 3.5 Write property test for campaign send blocked for empty recipient list
    - **Property 6: Campaign send is blocked for empty recipient lists**
    - **Validates: Requirements 2.2**
  - [ ]* 3.6 Write unit tests for CampaignService
    - Field-level validation errors, empty list rejection, timestamp presence
    - _Requirements: 2.1, 2.2, 2.4_

- [~] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [~] 5. Implement TokenService
  - [~] 5.1 Implement `generate` using `crypto.randomBytes(32)`, storing only the SHA-256 hash; implement `validate` and `expire`
    - _Requirements: 7.1, 7.2, 7.4_
  - [ ]* 5.2 Write property test for token generation meets entropy and storage requirements
    - **Property 23: Token generation meets entropy and storage requirements**
    - **Validates: Requirements 7.1, 7.2**
  - [ ]* 5.3 Write property test for tokens are unique per recipient per campaign
    - **Property 10: Tokens are unique per recipient per campaign**
    - **Validates: Requirements 3.2**
  - [ ]* 5.4 Write property test for expired tokens are rejected
    - **Property 24: Expired tokens are rejected**
    - **Validates: Requirements 7.4**
  - [ ]* 5.5 Write unit tests for TokenService
    - Known token round trip, expiry boundary, invalid token string
    - _Requirements: 7.1–7.4_

- [~] 6. Implement DispatchService
  - [~] 6.1 Implement `dispatch` — iterate recipients, call `TokenService.generate`, interpolate `{{name}}` placeholder, call `EmailService.send`, update delivery status (Pending → Sent | Failed), continue on individual failures
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 2.3_
  - [ ]* 6.2 Write property test for name placeholder interpolation never leaks the literal token
    - **Property 7: Name placeholder interpolation never leaks the literal token**
    - **Validates: Requirements 2.3**
  - [ ]* 6.3 Write property test for dispatch sends to every recipient and assigns a status
    - **Property 9: Dispatch sends to every recipient and assigns a status**
    - **Validates: Requirements 3.1, 3.6**
  - [ ]* 6.4 Write property test for both action links embed the token
    - **Property 11: Both action links embed the token**
    - **Validates: Requirements 3.3**
  - [ ]* 6.5 Write property test for delivery failure is isolated
    - **Property 12: Delivery failure is isolated**
    - **Validates: Requirements 3.5**
  - [ ]* 6.6 Write unit tests for DispatchService
    - Integration with mock TokenService and mock EmailService, mixed success/failure batch
    - _Requirements: 3.1–3.6_

- [~] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [~] 8. Implement ResponseService and NotificationService
  - [~] 8.1 Implement `ResponseService.recordResponse` — validate token via TokenService, reject duplicates, persist RSVPResponse, trigger NotificationService
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [~] 8.2 Implement `ResponseService.getResponse`
    - _Requirements: 4.3_
  - [ ]* 8.3 Write property test for response recording round trip
    - **Property 13: Response recording round trip**
    - **Validates: Requirements 4.1, 4.2, 4.3**
  - [ ]* 8.4 Write property test for invalid tokens are rejected
    - **Property 14: Invalid tokens are rejected**
    - **Validates: Requirements 4.4**
  - [ ]* 8.5 Write property test for response submission is idempotent
    - **Property 15: Response submission is idempotent**
    - **Validates: Requirements 4.5, 7.3**
  - [~] 8.6 Implement `NotificationService.notifySender` — render Confirmation_Email with required fields, send via EmailService within 30s, retry up to 3 times at 60s intervals, log failures
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 8.7 Write property test for confirmation email contains all required fields
    - **Property 16: Confirmation email contains all required fields**
    - **Validates: Requirements 5.2**
  - [ ]* 8.8 Write property test for notification is triggered for every recorded response
    - **Property 17: Notification is triggered for every recorded response**
    - **Validates: Requirements 5.1**
  - [ ]* 8.9 Write property test for notification retry does not exceed three attempts
    - **Property 18: Notification retry does not exceed three attempts**
    - **Validates: Requirements 5.3**
  - [ ]* 8.10 Write unit tests for ResponseService and NotificationService
    - Invalid token, duplicate submission, confirmation page render, retry exhaustion
    - _Requirements: 4.1–4.6, 5.1–5.3_

- [~] 9. Implement TrackerService
  - [~] 9.1 Implement `getSummary`, `getRecipientStatuses`, and `exportCSV` (email, name, response, timestamp columns)
    - _Requirements: 6.1, 6.2, 6.4_
  - [ ]* 9.2 Write property test for tracker covers all recipients
    - **Property 19: Tracker covers all recipients**
    - **Validates: Requirements 6.1**
  - [ ]* 9.3 Write property test for aggregate counts are consistent
    - **Property 20: Aggregate counts are consistent**
    - **Validates: Requirements 6.2**
  - [ ]* 9.4 Write property test for tracker reflects new responses
    - **Property 21: Tracker reflects new responses**
    - **Validates: Requirements 6.3**
  - [ ]* 9.5 Write property test for CSV export contains all required columns for every recipient
    - **Property 22: CSV export contains all required columns for every recipient**
    - **Validates: Requirements 6.4**
  - [ ]* 9.6 Write unit tests for TrackerService
    - Campaign with no responses, mixed responses, full response set
    - _Requirements: 6.1–6.4_

- [~] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [~] 11. Implement HTTP API layer
  - [~] 11.1 Implement Recipient List API routes: `POST /lists`, `PATCH /lists/:id/recipients`, `DELETE /lists/:id/recipients/:email`, `POST /lists/:id/import`
    - Translate service errors to HTTP status codes (400 validation, 404 not found, 500 unexpected)
    - _Requirements: 1.1–1.6_
  - [~] 11.2 Implement Campaign API routes: `POST /campaigns`, `GET /campaigns/:id`, `POST /campaigns/:id/send`
    - _Requirements: 2.1–2.4, 3.1_
  - [~] 11.3 Implement Response API route: `GET /respond?token=...&answer=...`
    - Return confirmation page on success (Requirement 4.6), error page for invalid/expired token (400/410), "already recorded" page for duplicates
    - _Requirements: 4.1–4.6_
  - [~] 11.4 Implement Tracker API routes: `GET /campaigns/:id/tracker`, `GET /campaigns/:id/export`
    - Support polling or server-sent events for ≤5s update latency
    - _Requirements: 6.1–6.4_
  - [ ]* 11.5 Write unit tests for HTTP API endpoints
    - All error scenario status codes from the Error Handling table (400, 404, 410, 500)
    - _Requirements: 1.1–6.4_

- [~] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check and must run ≥100 iterations each, tagged with `// Feature: email-automation, Property N: <property_text>`
- The `EmailService` interface is injected at runtime — use a mock/stub in all tests
