import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveMicWaveform } from "@/components/visit-notes/live-mic-waveform";

describe("LiveMicWaveform", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders bars and switches to labelled fallback when analyser is unavailable", async () => {
    const originalAudio = window.AudioContext;
    // @ts-expect-error override for test
    window.AudioContext = undefined;
    // @ts-expect-error override for test
    window.webkitAudioContext = undefined;

    const stream = { getTracks: () => [] } as unknown as MediaStream;
    render(<LiveMicWaveform stream={stream} active />);

    const root = await screen.findByTestId("live-mic-waveform");
    expect(root).toBeInTheDocument();
    await waitFor(() => {
      expect(root).toHaveAttribute("data-mode", "fallback");
    });
    expect(screen.getByText(/waveform \(approx\)/i)).toBeInTheDocument();

    window.AudioContext = originalAudio;
  });

  it("keeps visible bar heights while recording in fallback mode", async () => {
    // @ts-expect-error override for test
    window.AudioContext = undefined;
    // @ts-expect-error override for test
    window.webkitAudioContext = undefined;

    const stream = { getTracks: () => [] } as unknown as MediaStream;
    render(<LiveMicWaveform stream={stream} active />);

    const root = await screen.findByTestId("live-mic-waveform");
    expect(root).toHaveAttribute("data-mode", "fallback");
    const heights = [...root.querySelectorAll("[style]")].map((el) =>
      Number.parseInt((el as HTMLElement).style.height || "0", 10),
    );
    expect(heights.length).toBeGreaterThanOrEqual(5);
    expect(heights.every((h) => h >= 8)).toBe(true);
    expect(Math.max(...heights)).toBeGreaterThanOrEqual(8);
  });
});
