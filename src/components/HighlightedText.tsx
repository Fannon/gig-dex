/** React text nodes keep titles and query punctuation safe without HTML injection. */
export function HighlightedText({ text, query }: { text: string; query: string }) {
	const terms = [
		...new Set(
			query
				.trim()
				.split(/\s+/)
				.map((term) => (term.startsWith("#") ? term.slice(1) : term))
				.filter(Boolean),
		),
	].sort((a, b) => b.length - a.length);
	if (!terms.length) return text;
	const pattern = new RegExp(
		`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
		"giu",
	);
	return (
		<>
			{text.split(pattern).map((part, index) =>
				// biome-ignore lint/suspicious/noArrayIndexKey: These text fragments have no local state.
				index % 2 ? <mark key={index}>{part}</mark> : part,
			)}
		</>
	);
}
