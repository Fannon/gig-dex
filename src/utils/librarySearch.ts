export function tagSearchQuery(tag: string): string {
  const name = tag.trim().replace(/^#+/, "");
  return /\s|["\\]/.test(name) ? `#${JSON.stringify(name)}` : `#${name}`;
}

/** Parse once per query; #tokens match complete tags and other terms match metadata. */
export function createLibrarySearch(query: string) {
  const terms =
    query
      .trim()
      .toLocaleLowerCase()
      .match(/#"(?:[^"\\]|\\.)*"|\S+/g) ?? [];
  const parsed: { value: string; tag: boolean }[] = [];
  for (const term of terms) {
    if (term.startsWith('#"') && term.endsWith('"')) {
      try {
        parsed.push({ value: JSON.parse(term.slice(1)).toLocaleLowerCase(), tag: true });
      } catch {
        return () => false;
      }
    } else if (term.startsWith("#") && term.length > 1) parsed.push({ value: term.slice(1), tag: true });
    else parsed.push({ value: term, tag: false });
  }
  return (text: string, tags: readonly string[], songIds?: readonly string[]) => {
    let haystack: string | undefined;
    let tagSet: Set<string> | undefined;
    return parsed.every(({ value, tag }) => {
      if (tag) {
        tagSet ??= new Set(tags.map((tag) => tag.trim().replace(/^#+/, "").toLocaleLowerCase()));
        return tagSet.has(value);
      }
      if (songIds && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
        return songIds.some((id) => id.toLocaleLowerCase() === value);
      haystack ??= text.toLocaleLowerCase();
      return haystack.includes(value);
    });
  };
}

export function matchesLibrarySearch(
  text: string,
  tags: readonly string[],
  query: string,
  songIds?: readonly string[],
) {
  return createLibrarySearch(query)(text, tags, songIds);
}
