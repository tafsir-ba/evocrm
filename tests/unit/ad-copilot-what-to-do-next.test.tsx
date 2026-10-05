import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdCopilotWhatToDoNext } from "@/components/advertising/ad-copilot-what-to-do-next";
import { GrowthCampaignOverviewPanel } from "@/components/advertising/growth-campaign-overview-panel";
import { buildAdCopilotNextStep, emptyAdCopilotFunnel } from "@/lib/ad-copilot-next-step";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 403,
    json: async () => data,
  } as Response;
}

describe("AdCopilotWhatToDoNext", () => {
  it("renders the optimisation area with a Settings next action when data is stale", () => {
    const funnel = emptyAdCopilotFunnel();
    const step = buildAdCopilotNextStep({
      freshness: "stale",
      spend: 20,
      clicks: 8,
      funnel,
    });

    render(
      <AdCopilotWhatToDoNext
        step={step}
        funnel={funnel}
        settingsHref="/w/demo/settings/advertising"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "What to do next" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/nothing is changed automatically/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings → Paid ads" })).toHaveAttribute(
      "href",
      "/w/demo/settings/advertising",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not expose budget, publish, or consent controls for positive progress", () => {
    const funnel = {
      formLeads: 2,
      qualifiedLeads: 1,
      opportunities: 1,
      wins: 1,
    };
    render(
      <AdCopilotWhatToDoNext
        step={buildAdCopilotNextStep({
          freshness: "fresh",
          spend: 90,
          clicks: 30,
          funnel,
        })}
        funnel={funnel}
        settingsHref="/w/demo/settings/advertising"
      />,
    );

    expect(screen.getByText("Ads helped win a sale")).toBeInTheDocument();
    expect(screen.getByText("Won sales: 1")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Settings → Paid ads" })).not.toBeInTheDocument();
    expect(screen.queryByText(/budget|publish|consent|pause/i)).not.toBeInTheDocument();
  });
});

describe("GrowthCampaignOverviewPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows What to do next from the read-only overview payload", async () => {
    const funnel = emptyAdCopilotFunnel();
    const optimisation = buildAdCopilotNextStep({
      freshness: "fresh",
      spend: 40,
      clicks: 11,
      funnel,
    });

    global.fetch = vi.fn(async () =>
      jsonResponse({
        data: {
          overview: {
            pilot: { projectName: "Satigny duplex", marketLabel: "Geneva, Switzerland" },
            growthCampaign: {
              id: "gc-1",
              name: "Satigny duplex — paid ads",
              attributionPolicyLabel: "Last click gets the credit (v1)",
            },
            accounts: [],
            hierarchy: [],
            analytics: {
              metricTierLabel: "Media efficiency only (clicks & spend) — not the main business goal",
              spend: 40,
              clicks: 11,
              freshnessLabel: "Updated recently",
            },
            outcomes: {
              attributionLabel: "Last touch — the most recent paid click gets the credit (v1)",
              formLeads: 0,
              qualifiedLeads: 0,
              opportunities: 0,
              wonCount: 0,
              wonValue: 0,
              pipelineValue: 0,
              costPerFormLead: null,
              costPerQualifiedLead: null,
              roas: null,
              freshnessLabel: "Updated recently",
            },
            funnel,
            optimisation,
            nextStepHint: "Refresh Meta when you want newer numbers.",
            readOnly: true,
          },
        },
      }),
    ) as typeof fetch;

    render(
      <GrowthCampaignOverviewPanel workspaceSlug="demo" projectId="proj-satigny" />,
    );

    expect(await screen.findByText("What to do next")).toBeInTheDocument();
    expect(screen.getByText("Check the landing page tracking")).toBeInTheDocument();
    expect(screen.getByText("Paid ads for Satigny duplex")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish|budget|pause/i })).not.toBeInTheDocument();
  });

  it("does not invent an optimisation area when the overview API denies access", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse(
        { error: { message: "You do not have permission to view paid ads." } },
        false,
      ),
    ) as typeof fetch;

    render(
      <GrowthCampaignOverviewPanel workspaceSlug="demo" projectId="proj-satigny" />,
    );

    expect(await screen.findByText("Could not load paid ads")).toBeInTheDocument();
    expect(screen.queryByText("What to do next")).not.toBeInTheDocument();
  });

  it("omits What to do next when the overview payload lacks optimisation fields", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        data: {
          overview: {
            pilot: { projectName: "Satigny duplex", marketLabel: "Geneva, Switzerland" },
            growthCampaign: null,
            accounts: [],
            hierarchy: [],
            analytics: {
              metricTierLabel: "Media efficiency only",
              spend: 0,
              clicks: 0,
              freshnessLabel: "Not synced yet",
            },
            nextStepHint: "Create the Satigny paid-ads plan.",
            readOnly: true,
          },
        },
      }),
    ) as typeof fetch;

    render(
      <GrowthCampaignOverviewPanel workspaceSlug="demo" projectId="proj-satigny" />,
    );

    expect(await screen.findByText("Paid ads for Satigny duplex")).toBeInTheDocument();
    expect(screen.queryByText("What to do next")).not.toBeInTheDocument();
  });
});
