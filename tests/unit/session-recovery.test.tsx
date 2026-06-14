import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SessionRecovery } from "@/components/auth/session-recovery";

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signOut: signOutMock,
}));

describe("SessionRecovery", () => {
  beforeEach(() => {
    signOutMock.mockReset();
  });

  it("clears stale sessions through the client signout flow", async () => {
    render(<SessionRecovery />);

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/login" });
    });
  });

  it("supports retrying when session cleanup fails", async () => {
    signOutMock.mockRejectedValueOnce(new Error("network"));

    render(<SessionRecovery />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /we could not refresh your session automatically/i,
    );

    signOutMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(2);
    });
  });
});
