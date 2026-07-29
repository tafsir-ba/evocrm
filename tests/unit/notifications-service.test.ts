import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/notifications", () => ({
  createNotification: vi.fn(),
  listNotificationsForUser: vi.fn(),
  countUnreadNotificationsForUser: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsReadForUser: vi.fn(),
}));

import {
  createNotification,
  listNotificationsForUser,
  countUnreadNotificationsForUser,
} from "@/server/repositories/notifications";
import {
  listNotificationsForCurrentUser,
  notifyFeedbackResolved,
} from "@/server/services/notifications";
import {
  buildFeedbackResolvedEmailHtml,
  buildFeedbackResolvedEmailText,
} from "@/server/email/resend";

describe("notifyFeedbackResolved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an in-app notification for a resolved bug", async () => {
    vi.mocked(createNotification).mockResolvedValue({
      id: "n-1",
      userId: "user-1",
      type: "feedback.resolved",
      title: "Your bug has been solved",
      body: "Broken drip email",
      href: "https://app.example/page",
      workspaceId: "ws-1",
      entityType: "feedback",
      entityId: "fb-1",
      readAt: null,
      meta: { category: "bug" },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await notifyFeedbackResolved({
      userId: "user-1",
      feedbackId: "fb-1",
      category: "bug",
      feedbackMessage: "Broken drip email",
      pageUrl: "https://app.example/page",
      workspaceId: "ws-1",
    });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "feedback.resolved",
        title: "Your bug has been solved",
        body: "Broken drip email",
        entityType: "feedback",
        entityId: "fb-1",
      }),
    );
  });

  it("lists notifications with unread count", async () => {
    vi.mocked(listNotificationsForUser).mockResolvedValue([
      {
        id: "n-1",
        userId: "user-1",
        type: "feedback.resolved",
        title: "Your bug has been solved",
        body: "Broken drip email",
        href: null,
        workspaceId: null,
        entityType: "feedback",
        entityId: "fb-1",
        readAt: null,
        meta: null,
        createdAt: new Date("2026-06-14T11:00:00.000Z"),
        updatedAt: new Date("2026-06-14T11:00:00.000Z"),
      },
    ]);
    vi.mocked(countUnreadNotificationsForUser).mockResolvedValue(1);

    const result = await listNotificationsForCurrentUser({ userId: "user-1" });

    expect(result.unreadCount).toBe(1);
    expect(result.items[0]?.title).toBe("Your bug has been solved");
    expect(result.items[0]?.createdAt).toBe("2026-06-14T11:00:00.000Z");
  });
});

describe("feedback resolved email copy", () => {
  it("uses bug-specific wording", () => {
    const html = buildFeedbackResolvedEmailHtml({
      reporterName: "Vanessa",
      feedbackMessage: "Drip HTML warnings",
      category: "bug",
    });
    const text = buildFeedbackResolvedEmailText({
      reporterName: "Vanessa",
      feedbackMessage: "Drip HTML warnings",
      category: "bug",
    });

    expect(html).toContain("We have solved the bug you reported:");
    expect(text).toContain("We have solved the bug you reported:");
  });
});
