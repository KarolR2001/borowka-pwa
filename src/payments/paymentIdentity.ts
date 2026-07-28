export function createPaymentId(
  sessionId: string,
  targetSessionRevision: number
): string {
  const normalizedSessionId = sessionId.trim();

  if (!normalizedSessionId) {
    throw new Error("Wyplata wymaga identyfikatora sesji.");
  }

  if (
    !Number.isSafeInteger(targetSessionRevision) ||
    targetSessionRevision < 2 ||
    targetSessionRevision >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("Wyplata wymaga prawidlowej docelowej rewizji sesji.");
  }

  return `${normalizedSessionId}--payment-r${String(targetSessionRevision)}`;
}
