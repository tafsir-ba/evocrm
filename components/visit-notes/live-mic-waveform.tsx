"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const BAR_COUNT = 24;
const MIN_LEVEL = 0.12;
const FLAT_RMS_THRESHOLD = 0.02;
const FLAT_FRAMES_BEFORE_IDLE = 24;

type WaveMode = "live" | "idle";

/**
 * Recording waveform: AnalyserNode when mic levels are real; otherwise a
 * continuous animated idle wave (never overwritten by flat analyser ticks).
 */
export function LiveMicWaveform({
  stream,
  active,
}: {
  stream: MediaStream | null;
  active: boolean;
}) {
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => MIN_LEVEL),
  );
  const [mode, setMode] = useState<WaveMode>("idle");
  const modeRef = useRef<WaveMode>("idle");
  const energyRef = useRef(0.55);
  const phaseRef = useRef(0);
  const flatFramesRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const clonedStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!active) {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
      clonedStreamRef.current?.getTracks().forEach((track) => track.stop());
      clonedStreamRef.current = null;
      setLevels(Array.from({ length: BAR_COUNT }, () => MIN_LEVEL));
      setMode("idle");
      modeRef.current = "idle";
      energyRef.current = 0.55;
      phaseRef.current = 0;
      flatFramesRef.current = 0;
      return;
    }

    let cancelled = false;
    let analyser: AnalyserNode | null = null;
    let timeData: Uint8Array<ArrayBuffer> | null = null;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    const setupAnalyser = async () => {
      if (!stream || !AudioCtx) return;
      try {
        const context = new AudioCtx();
        audioContextRef.current = context;
        if (context.state === "suspended") {
          await context.resume();
        }
        if (cancelled) {
          void context.close().catch(() => undefined);
          return;
        }

        // Clone so MediaRecorder consumers of the original stream cannot mute analysis.
        const cloned = stream.clone();
        clonedStreamRef.current = cloned;
        const source = context.createMediaStreamSource(cloned);
        analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        timeData = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
      } catch {
        analyser = null;
        timeData = null;
      }
    };

    const paintIdleWave = (energy: number) => {
      phaseRef.current += 0.22;
      const phase = phaseRef.current;
      const next = Array.from({ length: BAR_COUNT }, (_, index) => {
        const centered = index / (BAR_COUNT - 1) - 0.5;
        const envelope = 1 - Math.min(1, Math.abs(centered) * 1.35);
        const wave =
          Math.sin(phase + index * 0.45) * 0.55 +
          Math.sin(phase * 1.7 + index * 0.2) * 0.25;
        const level = MIN_LEVEL + (wave * 0.5 + 0.5) * energy * envelope;
        return Math.max(MIN_LEVEL, Math.min(1, level));
      });
      setLevels(next);
    };

    const paintLiveWave = (rms: number, peaks: number[]) => {
      const boosted = Math.min(1, rms * 6.5);
      energyRef.current = Math.min(1, energyRef.current * 0.65 + boosted * 0.9);
      phaseRef.current += 0.12 + boosted * 0.35;
      const phase = phaseRef.current;
      const next = Array.from({ length: BAR_COUNT }, (_, index) => {
        const peak = peaks[index] ?? 0;
        const centered = index / (BAR_COUNT - 1) - 0.5;
        const envelope = 1 - Math.min(1, Math.abs(centered) * 1.1);
        const shimmer = 0.5 + 0.5 * Math.sin(phase + index * 0.55);
        const level =
          MIN_LEVEL +
          (peak * 0.75 + boosted * 0.85 * shimmer) * envelope * 0.95;
        return Math.max(MIN_LEVEL, Math.min(1, level));
      });
      setLevels(next);
    };

    const tick = () => {
      if (cancelled) return;

      if (analyser && timeData) {
        analyser.getByteTimeDomainData(timeData);
        let sumSquares = 0;
        let peakAbs = 0;
        for (let i = 0; i < timeData.length; i += 1) {
          const centered = ((timeData[i] ?? 128) - 128) / 128;
          sumSquares += centered * centered;
          peakAbs = Math.max(peakAbs, Math.abs(centered));
        }
        const rms = Math.sqrt(sumSquares / timeData.length);
        const audible = rms > FLAT_RMS_THRESHOLD || peakAbs > 0.05;

        if (audible) {
          flatFramesRef.current = 0;
          if (modeRef.current !== "live") {
            modeRef.current = "live";
            setMode("live");
          }
          const bucket = Math.floor(timeData.length / BAR_COUNT);
          const peaks: number[] = [];
          for (let i = 0; i < BAR_COUNT; i += 1) {
            let localPeak = 0;
            const start = i * bucket;
            for (let j = start; j < start + bucket; j += 1) {
              const centered = Math.abs(((timeData[j] ?? 128) - 128) / 128);
              localPeak = Math.max(localPeak, centered);
            }
            peaks.push(Math.min(1, localPeak * 3.2));
          }
          paintLiveWave(rms, peaks);
        } else {
          flatFramesRef.current += 1;
          if (flatFramesRef.current >= FLAT_FRAMES_BEFORE_IDLE) {
            if (modeRef.current !== "idle") {
              modeRef.current = "idle";
              setMode("idle");
            }
            // Keep animating — never leave bars stuck on a flat silent frame.
            paintIdleWave(0.62);
          } else if (modeRef.current === "idle") {
            paintIdleWave(0.62);
          } else {
            // Brief silence while still in live mode: decay bars gently.
            paintIdleWave(Math.max(0.28, energyRef.current * 0.75));
          }
        }
      } else {
        if (modeRef.current !== "idle") {
          modeRef.current = "idle";
          setMode("idle");
        }
        paintIdleWave(0.62);
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    void setupAnalyser().finally(() => {
      if (cancelled) return;
      // Start painting immediately so the UI never shows a dead line.
      paintIdleWave(0.62);
      frameRef.current = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      clonedStreamRef.current?.getTracks().forEach((track) => track.stop());
      clonedStreamRef.current = null;
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
    };
  }, [active, stream]);

  return (
    <div
      className="flex min-w-0 flex-1 items-end justify-center"
      data-testid="live-mic-waveform"
      data-mode={mode}
      aria-hidden
    >
      <div className="flex h-10 w-full max-w-[14rem] items-end justify-center gap-[2px]">
        {levels.map((level, index) => (
          <span
            key={index}
            className={cn(
              "w-[3px] rounded-full bg-[var(--color-danger-fg)]",
              mode === "idle" && "opacity-90",
            )}
            style={{
              height: `${Math.round(6 + level * 34)}px`,
              transformOrigin: "bottom",
            }}
          />
        ))}
      </div>
    </div>
  );
}
