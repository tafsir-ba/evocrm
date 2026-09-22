import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VisitNotesApp } from "@/components/visit-notes/visit-notes-app";

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

const sessionFixture = {
  id: "507f1f77bcf86cd799439013",
  leadId: "507f1f77bcf86cd799439011",
  projectId: "507f1f77bcf86cd799439012",
  activityId: null,
  status: "open",
  language: null,
  title: null as string | null,
  propertyId: null as string | null,
  property: null as { id: string; title: string; reference: string | null } | null,
  messages: [] as Array<{
    id: string;
    kind: string;
    text: string | null;
    documentId: string | null;
    status: string;
    error: string | null;
    createdAt: string;
  }>,
  draftBody: null,
  aiDraft: null,
  createdAt: "2026-09-22T10:00:00.000Z",
  updatedAt: "2026-09-22T10:00:00.000Z",
  lead: {
    id: "507f1f77bcf86cd799439011",
    fullName: "Ada Buyer",
    email: "ada@example.com",
  },
  project: { id: "507f1f77bcf86cd799439012", name: "Cressy" },
};

async function openSessionUi() {
  const user = userEvent.setup();
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/leads?") && url.includes("search=")) {
      return jsonResponse({
        data: [
          {
            id: "507f1f77bcf86cd799439011",
            fullName: "Ada Buyer",
            email: "ada@example.com",
            projectId: "507f1f77bcf86cd799439012",
            project: {
              id: "507f1f77bcf86cd799439012",
              name: "Cressy",
              reference: "CRS",
            },
          },
        ],
      });
    }
    if (url.includes("/visit-sessions?") && url.includes("leadId=")) {
      return jsonResponse({ data: [] });
    }
    if (url.endsWith("/visit-sessions") && init?.method === "POST") {
      return jsonResponse({ data: { session: sessionFixture } }, 201);
    }
    return jsonResponse({ error: { message: "unexpected" } }, 500);
  }) as typeof fetch;

  render(
    <VisitNotesApp
      initialWorkspaces={[
        {
          id: "ws1",
          name: "Evo Home",
          slug: "evo-home",
          timezone: "Europe/Zurich",
        },
      ]}
      initialWorkspaceSlug="evo-home"
    />,
  );

  await user.type(screen.getByPlaceholderText(/who is this note about/i), "Ada");
  const hit = await screen.findByTestId("notes-lead-hit");
  expect(within(hit).getByText("Ada Buyer")).toBeInTheDocument();
  expect(within(hit).getByText(/ada@example\.com · Cressy \(CRS\)/i)).toBeInTheDocument();
  await user.click(hit);
  await waitFor(() => {
    expect(screen.getByLabelText(/note message/i)).toBeInTheDocument();
  });
  return user;
}

describe("VisitNotesApp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("selects a lead once and opens the conversation without a New visit gate", async () => {
    await openSessionUi();
    expect(screen.getByLabelText(/note message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add attachment/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new visit/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^workspace$/i)).not.toBeInTheDocument();
  });

  it("resumes the latest substantive session instead of an empty open one", async () => {
    const user = userEvent.setup();
    const emptyOld = {
      ...sessionFixture,
      id: "507f1f77bcf86cd7994390aa",
      status: "open",
      title: null,
      messages: [],
      createdAt: "2026-09-22T14:52:00.000Z",
      updatedAt: "2026-09-22T21:40:00.000Z",
    };
    const substantive = {
      ...sessionFixture,
      id: "507f1f77bcf86cd7994390bb",
      status: "published",
      title: "QA media check",
      messages: [
        {
          id: "msg-qa",
          kind: "text",
          text: "QA ONLY — no follow-up",
          documentId: null,
          status: "ready",
          error: null,
          createdAt: "2026-09-22T19:22:00.000Z",
        },
      ],
      createdAt: "2026-09-22T19:22:00.000Z",
      updatedAt: "2026-09-22T19:30:00.000Z",
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/leads?") && url.includes("search=")) {
        return jsonResponse({
          data: [
            {
              id: "507f1f77bcf86cd799439011",
              fullName: "Ada Buyer",
              email: "ada@example.com",
              projectId: "507f1f77bcf86cd799439012",
            },
          ],
        });
      }
      if (url.includes("/visit-sessions?") && url.includes("leadId=")) {
        return jsonResponse({ data: [emptyOld, substantive] });
      }
      if (url.includes(`/visit-sessions/${substantive.id}`)) {
        return jsonResponse({ data: { session: substantive } });
      }
      return jsonResponse({ error: { message: "unexpected" } }, 500);
    }) as typeof fetch;

    render(
      <VisitNotesApp
        initialWorkspaces={[
          {
            id: "ws1",
            name: "Evo Home",
            slug: "evo-home",
            timezone: "Europe/Zurich",
          },
        ]}
        initialWorkspaceSlug="evo-home"
      />,
    );

    await user.type(screen.getByPlaceholderText(/who is this note about/i), "Ada");
    await user.click(await screen.findByText("Ada Buyer"));
    expect(await screen.findByText("QA media check")).toBeInTheDocument();
    expect(screen.getByText("QA ONLY — no follow-up")).toBeInTheDocument();
  });

  it("keeps a ChatGPT-style composer with CRM actions after capture", async () => {
    const user = await openSessionUi();

    const footer = screen.getByLabelText(/note message/i).closest("form");
    expect(footer).toBeTruthy();
    expect(within(footer as HTMLElement).queryByText(/summarize/i)).not.toBeInTheDocument();
    expect(within(footer as HTMLElement).queryByText(/publish/i)).not.toBeInTheDocument();

    // Empty capture: after-capture CRM actions stay hidden
    expect(screen.queryByTestId("after-capture-actions")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: /record audio/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send note/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add attachment/i }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /take photo/i })).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /choose photo \/ file/i }),
    ).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /choose video/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /choose audio/i })).toBeInTheDocument();
    expect(screen.getByTestId("notes-audio-file-input")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/note message/i), "Site visit note");
    expect(screen.getByRole("button", { name: /send note/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record audio/i })).not.toBeInTheDocument();
  });

  it("shows after-capture Summarize only once messages exist", async () => {
    const user = await openSessionUi();
    expect(screen.queryByTestId("after-capture-actions")).not.toBeInTheDocument();

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/messages") && init?.method === "POST") {
          return jsonResponse({
            data: {
              session: {
                ...sessionFixture,
                messages: [
                  {
                    id: "msg-1",
                    kind: "text",
                    text: "Site visit note",
                    documentId: null,
                    status: "ready",
                    error: null,
                    createdAt: "2026-09-22T10:01:00.000Z",
                  },
                ],
              },
            },
          });
        }
        return jsonResponse({ error: { message: "unexpected" } }, 500);
      },
    );

    await user.type(screen.getByLabelText(/note message/i), "Site visit note");
    await user.click(screen.getByRole("button", { name: /send note/i }));

    const afterCapture = await screen.findByTestId("after-capture-actions");
    expect(
      within(afterCapture).getByRole("button", { name: /summarize conversation/i }),
    ).toBeInTheDocument();
    expect(
      within(afterCapture).getByRole("button", { name: /^share$/i }),
    ).toBeInTheDocument();
  });

  it("shows Retry and Remove when media upload fails (never stuck Uploading)", async () => {
    const user = await openSessionUi();

    class MockXHR {
      upload = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      status = 0;
      response: unknown = null;
      responseType = "";
      withCredentials = false;
      timeout = 0;
      open = vi.fn();
      send = vi.fn(() => {
        this.status = 503;
        this.response = {
          error: { message: "Storage upload failed. Retry in a moment." },
        };
        this.onload?.();
      });
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR as unknown as typeof XMLHttpRequest);

    const file = new File([new Uint8Array([1, 2, 3])], "shot.jpg", {
      type: "image/jpeg",
    });
    const input = document.querySelector(
      'input[accept*="image/heic"][capture]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /add attachment/i }));
    await user.click(screen.getByRole("menuitem", { name: /take photo/i }));
    await user.upload(input, file);

    const pending = await screen.findByTestId("pending-upload");
    expect(await within(pending).findByText(/storage upload failed/i)).toBeInTheDocument();
    expect(within(pending).getByRole("button", { name: /^retry$/i })).toBeInTheDocument();
    expect(within(pending).getByRole("button", { name: /^remove$/i })).toBeInTheDocument();
    expect(within(pending).queryByText(/uploading/i)).not.toBeInTheDocument();
  });

  it("opens conversation history drawer and hides legacy transcript rows", async () => {
    const user = userEvent.setup();
    const withMessages = {
      ...sessionFixture,
      title: "Parking discussion",
      messages: [
        {
          id: "msg-audio",
          kind: "audio",
          text: "They asked about parking",
          documentId: "507f1f77bcf86cd799439099",
          status: "ready",
          error: null,
          createdAt: "2026-09-22T10:01:00.000Z",
        },
        {
          id: "msg-dup",
          kind: "transcript",
          text: "They asked about parking",
          documentId: "507f1f77bcf86cd799439099",
          status: "ready",
          error: null,
          createdAt: "2026-09-22T10:01:01.000Z",
        },
      ],
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/leads?") && url.includes("search=")) {
        return jsonResponse({
          data: [
            {
              id: "507f1f77bcf86cd799439011",
              fullName: "Ada Buyer",
              email: "ada@example.com",
              projectId: "507f1f77bcf86cd799439012",
              project: {
                id: "507f1f77bcf86cd799439012",
                name: "Cressy",
                reference: "CRS",
              },
            },
          ],
        });
      }
      if (url.includes("/visit-sessions?") && url.includes("leadId=")) {
        return jsonResponse({ data: [withMessages] });
      }
      if (
        url.includes("/visit-sessions/") &&
        !url.includes("/messages") &&
        !url.includes("/transcribe") &&
        init?.method !== "POST" &&
        init?.method !== "PATCH"
      ) {
        return jsonResponse({ data: { session: withMessages } });
      }
      if (url.endsWith("/visit-sessions") && init?.method === "POST") {
        return jsonResponse({ data: { session: withMessages } }, 201);
      }
      if (url.includes("/signed-url")) {
        return jsonResponse({ data: { url: "https://example.test/audio.m4a" } });
      }
      return jsonResponse({ error: { message: "unexpected" } }, 500);
    }) as typeof fetch;

    render(
      <VisitNotesApp
        initialWorkspaces={[
          {
            id: "ws1",
            name: "Evo Home",
            slug: "evo-home",
            timezone: "Europe/Zurich",
          },
        ]}
        initialWorkspaceSlug="evo-home"
      />,
    );

    await user.type(screen.getByPlaceholderText(/who is this note about/i), "Ada");
    await user.click(await screen.findByText("Ada Buyer"));
    await waitFor(() => {
      expect(screen.getByLabelText(/note message/i)).toBeInTheDocument();
    });

    expect(screen.getByText("They asked about parking")).toBeInTheDocument();
    expect(screen.queryAllByText("They asked about parking")).toHaveLength(1);
    expect(screen.getByTestId("visit-media-audio")).toBeInTheDocument();
    expect(screen.getByTestId("notes-sticky-header")).toBeInTheDocument();
    expect(screen.queryByText(/summarize this visit/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /conversation history/i }));
    const history = await screen.findByTestId("visit-history-list");
    expect(within(history).getByText("Parking discussion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new conversation/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /conversation actions/i }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /dashboard/i })).toHaveAttribute(
      "href",
      "/w/evo-home/dashboard",
    );
    expect(within(menu).getByRole("menuitem", { name: /exit notes/i })).toHaveAttribute(
      "href",
      "/w/evo-home/dashboard",
    );
    expect(within(menu).getByRole("menuitem", { name: /link unit|change unit/i })).toBeInTheDocument();
    expect(within(menu).getByTestId("notes-open-lead")).toHaveAttribute(
      "href",
      "/w/evo-home/leads/507f1f77bcf86cd799439011",
    );
    expect(within(menu).getByRole("menuitem", { name: /open lead/i })).toBeInTheDocument();
  });
});
