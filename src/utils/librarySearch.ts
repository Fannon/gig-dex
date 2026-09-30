export function tagSearchQuery(tag: string): string {
  const name = tag.trim().replace(/^#+/, "");
  return /\s|["\\]/.test(name) ? `#${JSON.stringify(name)}` : `#${name}`;
}

/** #tokens match complete tags; ordinary terms search visible metadata. */
export function matchesLibrarySearch(
  text: string,
  tags: readonly string[],
  query: string,
  songIds?: readonly string[],
) {
  const haystack = text.toLocaleLowerCase();
  const tagSet = new Set(tags.map((tag) => tag.trim().replace(/^#+/, "").toLocaleLowerCase()));
  const terms =
    query
      .trim()
      .toLocaleLowerCase()
      .match(/#"(?:[^"\\]|\\.)*"|\S+/g) ?? [];
  return terms.every((term) => {
    if (term.startsWith('#"') && term.endsWith('"')) {
      try {
        return tagSet.has(JSON.parse(term.slice(1)).toLocaleLowerCase());
      } catch {
        return false;
      }
    }
    if (term.startsWith("#") && term.length > 1) return tagSet.has(term.slice(1));
    if (songIds && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term))
      return songIds.some((id) => id.toLocaleLowerCase() === term);
    return haystack.includes(term);
  });
}
