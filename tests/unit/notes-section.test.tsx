import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotesSection } from "@/components/activities/notes-section";

const noteType = { id: "type-note", key: "note", label: "Note" };
const taskType = { id: "type-task", key: "task", label: "Task" };
const completedStatus = {
  id: "status-done",
  key: "completed",
  label: "Completed",
  behavior: "completed",
};
const pendingStatus = {
  id: "status-pending",
  key: "pending",
  label: "Pending",
  behavior: "pending",
};

const sampleNote = {
  id: "note-1",
  title: "Called the buyer",
  description: "Called the buyer this morning.",
  createdAt: "2026-08-31T10:00:00.000Z",
  completedAt: "2026-08-31T10:00:00.000Z",
  nextActionDate: null,
  createdByUser: { id: "u1", name: "Tafsir Ba", email: "tafsir@evo-home.ch" },
  hubspotExternalActivityId: null,
};

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

describe("NotesSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(notes: unknown[] = [sampleNote]) {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/dictionary-items?type=activity_type")) {
        return jsonResponse({ data: { items: [noteType, taskType] } });
      }
      if (url.includes("/dictionary-items?type=activity_status")) {
        return jsonResponse({ data: { items: [completedStatus, pendingStatus] } });
      }
      if (url.includes("/activities?") && url.includes("typeId=type-note")) {
        return jsonResponse({ data: notes });
      }
      if (url.endsWith("/activities") && init?.method === "POST") {
        return jsonResponse({ data: { id: "note-2" } });
      }
      return jsonResponse({ error: { message: "Not found" } }, 404);
    }) as typeof fetch;
  }

  it("renders timestamped notes instead of the coming-soon placeholder", async () => {
    mockFetch();
    render(
      <NotesSection
        workspaceSlug="demo"
        workspaceTimezone="Europe/Zurich"
        leadId="507f1f77bcf86cd799439011"
        canRead
        canCreate
        canUpdate
        canArchive
      />,
    );

    expect(await screen.findByText("Called the buyer this morning.")).toBeInTheDocument();
    expect(screen.getByText(/Tafsir Ba/)).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Internal note")).toBeInTheDocument();
    expect(screen.getByLabelText("Follow up")).toBeInTheDocument();
  });

  it("saves a note and a follow-up task", async () => {
    const user = userEvent.setup();
    mockFetch([]);
    render(
      <NotesSection
        workspaceSlug="demo"
        workspaceTimezone="Europe/Zurich"
        leadId="507f1f77bcf86cd799439011"
        canRead
        canCreate
        canUpdate={false}
        canArchive={false}
      />,
    );

    await screen.findByLabelText("Internal note");
    await user.type(screen.getByLabelText("Internal note"), "Call back after the visit");
    await user.type(screen.getByLabelText("Follow up"), "2026-09-02T09:30");
    await user.click(screen.getByRole("button", { name: "Save note + follow-up" }));

    await waitFor(() => {
      const posts = vi
        .mocked(fetch)
        .mock.calls.filter(([, init]) => init && typeof init === "object" && init.method === "POST");
      expect(posts).toHaveLength(2);
    });

    const posts = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init && typeof init === "object" && init.method === "POST");
    const bodies = posts.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies[0]).toEqual(
      expect.objectContaining({
        leadId: "507f1f77bcf86cd799439011",
        typeId: "type-note",
        statusId: "status-done",
        description: "Call back after the visit",
      }),
    );
    expect(bodies[0]?.nextActionDate).toBeTruthy();
    expect(bodies[1]).toEqual(
      expect.objectContaining({
        leadId: "507f1f77bcf86cd799439011",
        typeId: "type-task",
        statusId: "status-pending",
        title: "Follow-up: Call back after the visit",
      }),
    );
    expect(bodies[1]?.dueDate).toBeTruthy();
  });

  it("hides the composer without create permission", async () => {
    mockFetch();
    render(
      <NotesSection
        workspaceSlug="demo"
        workspaceTimezone="UTC"
        leadId="507f1f77bcf86cd799439011"
        canRead
        canCreate={false}
        canUpdate={false}
        canArchive={false}
      />,
    );

    expect(await screen.findByText("Called the buyer this morning.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Internal note")).not.toBeInTheDocument();
  });
});
