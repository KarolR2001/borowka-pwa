export type AppErrorKind =
  | "FIELD"
  | "BUSINESS_RULE"
  | "PERMISSION"
  | "OFFLINE"
  | "PENDING_WRITE"
  | "SYNC"
  | "FIREBASE_UNAVAILABLE"
  | "DATA_VERSION"
  | "UNEXPECTED";

export type AppError = {
  kind: AppErrorKind;
  diagnosticCode: string;
  userMessage: string;
  retryable: boolean;
  nextStep: string;
};

export function createAppError(error: AppError): AppError {
  return error;
}
