"""Read Chordle ZIP members without extracting private songs to disk."""
import json
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    members = [entry for entry in archive.infolist() if not entry.is_dir()]
    if len(members) > 20000 or sum(entry.file_size for entry in members) > 100_000_000:
        raise ValueError("Archive is too large (limit: 20,000 files / 100 MB)")
    entries = {}
    for entry in members:
        if entry.filename.startswith(("songs/", "setlists/")) and entry.filename.endswith(".chordle"):
            if entry.filename in entries or entry.file_size > 2_000_000:
                raise ValueError("Duplicate or oversized archive member")
            entries[entry.filename] = archive.read(entry).decode("utf-8-sig")
    print(json.dumps(entries))
