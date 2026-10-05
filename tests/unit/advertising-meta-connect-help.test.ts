import { describe, expect, it } from "vitest";

import { META_READ_ONLY_SCOPES } from "@/lib/advertising-constants";
import {
  META_CONNECT_DEFAULT_PATH,
  META_CONNECT_NEVER_SHARE,
  META_CONNECT_PATH_LABELS,
  META_CONNECT_PATHS,
  META_CONNECT_PREPARE_STEPS,
} from "@/lib/advertising-meta-connect-help";
import { ADVERTISING_DEFAULTS } from "@/server/advertising/defaults";

describe("Meta connect setup help constants", () => {
  it("keeps Phase 1 read-only scopes exact and shared", () => {
    expect(META_READ_ONLY_SCOPES).toEqual(["ads_read", "business_management"]);
    expect(ADVERTISING_DEFAULTS.metaReadOnlyScopes).toEqual([
      ...META_READ_ONLY_SCOPES,
    ]);
    expect(META_READ_ONLY_SCOPES.join(" ")).not.toMatch(
      /ads_management|pages_manage|publish|write/i,
    );
  });

  it("defaults operators to the prepare path", () => {
    expect(META_CONNECT_DEFAULT_PATH).toBe(META_CONNECT_PATHS.prepare);
    expect(META_CONNECT_PATH_LABELS.haveToken).toMatch(/already have/i);
    expect(META_CONNECT_PATH_LABELS.prepare).toMatch(/help me prepare/i);
  });

  it("explains system-user app assignment and developer registration", () => {
    const text = META_CONNECT_PREPARE_STEPS.map(
      (step) => `${step.title} ${step.body}`,
    ).join(" ");
    expect(text).toMatch(/eligible Meta app/i);
    expect(text).toMatch(/Generate token/i);
    expect(text).toMatch(/registered as a developer/i);
    expect(text).toContain(META_READ_ONLY_SCOPES[0]);
    expect(text).toContain(META_READ_ONLY_SCOPES[1]);
    expect(text).toMatch(/Do not grant ads management/i);
    expect(text).not.toMatch(/\bads_management\b/);
  });

  it("never asks operators to share a token in chat", () => {
    expect(META_CONNECT_NEVER_SHARE).toMatch(/never share/i);
    expect(META_CONNECT_NEVER_SHARE).toMatch(/chat/i);
    expect(META_CONNECT_NEVER_SHARE).toMatch(/this screen|password field/i);
    expect(META_CONNECT_PREPARE_STEPS.some((step) => step.body.includes(META_CONNECT_NEVER_SHARE))).toBe(
      true,
    );
  });
});
