import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CredentialsLoginForm } from "@/components/auth/credentials-login-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("login page auth UI", () => {
  it("renders Google sign-in button", () => {
    render(<GoogleSignInButton />);

    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument();
  });

  it("renders email/password login form", () => {
    render(<CredentialsLoginForm />);

    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in with email/i }),
    ).toBeInTheDocument();
  });
});
