import { describe, expect, it } from "vitest";

import {
  NEWSLETTER_AUDIENCE_SEGMENT_MAX,
  newsletterAudienceSegmentsInputSchema,
} from "@/server/validation/newsletters";

describe("newsletter audience segment validation", () => {
  it("accepts multi-segment project_tags and csv_import unions", () => {
    const parsed = newsletterAudienceSegmentsInputSchema.parse({
      segments: [
        {
          type: "project_tags",
          projectId: "507f1f77bcf86cd799439011",
          tagIds: ["507f1f77bcf86cd799439012"],
          tagMatch: "any",
        },
        {
          type: "csv_import",
          projectId: "507f1f77bcf86cd799439011",
          importJobId: "507f1f77bcf86cd799439013",
          applyTagId: "507f1f77bcf86cd799439014",
        },
      ],
    });

    expect(parsed.segments).toHaveLength(2);
    expect(parsed.segments[1]?.type).toBe("csv_import");
  });

  it("rejects more than the max segments", () => {
    const segments = Array.from({ length: NEWSLETTER_AUDIENCE_SEGMENT_MAX + 1 }, () => ({
      type: "project_tags" as const,
      projectId: "507f1f77bcf86cd799439011",
      tagIds: [],
      tagMatch: "any" as const,
    }));

    expect(() =>
      newsletterAudienceSegmentsInputSchema.parse({ segments }),
    ).toThrow();
  });

  it("requires importJobId for csv_import segments", () => {
    expect(() =>
      newsletterAudienceSegmentsInputSchema.parse({
        segments: [
          {
            type: "csv_import",
            projectId: "507f1f77bcf86cd799439011",
          },
        ],
      }),
    ).toThrow();
  });
});
