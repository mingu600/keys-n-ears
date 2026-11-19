# Adding content

Keys-n-Ears keeps chord charts and melodies apart. Charts (keys, chords, form) are public and live in this
repo. Melodies (hooks) are copyrighted, so they never go in this repo: they travel in private **packs**.

## Where things go

| What | Where | Public? |
|---|---|---|
| Seed charts (`hooks: []`) | `data/seeds/<genre>.json`, listed in `data/seeds/index.json` | Yes |
| Melodies, extra songs | a pack file in `private/packs/` (gitignored) and in the private `keys-n-ears-content` repo under `packs/` | No |
| Your own edits | the app (browser storage), via the Song Editor | No |

## Layering order

The library is built in this order. Later layers win:

1. **Seeds** from `data/seeds/`.
2. **Packs**, oldest `createdAt` first. A pack song replaces the seed with the same `id`. Pack hooks are added
   to the song, and a hook with the same `name` replaces the earlier one.
3. **Your edits** in the app. An edited song replaces everything above it, hooks included.

## Pack format

```json
{
  "app": "practice-hub", "kind": "pack", "version": 1,
  "id": "example-pack", "title": "Example pack", "createdAt": "2026-11-18",
  "songs": [
    { "id": "made-up-song", "title": "Made-Up Song", "artist": "Nobody", "genres": ["Pop"],
      "key": { "tonic": "C", "mode": "major" }, "bpm": 90, "timeSignature": [4, 4],
      "sections": [{ "name": "Loop", "bars": [["C"], ["G:2", "Am:2"], ["F"], ["G"]] }],
      "form": [{ "section": "Loop", "start": null, "chordTimes": null }],
      "youtube": { "id": null, "offset": 0 }, "verified": false, "hooks": [] }
  ],
  "hooks": {
    "made-up-song": [
      { "name": "Loop hook", "section": "Loop", "verified": false,
        "notes": [[60, 0, 1], [62, 1, 1], [64, 2, 1], [67, 3, 1]] }
    ]
  }
}
```

The song and hook above are made up. Rules:

- `hooks` maps a song `id` (seed or pack song) to a list of hooks. `section` must name a section of that song.
- A hook has 4 to 16 notes. Each note is `[midi, startBeat, durationBeats]`; beats count from the hook start
  (middle C is 60). Keep hooks in a right-hand range, roughly 60 to 84.
- A chord may carry a beat count (`"G:2"`). Chords without one split the rest of the bar evenly.
  Chord symbols must parse with `src/theory/parse.js` (e.g. `Cmaj7`, `F#m7b5`, `Dadd9`, `C/E`; no power chords).
- Minor keys use `"mode": "minor"`. Mixolydian and other major-ish modes use `"major"`.
- Song `id`s are lowercase-kebab titles (`let-it-be`). Leave `verified: false` until you have checked it by ear.

## Validate

Run `npm test`. It checks every seed file, and every `.json` file in `private/packs/`: the pack must parse with
no warnings, every hook must point at a known song and section, and notes must be sane. With no
`private/packs/` folder the pack test is skipped, so the public repo and CI still pass.

## Publish a pack

- **Sync:** commit the pack to the private `keys-n-ears-content` repo under `packs/`, push, then press
  **Sync** in the app's Content settings (Library page). The app needs a fine-grained, read-only token for
  that repo only.
- **Import:** or press **Import** on the Library page and choose the pack file.

Songs with hooks show a `has melody` badge.
