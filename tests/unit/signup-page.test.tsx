import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SignupForm } from "@/components/auth/signup-form";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("signup page auth UI", () => {
  it("renders signup form with password hint fields", () => {
    render(<SignupForm />);

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByText(/min 12 chars, 1 letter, 1 number/i)).toBeInTheDocument();
    expect(document.getElementById("signup-password")).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i }),
    ).toBeInTheDocument();
  });
});
