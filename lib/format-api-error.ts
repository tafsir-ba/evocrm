export function formatApiErrorMessage(
  payload: {
    error?: {
      message?: string;
      details?: Record<string, unknown>;
    };
  },
  fallback: string,
): string {
  const requiredFixes = payload.error?.details?.requiredFixes;
  if (Array.isArray(requiredFixes) && requiredFixes.length > 0) {
    return requiredFixes.join(" ");
  }

  const fieldDetails = payload.error?.details;
  if (fieldDetails && !Array.isArray(requiredFixes)) {
    const detailMessages = Object.entries(fieldDetails).flatMap(([field, value]) => {
      if (Array.isArray(value)) {
        return value.map((message) =>
          typeof message === "string"
            ? field === "_root"
              ? message
              : `${field}: ${message}`
            : String(message),
        );
      }
      return [];
    });

    if (detailMessages.length > 0) {
      return detailMessages.join(" ");
    }
  }

  return payload.error?.message ?? fallback;
}
