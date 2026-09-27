import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type ChordMode, parseChordPro, transposeChordPro } from "../utils/chordEngine";
import { findSongLayout, songContentFits } from "../utils/songLayout";
import "./SongView.scss";

interface SongViewProps {
	content: string;
	title?: string;
	artist?: string;
	onContentChange?: (content: string) => void;
	onKeyChange?: (key: string | null) => void;
}

export const SongView = ({
	content,
	title: _title,
	artist: _artist,
	onContentChange,
	onKeyChange,
}: SongViewProps) => {
	const [transpose, setTranspose] = useState(0);
	const [fontSize, setFontSize] = useState(16);
	const [autoSize, setAutoSize] = useState(true);
	const [showChords, setShowChords] = useState(true);
	const [chordMode, setChordMode] = useState<ChordMode>("standard");
	const wrapperRef = useRef<HTMLElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const [layout, setLayout] = useState({ columns: 1, fits: true });
	const [measuring, setMeasuring] = useState(true);

	const parsed = useMemo(() => {
		try {
			const transposedContent = transpose === 0 ? content : transposeChordPro(content, transpose);
			return {
				...parseChordPro(transposedContent, { mode: chordMode }),
				transposedContent,
				error: null,
			};
		} catch {
			return {
				title: null,
				artist: null,
				key: null,
				tempo: null,
				html: "",
				transposedContent: content,
				error: "This song contains invalid ChordPro. Edit it to fix its formatting.",
			};
		}
	}, [content, transpose, chordMode]);

	useEffect(() => {
		onKeyChange?.(parsed.key);
	}, [onKeyChange, parsed.key]);

	// Measure the real chord/lyric tables at each candidate size and column count.
	// Refit before paint, on container changes, and after fonts finish loading.
	// biome-ignore lint/correctness/useExhaustiveDependencies: Markup and chord visibility change the measured DOM.
	useLayoutEffect(() => {
		const wrapper = wrapperRef.current;
		const contentEl = contentRef.current;
		if (!wrapper || !contentEl) return;
		let frame = 0;
		let disposed = false;
		const measure = () => {
			if (disposed || !wrapper.clientWidth || !wrapper.clientHeight) return;
			contentEl.style.height = "100%";
			const maxColumns = Math.max(1, Math.min(6, Math.floor(wrapper.clientWidth / 160)));
			const result = parsed.error
				? { fontSize: autoSize ? 18 : fontSize, columns: 1, fits: false }
				: findSongLayout(
						maxColumns,
						(size, columns) => {
							contentEl.style.fontSize = `${size}px`;
							contentEl.style.columnCount = String(columns);
							return songContentFits(contentEl);
						},
						autoSize ? undefined : fontSize,
					);
			contentEl.style.fontSize = `${result.fontSize}px`;
			contentEl.style.columnCount = String(result.columns);
			contentEl.style.height = result.fits ? "100%" : "auto";
			setLayout((previous) =>
				previous.columns === result.columns && previous.fits === result.fits
					? previous
					: { columns: result.columns, fits: result.fits },
			);
			if (autoSize) setFontSize(result.fontSize);
			setMeasuring(false);
		};
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(measure);
		};
		measure();
		const observer = new ResizeObserver(schedule);
		observer.observe(wrapper);
		void document.fonts.ready.then(schedule);
		document.fonts.addEventListener("loadingdone", schedule);
		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			observer.disconnect();
			document.fonts.removeEventListener("loadingdone", schedule);
		};
	}, [autoSize, fontSize, parsed.html, parsed.error, showChords]);

	// Update parent with transposed content if needed
	useEffect(() => {
		if (!parsed.error && transpose !== 0 && onContentChange) {
			onContentChange(parsed.transposedContent);
		}
	}, [transpose, parsed.transposedContent, parsed.error, onContentChange]);

	const handleTranspose = (delta: number) => {
		setTranspose((prev) => {
			let next = prev + delta;
			if (next > 11) next -= 12;
			if (next < -11) next += 12;
			return next;
		});
	};

	const handleFontSize = (delta: number) => {
		setAutoSize(false);
		setFontSize((prev) => Math.max(10, Math.min(48, prev + delta)));
	};

	const toggleAutoSize = () => {
		setAutoSize((prev) => !prev);
	};

	const contentProps = {
		className: `song-view__content ${!showChords ? "song-view__content--hide-chords" : ""}`,
		ref: contentRef,
		style: {
			fontSize: `${fontSize}px`,
			columnCount: layout.columns,
			height: layout.fits ? "100%" : "auto",
		},
	};

	return (
		<div
			className="song-view"
			data-layout={measuring ? "measuring" : layout.fits ? "fit" : "scroll"}
		>
			<div className="song-view__controls">
				<div className="song-view__control-group">
					<span className="song-view__control-label">Transpose</span>
					<div className="song-view__buttons">
						<button type="button" onClick={() => handleTranspose(-1)} className="song-view__btn">
							-1
						</button>
						<span className="song-view__value">{transpose > 0 ? `+${transpose}` : transpose}</span>
						<button type="button" onClick={() => handleTranspose(1)} className="song-view__btn">
							+1
						</button>
					</div>
				</div>

				<div className="song-view__control-group">
					<span className="song-view__control-label">Font Size</span>
					<div className="song-view__buttons">
						<button type="button" onClick={() => handleFontSize(-2)} className="song-view__btn">
							A-
						</button>
						<span className="song-view__value">{fontSize}px</span>
						<button type="button" onClick={() => handleFontSize(2)} className="song-view__btn">
							A+
						</button>
					</div>
					<button
						type="button"
						onClick={toggleAutoSize}
						className={`song-view__btn song-view__btn--auto ${autoSize ? "song-view__btn--active" : ""}`}
						title="Auto-fit text to screen"
						aria-pressed={autoSize}
					>
						Auto
					</button>
				</div>

				<div className="song-view__control-group">
					<label className="song-view__toggle">
						<input
							type="checkbox"
							checked={showChords}
							onChange={(e) => setShowChords(e.target.checked)}
						/>
						<span className="song-view__toggle-slider"></span>
						<span className="song-view__control-label">Chords</span>
					</label>
				</div>

				<div className="song-view__control-group">
					<span className="song-view__control-label">Notation</span>
					<div className="song-view__buttons">
						<button
							type="button"
							onClick={() => setChordMode("standard")}
							className={`song-view__btn ${chordMode === "standard" ? "song-view__btn--active" : ""}`}
							title="Standard Chords"
						>
							Std
						</button>
						<button
							type="button"
							onClick={() => setChordMode("nashville")}
							className={`song-view__btn ${chordMode === "nashville" ? "song-view__btn--active" : ""}`}
							title="Nashville Number System"
						>
							1-7
						</button>
						<button
							type="button"
							onClick={() => setChordMode("roman")}
							className={`song-view__btn ${chordMode === "roman" ? "song-view__btn--active" : ""}`}
							title="Roman Numerals"
						>
							I-V
						</button>
					</div>
				</div>
				<output className="song-view__layout-status">
					{layout.fits
						? `${layout.columns} ${layout.columns === 1 ? "column" : "columns"}`
						: "Scroll to see the whole song"}
				</output>
			</div>

			<section
				className={`song-view__wrapper ${!layout.fits ? "song-view__wrapper--scroll" : ""}`}
				ref={wrapperRef}
				tabIndex={layout.fits ? undefined : 0}
				aria-label="Song lyrics and chords"
			>
				{parsed.error ? (
					<div {...contentProps}>
						<p className="song-view__error" role="alert">
							{parsed.error}
						</p>
						<pre className="song-view__raw">{content}</pre>
					</div>
				) : (
					<div
						{...contentProps}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized HTML from chord engine
						dangerouslySetInnerHTML={{ __html: parsed.html }}
					/>
				)}
			</section>
		</div>
	);
};
