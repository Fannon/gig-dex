import { useEffect, useRef, useState } from "react";
import "./TempoIndicator.scss";

/** Silent beat cue, derived from a monotonic clock rather than accumulating timer drift. */
export const TempoIndicator = ({ bpm }: { bpm?: number }) => {
	const [running, setRunning] = useState(false);
	const [beat, setBeat] = useState(0);
	const start = useRef(0);
	const valid = typeof bpm === "number" && Number.isFinite(bpm) && bpm > 0 && bpm <= 400;
	useEffect(() => {
		setBeat(0);
		if (!running || !valid) return;
		start.current = performance.now();
		let timer = 0;
		const period = 60000 / bpm;
		const tick = () => {
			const elapsed = performance.now() - start.current;
			setBeat(Math.floor(elapsed / period) % 4);
			timer = window.setTimeout(tick, Math.max(8, period - (elapsed % period)));
		};
		tick();
		return () => window.clearTimeout(timer);
	}, [running, valid, bpm]);
	if (!valid) return null;
	return (
		<button
			type="button"
			className="tempo-indicator"
			aria-label={`${running ? "Stop" : "Start"} visual tempo at ${bpm} BPM`}
			aria-pressed={running}
			onClick={() => setRunning((value) => !value)}
		>
			<span>{bpm} BPM</span>
			<span className="tempo-indicator__dots" aria-hidden="true">
				{[0, 1, 2, 3].map((index) => (
					<span
						key={index}
						className={running && beat === index ? "active" : ""}
						data-beat={index + 1}
					/>
				))}
			</span>
		</button>
	);
};
