# Licensed song packs (not in the public repository)

Put licensed song packs here as `*.json`. They are bundled into **your own builds** as extra free-play collections, and `.gitignore` keeps them out of git so licensed content is never published by accident. Recorded backing tracks go in `public/licensed/`, which is also git-ignored.

Create a pack in the app: **My Songs → Import** → **Export pack file**. The format is:

```json
{
  "title": "Movie Songs",
  "license": { "holder": "ACUM", "reference": "12345/2026", "territory": "Israel" },
  "songs": [ /* SongDefinition objects, exactly as exported */ ]
}
```

A recording referenced as `"audio": { "url": "licensed/my-song.mp3", "offsetMs": 1200 }` is served from `public/licensed/my-song.mp3`.

Make sure your licence covers the use. Showing a song's melody as playable notes in a game usually needs a publisher/interactive licence for the composition, and a recording needs a master licence from the label. Both are limited to the territories where you distribute.
