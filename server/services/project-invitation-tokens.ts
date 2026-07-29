import "server-only";

import { randomBytes, createHash } from "node:crypto";

const TOKEN_BYTES = 32;

export function generateInvitationToken(): { raw: string; hash: string } {
  const raw = randomBytes(TOKEN_BYTES).toString("hex");
  const hash = hashInvitationToken(raw);
  return { raw, hash };
}

export function hashInvitationToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
