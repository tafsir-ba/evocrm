import { beforeEach, describe, expect, it } from "vitest";

import {
  assertWebsiteLeadContentLength,
  MAX_WEBSITE_LEAD_REQUEST_BYTES,
} from "@/server/security/website-lead-request-guards";
import { AppError } from "@/server/errors";

describe("assertWebsiteLeadContentLength", () => {
  it("allows requests within the JSON body cap", () => {
    expect(() =>
      assertWebsiteLeadContentLength(
        new Request("http://localhost/api/integrations/website/leads", {
          method: "POST",
          headers: { "Content-Length": String(MAX_WEBSITE_LEAD_REQUEST_BYTES) },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects requests above the JSON body cap before parsing", () => {
    expect(() =>
      assertWebsiteLeadContentLength(
        new Request("http://localhost/api/integrations/website/leads", {
          method: "POST",
          headers: {
            "Content-Length": String(MAX_WEBSITE_LEAD_REQUEST_BYTES + 1),
          },
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AppError>>({
        code: "VALIDATION_ERROR",
        message: "Request body is too large.",
      }),
    );
  });

  it("skips the check when Content-Length is absent", () => {
    expect(() =>
      assertWebsiteLeadContentLength(
        new Request("http://localhost/api/integrations/website/leads", {
          method: "POST",
        }),
      ),
    ).not.toThrow();
  });
});
