// Typed service error classes for the Email Automation feature.
// All service-layer errors extend ServiceError so callers can pattern-match
// on `error.kind` without relying on instanceof chains.

export type ErrorKind =
  | "validation"
  | "not-found"
  | "expired-token"
  | "duplicate-response";

export class ServiceError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = "ServiceError";
    this.kind = kind;
    // Maintain proper prototype chain in transpiled ES5
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when input data fails validation (e.g. malformed email, empty field). */
export class ValidationError extends ServiceError {
  /** The field or value that failed validation. */
  readonly field: string;
  /** The invalid value, if available. */
  readonly invalidValue?: unknown;

  constructor(field: string, message: string, invalidValue?: unknown) {
    super("validation", message);
    this.name = "ValidationError";
    this.field = field;
    this.invalidValue = invalidValue;
  }
}

/** Thrown when a requested resource does not exist. */
export class NotFoundError extends ServiceError {
  readonly resourceType: string;
  readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super("not-found", `${resourceType} not found: ${resourceId}`);
    this.name = "NotFoundError";
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/** Thrown when a Response_Token is invalid, not found, or has expired. */
export class ExpiredTokenError extends ServiceError {
  constructor(message = "Response token is invalid or has expired") {
    super("expired-token", message);
    this.name = "ExpiredTokenError";
  }
}

/** Thrown when a recipient attempts to submit a second RSVP response. */
export class DuplicateResponseError extends ServiceError {
  readonly recipientEmail: string;
  readonly campaignID: string;

  constructor(recipientEmail: string, campaignID: string) {
    super(
      "duplicate-response",
      `Response already recorded for ${recipientEmail} in campaign ${campaignID}`
    );
    this.name = "DuplicateResponseError";
    this.recipientEmail = recipientEmail;
    this.campaignID = campaignID;
  }
}
