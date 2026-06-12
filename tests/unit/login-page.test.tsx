import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

describe("login page auth UI", () => {
  it("renders Google sign-in button", () => {
    render(<GoogleSignInButton />);

    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument();
  });
});
