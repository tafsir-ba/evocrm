import { describe, expect, it } from "vitest";

import { CampaignModel } from "@/models/campaign";

describe("campaign enrollment rules schema", () => {
  it("persists customFieldKey on enrollment rule conditions", () => {
    const conditionsPath = CampaignModel.schema.path("enrollmentRules") as {
      schema?: { path: (name: string) => unknown };
    };
    const conditionSchema = conditionsPath.schema?.path("conditions") as {
      schema?: { path: (name: string) => { instance: string } | undefined };
    };

    expect(conditionSchema.schema?.path("customFieldKey")?.instance).toBe("String");
  });
});
