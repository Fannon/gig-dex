import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import chordSheet from "chordsheetjs";
import { parseSyncedSetlist, parseSyncedSong } from "../src/utils/libraryValidation.ts";

const { ChordProParser, Key } = chordSheet;
const aliases = {
	sov: "verse",
	eov: "verse",
	soc: "chorus",
	eoc: "chorus",
	sob: "bridge",
	eob: "bridge",
	sop: "part",
	eop: "part",
};
const labels = {
	verse: "Verse",
	chorus: "Chorus",
	bridge: "Bridge",
	ending: "Outro",
	prechorus: "Pre-Chorus",
};

/** Expand Chordle's named repeats and normalize custom sections before rendering. */
export function normalizeSections(content, warnings) {
	const sections = new Map();
	const output = [];
	let capture;
	let chorus;
	for (let pass = 0; pass < 2; pass++) {
		output.length = 0;
		for (const line of content
			.replace(/^\uFEFF/, "")
			.replace(/\r\n?/g, "\n")
			.replace(
				/}\s*(?=\{(?:sov|eov|soc|eoc|sob|eob|sop|eop|chorus|start_of_\w+|end_of_\w+|x_chordle_repeat_section)(?::|}))/g,
				"}\n",
			)
			.split("\n")) {
			const directive = /^\s*\{([^}:]+)(?::\s*([^}]*))?\}\s*$/.exec(line);
			const name = directive?.[1].toLowerCase();
			const value = directive?.[2]?.trim();
			if (name === "chorus" || name === "x_chordle_repeat_section") {
				if (pass === 0) continue;
				const block =
					name === "chorus"
						? value
							? sections.get(value.toLowerCase())
							: chorus
						: sections.get(value?.toLowerCase());
				if (!block) {
					const message = `Unresolved section repeat: ${value ?? "chorus"}`;
					if (!warnings) throw new Error(message);
					warnings.push(message);
					output.push(`{comment: Import review — ${message}}`, line);
					continue;
				}
				output.push(...block);
				continue;
			}
			const start =
				name && (name.startsWith("start_of_") || ["sov", "soc", "sob", "sop"].includes(name));
			const end =
				name && (name.startsWith("end_of_") || ["eov", "eoc", "eob", "eop"].includes(name));
			if (start && name !== "start_of_tab") {
				if (capture) throw new Error("Nested section markers need manual review");
				const type = aliases[name] ?? name.slice("start_of_".length);
				const label = value || labels[type] || type[0].toUpperCase() + type.slice(1);
				capture = { type, label, lines: [`{start_of_verse: ${label}}`] };
				output.push(capture.lines[0]);
			} else if (end && name !== "end_of_tab") {
				if (!capture) throw new Error("Unmatched section end needs manual review");
				capture.lines.push("{end_of_verse}");
				output.push("{end_of_verse}");
				sections.set(capture.label.toLowerCase(), capture.lines);
				sections.set(capture.type.toLowerCase(), capture.lines);
				if (capture.type === "chorus" || capture.label.toLowerCase() === "refrain")
					chorus = capture.lines;
				capture = undefined;
			} else {
				output.push(line);
				capture?.lines.push(line);
			}
		}
		if (capture) throw new Error("Unclosed section needs manual review");
	}
	return output.join("\n");
}
const directive = (text, key) =>
	new RegExp(`\\{${key}:\\s*([^}]+)\\}`, "i").exec(text)?.[1]?.trim();
const date = (value, fallback) => {
	const candidate = value || fallback;
	const zoned = /(?:Z|[+-]\d\d:\d\d)$/i.test(candidate) ? candidate : `${candidate}Z`;
	const parsed = new Date(zoned);
	if (!Number.isFinite(parsed.getTime())) throw new Error("Invalid archive timestamp");
	return parsed.toISOString();
};
const optionalNumber = (text, key) => {
	const value = directive(text, key);
	return value && Number.isFinite(Number(value)) ? Number(value) : undefined;
};
export function convertChordle(entries, exportedAt = new Date().toISOString()) {
	const songs = [];
	const importWarnings = [];
	const setlists = [];
	const fallback = "1970-01-01T00:00:00Z";
	for (const [path, source] of Object.entries(entries)) {
		if (!/^songs\/[^/]+\.chordle$/.test(path)) continue;
		const id = path.slice(6, -8);
		const sourceId = directive(source, "x_chordle_id");
		if (sourceId && sourceId !== id) throw new Error("Song identity does not match archive member");
		const warnings = [];
		const content = normalizeSections(source, warnings);
		try {
			new ChordProParser().parse(content);
		} catch {
			warnings.push("ChordPro syntax needs repair; source text is preserved for editing.");
		}
		if (warnings.length) importWarnings.push({ id, warnings });
		const record = {
			id,
			title: directive(source, "(?:title|t)") || "Untitled",
			artist: directive(source, "artist") || "",
			content,
			key: directive(source, "key"),
			capo: optionalNumber(source, "capo"),
			tempo: optionalNumber(source, "tempo"),
			time: directive(source, "time") || directive(source, "x_chordle_default_time"),
			subtitle: directive(source, "(?:subtitle|st)"),
			copyright: directive(source, "copyright"),
			composer: directive(source, "composer"),
			lyricist: directive(source, "lyricist"),
			album: directive(source, "album"),
			year: optionalNumber(source, "year"),
			duration: directive(source, "duration"),
			tags: [
				...new Set([
					...Array.from(source.matchAll(/\{tag:\s*([^}]+)\}/gi), (match) => match[1].trim()),
					...(directive(source, "x_chordle_tags") ?? "")
						.split(",")
						.map((tag) => tag.trim())
						.filter(Boolean),
				]),
			],
			createdAt: date(directive(source, "x_chordle_date_added"), fallback),
			lastModified: date(directive(source, "x_chordle_date_modified"), fallback),
		};
		if (warnings.length) record.tags.push("import-review");
		songs.push(parseSyncedSong(JSON.stringify(record), id));
	}
	const library = new Map(songs.map((song) => [song.id, song]));
	for (const [path, source] of Object.entries(entries)) {
		if (!/^setlists\/[^/]+\.chordle$/.test(path)) continue;
		const list = JSON.parse(source);
		if (
			list.id !== path.slice(9, -8) ||
			typeof list.title !== "string" ||
			!Array.isArray(list.songs)
		)
			throw new Error("Invalid setlist archive member");
		const ordered = list.songs
			.map((song, index) => ({ ...song, position: song.order ?? 0, index }))
			.sort((a, b) => a.position - b.position || a.index - b.index);
		const songSettings = ordered.map((entry) => {
			const song = library.get(entry.id);
			if (!song) throw new Error("Setlist refers to a song missing from the archive");
			if (entry.key && !song.key)
				throw new Error("Setlist key cannot be applied to a song without a source key");
			const difference = entry.key ? Key.distance(song.key, entry.key) : 0;
			return {
				transpose: difference > 6 ? difference - 12 : difference,
				...(entry.capo !== undefined ? { capo: entry.capo } : {}),
			};
		});
		const record = {
			id: list.id,
			name: list.title,
			date: list.sessionDate ? list.sessionDate.slice(0, 10) : undefined,
			description: list.sessionDate
				? `Session date: ${list.sessionDate.slice(0, 10)}\nImported from Chordle.`
				: "Imported from Chordle.",
			tags: ["Chordle"],
			songIds: ordered.map((song) => song.id),
			songSettings,
			createdAt: date(list.createdDateUtc, fallback),
			lastModified: date(list.lastModifiedUtc, fallback),
		};
		setlists.push(parseSyncedSetlist(JSON.stringify(record), list.id));
	}
	if (!songs.length || !setlists.length)
		throw new Error("No songs or setlists found in this archive");
	const ids = [...songs, ...setlists].map((record) => record.id);
	if (new Set(ids).size !== ids.length) throw new Error("Duplicate archive identities");
	return { format: "gig-dex", version: 1, exportedAt, songs, setlists, importWarnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const [, , input, output = "tmp/chordle-setlists.gig-dex.json"] = process.argv;
	if (!input)
		throw new Error(
			'Usage: npm run import:chordle -- "path/to/Set Lists.chordle" [tmp/output.json] (requires Python 3)',
		);
	const target = resolve(output);
	const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
	if (!["tmp", "reports"].some((folder) => target.startsWith(`${root}/${folder}/`)))
		throw new Error("Private import output must stay under ignored tmp/ or reports/");
	let archiveText;
	try {
		archiveText = execFileSync(
			"python3",
			[fileURLToPath(new URL("./chordle-archive.py", import.meta.url)), resolve(input)],
			{ encoding: "utf8", maxBuffer: 120_000_000 },
		);
	} catch {
		throw new Error(
			"Could not read Chordle archive. Check the path, ZIP format, size and Python 3 installation.",
		);
	}
	const entries = JSON.parse(archiveText);
	const backup = convertChordle(entries);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, `${JSON.stringify(backup, null, 2)}\n`, { flag: "wx", mode: 0o600 });
	console.log(
		`Created ${target}: ${backup.songs.length} songs, ${backup.setlists.length} setlists, ${backup.setlists.reduce((sum, list) => sum + list.songIds.length, 0)} song occurrences. ${backup.importWarnings.length} songs need import review. Restore in Settings using Merge.`,
	);
}
