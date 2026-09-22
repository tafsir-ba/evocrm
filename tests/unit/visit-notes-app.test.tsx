import { render, screen, waitFor } from "@testing-library/react";
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

describe("VisitNotesApp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("searches leads and starts a visit session", async () => {
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
        return jsonResponse(
          {
            data: {
              session: {
                id: "507f1f77bcf86cd799439013",
                leadId: "507f1f77bcf86cd799439011",
                projectId: "507f1f77bcf86cd799439012",
                activityId: null,
                status: "open",
                language: null,
                messages: [],
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
              },
            },
          },
          201,
        );
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

    expect(screen.getByText("Visit Notes")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/search lead/i), "Ada");
    expect(await screen.findByText("Ada Buyer")).toBeInTheDocument();
    await user.click(screen.getByText("Ada Buyer"));
    await user.click(screen.getByRole("button", { name: /new visit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Cressy/)).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/type a visit note/i)).toBeInTheDocument();
  });
});
