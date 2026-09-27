import { type RefObject, useEffect, useState } from "react";
import { contentSignature, readingPages } from "../utils/readingPosition";

export function useSongReading(
	wrapperRef: RefObject<HTMLElement | null>,
	contentRef: RefObject<HTMLDivElement | null>,
	readingKey: string | undefined,
	content: string,
	geometry: string,
	paginated: boolean,
) {
	const [pages, setPages] = useState([0]);
	const [page, setPage] = useState(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Controls change rendered geometry and require a fresh restoration.
	useEffect(() => {
		const wrapper = wrapperRef.current;
		const rendered = contentRef.current;
		if (!wrapper || !rendered || (!readingKey && !paginated)) return;
		const key = readingKey ? `reading:${readingKey}` : null;
		const signature = contentSignature(content);
		let restored = false;
		let ratio = 0;
		if (key) {
			try {
				const saved = JSON.parse(localStorage.getItem(key) ?? "null");
				if (saved?.signature === signature && Number.isFinite(saved.ratio))
					ratio = Math.max(0, Math.min(1, saved.ratio));
			} catch {
				/* Ignore unavailable/corrupt preferences. */
			}
		}
		const bottomPadding = Number.parseFloat(getComputedStyle(rendered).paddingBottom) || 0;
		let offsets = [0];
		const range = () =>
			paginated ? (offsets.at(-1) ?? 0) : Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
		const rebuild = () => {
			if (paginated) rendered.style.paddingBottom = `${wrapper.clientHeight + bottomPadding}px`;
			const top = wrapper.getBoundingClientRect().top;
			const starts = paginated
				? Array.from(rendered.querySelectorAll(".chord-word, table, .paragraph, .comment")).flatMap(
						(node) =>
							Array.from(node.getClientRects()).map((rect) => rect.top - top + wrapper.scrollTop),
					)
				: [];
			offsets = paginated
				? readingPages(wrapper.clientHeight, wrapper.scrollHeight - wrapper.clientHeight, starts)
				: [0];
			setPages((previous) =>
				previous.length === offsets.length &&
				previous.every((value, index) => value === offsets[index])
					? previous
					: offsets,
			);
			if (!restored) {
				wrapper.scrollTop = ratio * range();
				restored = true;
			}
			setPage(
				Math.max(
					0,
					offsets.reduce(
						(found, offset, index) => (offset <= wrapper.scrollTop + 2 ? index : found),
						0,
					),
				),
			);
		};
		const save = () => {
			if (!wrapper.isConnected || !wrapper.clientHeight) return;
			setPage(
				Math.max(
					0,
					offsets.reduce(
						(found, offset, index) => (offset <= wrapper.scrollTop + 2 ? index : found),
						0,
					),
				),
			);
			if (!key) return;
			const available = range();
			if (available <= 0) return; // Auto-fit must not erase a saved scrolling position.
			try {
				localStorage.setItem(
					key,
					JSON.stringify({
						signature,
						ratio: Math.min(1, Math.max(0, wrapper.scrollTop / available)),
					}),
				);
			} catch {
				/* Storage unavailable. */
			}
		};
		rebuild();
		const observer = new ResizeObserver(rebuild);
		observer.observe(wrapper);
		observer.observe(rendered);
		wrapper.addEventListener("scroll", save, { passive: true });
		return () => {
			save();
			observer.disconnect();
			wrapper.removeEventListener("scroll", save);
			rendered.style.paddingBottom = "";
		};
	}, [wrapperRef, contentRef, readingKey, content, geometry, paginated]);
	const turn = (delta: number) => {
		const next = Math.max(0, Math.min(pages.length - 1, page + delta));
		wrapperRef.current?.scrollTo({ top: pages[next], behavior: "instant" });
		setPage(next);
	};
	return { pages, page, turn };
}
