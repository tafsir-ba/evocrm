import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveMicWaveform } from "@/components/visit-notes/live-mic-waveform";

describe("LiveMicWaveform", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps animating bars when AudioContext is unavailable (idle mode)", async () => {
    const originalAudio = window.AudioContext;
    // @ts-expect-error override for test
    window.AudioContext = undefined;
    // @ts-expect-error override for test
    window.webkitAudioContext = undefined;

    const stream = {
      clone: () => ({ getTracks: () => [] }),
      getTracks: () => [],
    } as unknown as MediaStream;

    render(<LiveMicWaveform stream={stream} active />);

    const root = await screen.findByTestId("live-mic-waveform");
    expect(root).toBeInTheDocument();
    await waitFor(() => {
      expect(root).toHaveAttribute("data-mode", "idle");
    });

    const readHeights = () =>
      [...root.querySelectorAll("span")].map((el) =>
        Number.parseInt((el as HTMLElement).style.height || "0", 10),
      );

    const first = readHeights();
    expect(first.length).toBeGreaterThanOrEqual(12);
    expect(first.every((h) => h >= 6)).toBe(true);
    expect(Math.max(...first)).toBeGreaterThan(10);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    const second = readHeights();
    // At least one bar height should change while the idle wave runs.
    expect(second.some((height, index) => height !== first[index])).toBe(true);

    window.AudioContext = originalAudio;
  });

  it("never leaves bars stuck at the minimum when recording without analyser", async () => {
    // @ts-expect-error override for test
    window.AudioContext = undefined;
    // @ts-expect-error override for test
    window.webkitAudioContext = undefined;

    const stream = {
      clone: () => ({ getTracks: () => [] }),
      getTracks: () => [],
    } as unknown as MediaStream;

    render(<LiveMicWaveform stream={stream} active />);

    const root = await screen.findByTestId("live-mic-waveform");
    await waitFor(() => {
      const heights = [...root.querySelectorAll("span")].map((el) =>
        Number.parseInt((el as HTMLElement).style.height || "0", 10),
      );
      expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(4);
    });
  });
});
