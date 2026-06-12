/**
 * Vitest setup — mock server-only so server modules can be unit tested.
 */
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
