/** #tokens match complete tags; ordinary terms search visible metadata. */
export function matchesLibrarySearch(
  text: string,
  tags: readonly string[],
  query: string,
  songIds?: readonly string[],
) {
  const haystack = text.toLocaleLowerCase();
  const tagSet = new Set(tags.map((tag) => tag.trim().replace(/^#+/, "").toLocaleLowerCase()));
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => {
      if (term.startsWith("#") && term.length > 1) return tagSet.has(term.slice(1));
      if (songIds && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term))
        return songIds.some((id) => id.toLocaleLowerCase() === term);
      return haystack.includes(term);
    });
}
