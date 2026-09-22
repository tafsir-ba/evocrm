"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const BAR_COUNT = 7;

/**
 * Live mic level meter driven by Web Audio AnalyserNode.
 * Resumes AudioContext (Safari), uses time-domain RMS for visible motion,
 * and falls back to a labelled animated waveform if analyser output stays flat.
 */
export function LiveMicWaveform({
  stream,
  active,
}: {
  stream: MediaStream | null;
  active: boolean;
}) {
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 0.15),
  );
  const [mode, setMode] = useState<"live" | "fallback">("live");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const flatFramesRef = useRef(0);

  useEffect(() => {
    if (!active || !stream) {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      setLevels(Array.from({ length: BAR_COUNT }, () => 0.15));
      setMode("live");
      flatFramesRef.current = 0;
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) {
      setMode("fallback");
      return;
    }

    let cancelled = false;
    const context = new AudioCtx();
    audioContextRef.current = context;

    const run = async () => {
      try {
        if (context.state === "suspended") {
          await context.resume();
        }
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.35;
        source.connect(analyser);
        analyserRef.current = analyser;
        const timeData = new Uint8Array(analyser.fftSize);
        const freqData = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled || !analyserRef.current) return;
          analyser.getByteTimeDomainData(timeData);
          analyser.getByteFrequencyData(freqData);

          let sumSquares = 0;
          for (let i = 0; i < timeData.length; i += 1) {
            const centered = ((timeData[i] ?? 128) - 128) / 128;
            sumSquares += centered * centered;
          }
          const rms = Math.sqrt(sumSquares / timeData.length);
          const boosted = Math.min(1, rms * 4.5);

          const next: number[] = [];
          const slice = Math.floor(freqData.length / BAR_COUNT);
          for (let i = 0; i < BAR_COUNT; i += 1) {
            let sum = 0;
            const start = i * slice;
            for (let j = start; j < start + slice; j += 1) {
              sum += freqData[j] ?? 0;
            }
            const band = Math.min(1, sum / (slice * 140));
            // Blend RMS (always moves with voice) with band energy for shape.
            next.push(Math.max(0.22, Math.min(1, band * 0.55 + boosted * 0.95)));
          }
          setLevels(next);

          const variance =
            Math.max(...next) - Math.min(...next);
          if (boosted < 0.03 || variance < 0.04) {
            flatFramesRef.current += 1;
            if (flatFramesRef.current > 18) {
              setMode("fallback");
            }
          } else {
            flatFramesRef.current = 0;
            setMode("live");
          }

          frameRef.current = requestAnimationFrame(tick);
        };
        frameRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setMode("fallback");
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      analyserRef.current = null;
      void context.close().catch(() => undefined);
      if (audioContextRef.current === context) {
        audioContextRef.current = null;
      }
    };
  }, [active, stream]);

  useEffect(() => {
    if (!active || mode !== "fallback") return;
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      setLevels(
        Array.from({ length: BAR_COUNT }, (_, index) => {
          const wave = Math.sin(frame / 4 + index * 0.7);
          return 0.25 + (wave + 1) * 0.28;
        }),
      );
    }, 80);
    return () => window.clearInterval(id);
  }, [active, mode]);

  return (
    <div
      className="flex min-w-0 flex-col gap-0.5"
      data-testid="live-mic-waveform"
      data-mode={mode}
      aria-hidden
    >
      <div className="flex h-7 items-end gap-0.5">
        {levels.map((level, index) => (
          <span
            key={index}
            className={cn(
              "w-1.5 rounded-full bg-[var(--color-danger-fg)]",
              mode === "fallback" && "opacity-80",
            )}
            style={{
              height: `${Math.round(8 + level * 20)}px`,
              transition: "height 60ms linear",
            }}
          />
        ))}
      </div>
      {mode === "fallback" && (
        <span className="text-[10px] leading-none text-[var(--color-ink-faint)]">
          Waveform (approx)
        </span>
      )}
    </div>
  );
}
