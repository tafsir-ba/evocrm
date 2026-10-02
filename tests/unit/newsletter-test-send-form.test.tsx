import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const routerMock = { replace, push, refresh };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/components/layout/workspace-shell-context", () => ({
  useWorkspaceShell: () => ({
    workspace: {
      id: "ws-1",
      name: "Demo",
      slug: "demo",
      timezone: "Europe/Zurich",
      defaultCurrency: "CHF",
      initials: "DE",
    },
  }),
}));

vi.mock("@/components/campaigns/campaign-sending-domain-field", () => ({
  CampaignSendingDomainField: ({
    value,
    onChange,
  }: {
    value: { sendingDomainId: string; senderEmail: string };
    onChange: (value: { sendingDomainId: string; senderEmail: string }) => void;
  }) => (
    <div>
      <label htmlFor="mock-sending-domain">Sending domain</label>
      <input
        id="mock-sending-domain"
        value={value.sendingDomainId}
        onChange={(event) =>
          onChange({ ...value, sendingDomainId: event.target.value })
        }
      />
      <label htmlFor="mock-sender-email">Sender email</label>
      <input
        id="mock-sender-email"
        value={value.senderEmail}
        onChange={(event) =>
          onChange({ ...value, senderEmail: event.target.value })
        }
      />
    </div>
  ),
}));

import { NewsletterFormPage } from "@/components/newsletters/newsletter-form-page";

const DOMAIN_ID = "507f1f77bcf86cd799439011";
const CAMPAIGN_ID = "507f1f77bcf86cd799439012";
const STEP_ID = "507f1f77bcf86cd799439013";

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (status >= 200 && status < 300 ? { data } : data),
  } as Response;
}

describe("NewsletterFormPage test-send CTA", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockReset();

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/projects") && method === "GET") {
        return jsonResponse({ projects: [] });
      }
      if (url.includes("/tags?") && method === "GET") {
        return jsonResponse({ tags: [] });
      }
      if (url.endsWith("/campaigns") && method === "POST") {
        return jsonResponse(
          {
            campaign: {
              id: CAMPAIGN_ID,
              name: "Spring update",
              kind: "newsletter",
              status: "draft",
              senderName: "Evo Home",
              senderEmail: "hello@crm.evo-home.ch",
              sendingDomainId: DOMAIN_ID,
              defaultFromName: "Evo Home",
              scheduledFor: null,
              audienceLockedAt: null,
              audienceSummary: null,
            },
          },
          201,
        );
      }
      if (url.endsWith(`/campaigns/${CAMPAIGN_ID}/steps`) && method === "POST") {
        return jsonResponse({ step: { id: STEP_ID } }, 201);
      }
      if (url.endsWith(`/newsletters/${CAMPAIGN_ID}/test-send`) && method === "POST") {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: "VALIDATION_ERROR",
              message: "Email sending is not configured.",
            },
          }),
        } as Response;
      }

      return jsonResponse({});
    });
  });

  it("shows API failures beside the Send a test CTA instead of failing silently", async () => {
    const user = userEvent.setup();
    render(
      <NewsletterFormPage workspaceSlug="demo" mode="create" canUpdate />,
    );

    await user.type(screen.getByLabelText(/internal name/i), "Spring update");
    await user.type(screen.getByLabelText(/email subject/i), "Hello there");
    await user.type(screen.getByLabelText(/from name/i), "Evo Home");
    await user.type(screen.getByLabelText(/sending domain/i), DOMAIN_ID);
    await user.type(
      screen.getByLabelText(/sender email/i),
      "hello@crm.evo-home.ch",
    );
    await user.type(
      screen.getByLabelText(/html email/i),
      "<p>Hello {first_name}</p>",
    );
    await user.type(
      screen.getByLabelText(/test addresses/i),
      "vanessa@evo-home.ch",
    );

    await user.click(screen.getByRole("button", { name: /send test email/i }));

    await waitFor(() => {
      expect(
        screen.getAllByText(/email sending is not configured/i).length,
      ).toBeGreaterThan(0);
    });

    const testSendCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(([input]) =>
        String(input).includes(`/newsletters/${CAMPAIGN_ID}/test-send`),
      );
    expect(testSendCalls).toHaveLength(1);
    expect(testSendCalls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ emails: ["vanessa@evo-home.ch"] }),
    });
  });

  it("shows success beside the CTA when test-send works", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/projects") && method === "GET") {
          return jsonResponse({ projects: [] });
        }
        if (url.includes("/tags?") && method === "GET") {
          return jsonResponse({ tags: [] });
        }
        if (url.endsWith("/campaigns") && method === "POST") {
          return jsonResponse(
            {
              campaign: {
                id: CAMPAIGN_ID,
                name: "Spring update",
                kind: "newsletter",
                status: "draft",
                senderName: "Evo Home",
                senderEmail: "hello@crm.evo-home.ch",
                sendingDomainId: DOMAIN_ID,
                defaultFromName: "Evo Home",
                scheduledFor: null,
                audienceLockedAt: null,
                audienceSummary: null,
              },
            },
            201,
          );
        }
        if (url.endsWith(`/campaigns/${CAMPAIGN_ID}/steps`) && method === "POST") {
          return jsonResponse({ step: { id: STEP_ID } }, 201);
        }
        if (url.endsWith(`/newsletters/${CAMPAIGN_ID}/test-send`) && method === "POST") {
          return jsonResponse({ sent: 1, messageIds: ["msg-1"] });
        }
        return jsonResponse({});
      },
    );

    render(
      <NewsletterFormPage workspaceSlug="demo" mode="create" canUpdate />,
    );

    await user.type(screen.getByLabelText(/internal name/i), "Spring update");
    await user.type(screen.getByLabelText(/email subject/i), "Hello there");
    await user.type(screen.getByLabelText(/from name/i), "Evo Home");
    await user.type(screen.getByLabelText(/sending domain/i), DOMAIN_ID);
    await user.type(
      screen.getByLabelText(/sender email/i),
      "hello@crm.evo-home.ch",
    );
    await user.type(
      screen.getByLabelText(/html email/i),
      "<p>Hello {first_name}</p>",
    );
    await user.type(
      screen.getByLabelText(/test addresses/i),
      "vanessa@evo-home.ch",
    );

    await user.click(screen.getByRole("button", { name: /send test email/i }));

    await waitFor(() => {
      // Mirrored beside the CTA (not only the top-of-form banner).
      expect(screen.getAllByText(/test email sent/i).length).toBeGreaterThan(1);
    });
  });

  it("includes channel on step create but omits it on step update (strict schema)", async () => {
    const user = userEvent.setup();
    const PROJECT_ID = "507f1f77bcf86cd799439014";

    vi.mocked(global.fetch).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/projects") && method === "GET") {
          return jsonResponse({
            projects: [{ id: PROJECT_ID, name: "Geneva", code: "GE" }],
          });
        }
        if (url.includes("/tags?") && method === "GET") {
          return jsonResponse({ tags: [] });
        }
        if (url.endsWith(`/campaigns/${CAMPAIGN_ID}`) && method === "GET") {
          return jsonResponse({
            campaign: {
              id: CAMPAIGN_ID,
              name: "Spring update",
              kind: "newsletter",
              status: "draft",
              senderName: "Evo Home",
              senderEmail: "hello@crm.evo-home.ch",
              sendingDomainId: DOMAIN_ID,
              defaultFromName: "Evo Home",
              scheduledFor: null,
              audienceLockedAt: null,
              audienceSummary: null,
              unknownConsentPolicy: "include_and_flag",
            },
          });
        }
        if (url.endsWith(`/campaigns/${CAMPAIGN_ID}/steps`) && method === "GET") {
          return jsonResponse({
            steps: [
              {
                id: STEP_ID,
                subject: "Hello there",
                previewText: null,
                bodyHtml: "<p>Hello</p>",
                bodyText: "Hello",
                contentMode: "html",
                status: "ready",
                fromName: "Evo Home",
              },
            ],
          });
        }
        if (
          url.endsWith(`/newsletters/${CAMPAIGN_ID}/audience/segments`) &&
          method === "GET"
        ) {
          return jsonResponse({
            segments: [
              {
                id: "seg-1",
                type: "project_tags",
                projectId: PROJECT_ID,
                tagIds: [],
                tagMatch: "any",
              },
            ],
          });
        }
        if (url.includes(`/newsletters/${CAMPAIGN_ID}/audience/preview`)) {
          return jsonResponse({
            summary: {
              queued: 1,
              excludedMissingEmail: 0,
              excludedUnsubscribed: 0,
              excludedSuppressed: 0,
              excludedInvalid: 0,
              excludedArchived: 0,
              unknownConsent: 0,
              deduped: 0,
            },
            flaggedUnknownConsentSample: [],
            exclusionCounts: {
              missingEmail: 0,
              unsubscribed: 0,
              suppressed: 0,
              invalid: 0,
              archived: 0,
              unknownConsent: 0,
            },
            exclusions: {
              items: [],
              total: 0,
              page: 1,
              pageSize: 25,
              totalPages: 0,
            },
          });
        }
        if (url.endsWith(`/campaigns/${CAMPAIGN_ID}`) && method === "PATCH") {
          return jsonResponse({
            campaign: {
              id: CAMPAIGN_ID,
              name: "Spring update",
              kind: "newsletter",
              status: "draft",
              senderName: "Evo Home",
              senderEmail: "hello@crm.evo-home.ch",
              sendingDomainId: DOMAIN_ID,
              defaultFromName: "Evo Home",
              scheduledFor: null,
              audienceLockedAt: null,
              audienceSummary: null,
            },
          });
        }
        if (
          url.endsWith(`/campaigns/${CAMPAIGN_ID}/steps/${STEP_ID}`) &&
          method === "PATCH"
        ) {
          return jsonResponse({ step: { id: STEP_ID } });
        }
        if (
          url.endsWith(`/newsletters/${CAMPAIGN_ID}/audience/segments`) &&
          method === "PUT"
        ) {
          return jsonResponse({ segments: [] });
        }
        if (url.endsWith(`/newsletters/${CAMPAIGN_ID}/test-send`) && method === "POST") {
          return jsonResponse({ sent: 1, messageIds: ["msg-1"] });
        }
        return jsonResponse({});
      },
    );

    render(
      <NewsletterFormPage
        workspaceSlug="demo"
        mode="edit"
        campaignId={CAMPAIGN_ID}
        canUpdate
      />,
    );

    await waitFor(
      () => {
        expect(screen.queryByText(/Loading your newsletter/i)).not.toBeInTheDocument();
        expect(screen.getByLabelText(/email subject/i)).toHaveValue("Hello there");
        expect(screen.getByLabelText(/test addresses/i)).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    await user.type(
      screen.getByLabelText(/test addresses/i),
      "vanessa@evo-home.ch",
    );
    await user.click(screen.getByRole("button", { name: /send test email/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/test email sent/i).length).toBeGreaterThan(0);
    });

    const stepPatchCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith(`/campaigns/${CAMPAIGN_ID}/steps/${STEP_ID}`) &&
          (init?.method ?? "GET") === "PATCH",
      );
    expect(stepPatchCalls.length).toBeGreaterThanOrEqual(1);

    for (const [, init] of stepPatchCalls) {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      expect(body).not.toHaveProperty("channel");
      expect(body).toMatchObject({
        status: "ready",
        contentMode: "html",
        subject: "Hello there",
      });
    }

    const stepCreateCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith(`/campaigns/${CAMPAIGN_ID}/steps`) &&
          (init?.method ?? "GET") === "POST",
      );
    expect(stepCreateCalls).toHaveLength(0);
  });

  it("sends channel on first-time step create during content-only save", async () => {
    const user = userEvent.setup();
    render(
      <NewsletterFormPage workspaceSlug="demo" mode="create" canUpdate />,
    );

    await user.type(screen.getByLabelText(/internal name/i), "Spring update");
    await user.type(screen.getByLabelText(/email subject/i), "Hello there");
    await user.type(screen.getByLabelText(/from name/i), "Evo Home");
    await user.type(screen.getByLabelText(/sending domain/i), DOMAIN_ID);
    await user.type(
      screen.getByLabelText(/sender email/i),
      "hello@crm.evo-home.ch",
    );
    await user.type(
      screen.getByLabelText(/html email/i),
      "<p>Hello {first_name}</p>",
    );
    await user.type(
      screen.getByLabelText(/test addresses/i),
      "vanessa@evo-home.ch",
    );

    await user.click(screen.getByRole("button", { name: /send test email/i }));

    await waitFor(() => {
      expect(
        screen.getAllByText(/email sending is not configured/i).length,
      ).toBeGreaterThan(0);
    });

    const stepCreateCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith(`/campaigns/${CAMPAIGN_ID}/steps`) &&
          (init?.method ?? "GET") === "POST",
      );
    expect(stepCreateCalls).toHaveLength(1);
    const createBody = JSON.parse(
      String(stepCreateCalls[0]?.[1]?.body ?? "{}"),
    ) as Record<string, unknown>;
    expect(createBody.channel).toBe("email");
  });
});
