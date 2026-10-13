export function publicHttpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().replace(/[),.;]+$/g, "");
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (!url.hostname || isExpiringSignedUrl(url)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Presigned object URLs expire and must not be pasted into a WhatsApp draft. */
export function isExpiringSignedUrl(url: URL): boolean {
  const keys = [...url.searchParams.keys()].map((key) => key.toLowerCase());
  if (
    keys.some(
      (key) =>
        key.startsWith("x-amz-") ||
        key.startsWith("x-goog-") ||
        key === "awsaccesskeyid",
    )
  ) {
    return true;
  }
  const signed =
    keys.includes("signature") &&
    (keys.includes("expires") ||
      keys.includes("policy") ||
      keys.includes("key-pair-id"));
  return signed;
}
