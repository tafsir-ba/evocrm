/**
 * Resend bounce payload classification.
 * Only Permanent bounces should suppress recipients; Transient (soft) bounces
 * such as mailbox-full or temporary DNS failures must not permanently block sends.
 */
export type ResendBouncePayload = {
  type?: string | null;
  subType?: string | null;
  message?: string | null;
};

export function isPermanentResendBounce(
  bounce: ResendBouncePayload | null | undefined,
): boolean {
  if (!bounce) {
    // Missing bounce details: treat as permanent to protect sender reputation
    // when Resend only signals email.bounced without a typed payload.
    return true;
  }

  const type = bounce.type?.trim().toLowerCase() ?? "";

  if (type === "transient" || type === "temporary" || type === "soft") {
    return false;
  }

  if (type === "permanent" || type === "hard") {
    return true;
  }

  // Unknown type with no explicit soft signal — suppress to be safe.
  return type.length === 0 || type === "undetermined";
}
