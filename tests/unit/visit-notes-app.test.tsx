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

  await user.type(screen.getByPlaceholderText(/search lead/i), "Ada");
  expect(await screen.findByText("Ada Buyer")).toBeInTheDocument();
  await user.click(screen.getByText("Ada Buyer"));
  await user.click(screen.getByRole("button", { name: /new visit/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/visit note/i)).toBeInTheDocument();
  });
  return user;
}

describe("VisitNotesApp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("searches leads and starts a visit session", async () => {
    await openSessionUi();
    expect(screen.getByText(/Cressy/)).toBeInTheDocument();
    expect(screen.getByLabelText(/visit note/i)).toBeInTheDocument();
  });

  it("uses ChatGPT-style composer: plus menu, mic when empty, send when text", async () => {
    const user = await openSessionUi();

    expect(screen.getByRole("button", { name: /record audio/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send note/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /summarize this visit/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add attachment/i }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /take photo/i })).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /choose photo \/ file/i }),
    ).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /choose video/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add photo$/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/visit note/i), "Site visit note");
    expect(screen.getByRole("button", { name: /send note/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record audio/i })).not.toBeInTheDocument();
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
});
