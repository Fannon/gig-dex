import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ChordMode, parseChordPro, transposeChordPro } from "../utils/chordEngine";
import "./SongView.scss";

interface SongViewProps {
	content: string;
	title?: string;
	artist?: string;
	onContentChange?: (content: string) => void;
}

export const SongView = ({
	content,
	title: _title,
	artist: _artist,
	onContentChange,
}: SongViewProps) => {
	const [transpose, setTranspose] = useState(0);
	const [fontSize, setFontSize] = useState(16);
	const [autoSize, setAutoSize] = useState(true);
	const [showChords, setShowChords] = useState(true);
	const [chordMode, setChordMode] = useState<ChordMode>("standard");
	const wrapperRef = useRef<HTMLDivElement>(null);
	const resizeObserverRef = useRef<ResizeObserver | null>(null);

	// Transpose the content
	const transposedContent = useMemo(() => {
		if (transpose === 0) return content;
		return transposeChordPro(content, transpose);
	}, [content, transpose]);

	// Parse to HTML
	const parsed = useMemo(() => {
		return parseChordPro(transposedContent, { mode: chordMode });
	}, [transposedContent, chordMode]);

	// Check if content fits without overflow
	const doesContentFit = useCallback(
		(wrapper: HTMLDivElement, contentEl: HTMLDivElement): boolean => {
			const wrapperRect = wrapper.getBoundingClientRect();
			const contentStyle = window.getComputedStyle(contentEl);

			// Get number of columns
			const columnCount = parseInt(contentStyle.columnCount, 10) || 1;
			const columnGap = parseFloat(contentStyle.columnGap) || 16;
			const padding = parseFloat(contentStyle.paddingLeft) + parseFloat(contentStyle.paddingRight);

			// Calculate max width per column
			const availableWidth = wrapperRect.width - padding;
			const columnWidth = (availableWidth - columnGap * (columnCount - 1)) / columnCount;

			// Check if any table is wider than the column width
			const tables = contentEl.querySelectorAll("table");
			for (const table of tables) {
				if (table.offsetWidth > columnWidth + 10) {
					return false;
				}
			}

			// Check vertical overflow - if content scrollHeight exceeds wrapper height
			if (contentEl.scrollHeight > wrapperRect.height + 5) {
				return false;
			}

			return true;
		},
		[],
	);

	// Calculate optimal font size
	const calculateOptimalFontSize = useCallback(() => {
		if (!wrapperRef.current || !autoSize) return;

		const wrapper = wrapperRef.current;
		const contentEl = wrapper.querySelector(".song-view__content") as HTMLDivElement;
		if (!contentEl) return;

		const maxSize = 36; // Reasonable max
		const minSize = 10;
		let optimalSize = minSize;

		// Scale up from min until content doesn't fit
		for (let size = minSize; size <= maxSize; size++) {
			contentEl.style.fontSize = `${size}px`;

			// Force layout recalculation
			void contentEl.offsetHeight;

			if (!doesContentFit(wrapper, contentEl)) {
				// This size is too big, use previous
				optimalSize = Math.max(minSize, size - 1);
				break;
			}
			optimalSize = size;
		}

		// Apply final size
		contentEl.style.fontSize = `${optimalSize}px`;
		setFontSize(optimalSize);
	}, [autoSize, doesContentFit]);

	// Use ResizeObserver for accurate resize detection
	useEffect(() => {
		if (!wrapperRef.current) return;

		resizeObserverRef.current = new ResizeObserver(() => {
			if (autoSize) {
				calculateOptimalFontSize();
			}
		});

		resizeObserverRef.current.observe(wrapperRef.current);

		return () => {
			resizeObserverRef.current?.disconnect();
		};
	}, [autoSize, calculateOptimalFontSize]);

	// Initial calculation and recalculate when content/chords change
	// biome-ignore lint/correctness/useExhaustiveDependencies: Re-run auto-fit after visible song markup changes.
	useEffect(() => {
		if (autoSize) {
			const timeout = setTimeout(() => {
				calculateOptimalFontSize();
			}, 150);
			return () => clearTimeout(timeout);
		}
	}, [autoSize, calculateOptimalFontSize, parsed.html, showChords]);

	// Update parent with transposed content if needed
	useEffect(() => {
		if (transpose !== 0 && onContentChange) {
			onContentChange(transposedContent);
		}
	}, [transpose, transposedContent, onContentChange]);

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

	return (
		<div className="song-view">
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
			</div>

			<div className="song-view__wrapper" ref={wrapperRef}>
				<div
					className={`song-view__content ${!showChords ? "song-view__content--hide-chords" : ""}`}
					style={{ fontSize: `${fontSize}px` }}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized HTML from chord engine
					dangerouslySetInnerHTML={{ __html: parsed.html }}
				/>
			</div>
		</div>
	);
};
