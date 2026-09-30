import { useEffect, useRef, useState } from "react";
import { tempoMeter, tempoPeriod } from "../utils/tempo";
import "./TempoIndicator.scss";

/** Silent beat cue, derived from a monotonic clock rather than accumulating timer drift. */
export const TempoIndicator = ({
  compact = false,
  badge = false,
  bpm,
  time,
  runningValue,
  onRunningChange,
}: {
  compact?: boolean;
  badge?: boolean;
  bpm?: number;
  time?: string;
  runningValue?: boolean;
  onRunningChange?: (running: boolean) => void;
}) => {
  const { beats, division, label } = tempoMeter(time);
  const [localRunning, setRunning] = useState(false);
  const running = runningValue ?? localRunning;
  const [beat, setBeat] = useState(0);
  const start = useRef(0);
  const valid = typeof bpm === "number" && Number.isFinite(bpm) && bpm > 0 && bpm <= 400;
  useEffect(() => {
    setBeat(0);
    if (!running || !valid) return;
    start.current = performance.now();
    let timer = 0;
    const period = tempoPeriod(bpm, division);
    const tick = () => {
      const elapsed = performance.now() - start.current;
      setBeat(Math.floor(elapsed / period) % beats);
      timer = window.setTimeout(tick, Math.max(8, period - (elapsed % period)));
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [running, valid, bpm, beats, division]);
  if (!valid) return null;
  return (
    <button
      type="button"
      className={`tempo-indicator ${badge ? "tempo-indicator--badge" : ""}`}
      aria-label={`${running ? "Stop" : "Start"} visual tempo at ${bpm} BPM`}
      aria-pressed={running}
      title={`${bpm} BPM · ${label}: ${beats} beats per bar; quarter-note BPM`}
      data-meter={label}
      onClick={() => {
        if (onRunningChange) onRunningChange(!running);
        else setRunning(!running);
      }}
    >
      {!compact && (
        <span className="tempo-indicator__label">
          {bpm}
          {badge ? "bpm" : " BPM"}
        </span>
      )}
      <span className="tempo-indicator__dots" aria-hidden="true">
        {Array.from({ length: beats }, (_, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: Dots represent fixed beat positions in a bar.
            key={index}
            className={running && beat === index ? "active" : ""}
            data-beat={index + 1}
            data-first={index === 0}
          />
        ))}
      </span>
    </button>
  );
};
