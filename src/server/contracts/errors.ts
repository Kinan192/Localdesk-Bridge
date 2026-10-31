export type FoundationErrorCode =
  | "INVALID_INPUT" | "ACCESS_DENIED" | "NOT_FOUND" | "CONFLICT"
  | "TOO_LARGE" | "UNAVAILABLE" | "NOT_IMPLEMENTED";

export class FoundationError extends Error {
  readonly code: FoundationErrorCode;
  constructor(code: FoundationErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
    this.name = "FoundationError";
  }
}
