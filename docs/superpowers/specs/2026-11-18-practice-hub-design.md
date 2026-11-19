# Practice Hub: Design

Date: 2026-11-18
Status: reviewed, awaiting user approval
Code: `/home/mingukim/Documents/chord-drill/` (the existing Chord Drill prototype grows into this app)

## 1. Intent

A personal piano practice hub for one person: a former classical pianist who wants to:

1. play pop music by ear,
2. recognise chords instantly, by ear and from chord symbols, until it is automatic,
3. sight-read pop lead sheets (melody plus chord symbols) without stopping.

Classical training gave strong technique and note-reading. What is missing is thinking in harmonic function (I–V–vi–IV rather than C–G–Am–F), hearing melody and bass as scale degrees, reading chord symbols fluently, reading syncopated pop rhythms, and turning a chord chart into an arrangement that sounds like the genre.

The app is a **hub of activities the user picks from**, not an automatic routine. It should be fun. The second purpose, alongside skill, is **exposure to famous music**: real songs are the content of every activity wherever possible, filterable by genre.

## 2. Goals, non-goals, anti-goals

**Goals**
- 7 activities (section 6) sharing one song library, one MIDI layer, and one progress store.
- Songs from 7 genres: Pop, Rock, R&B/Soul, Jazz standards, K-pop, J-pop/Anime, Game soundtracks. A global genre filter applies to every activity.
- Practice against real recordings (YouTube) wherever the activity allows.
- Everything checks what the user actually plays on the piano (MIDI), not button taps.
- The user can add their own songs.
- Weak items (chords, progressions, hooks) come back more often (existing scheduler, generalised).

**Non-goals**
- Sharing, multiple users, accounts, a public audience.
- Phone layout beyond "doesn't break".
- Touch on-screen keys as a way to answer. On the iPad, the answer always comes from the piano (user's decision). If MIDI doesn't work there, the user practices on the laptop instead.
- Microphone or audio input in v1 (input is MIDI only).
- A full notation editor.
- Automatic audio-to-chords in v1 (planned as the later Song Importer, section 9).

**Anti-goals** (this fails even if it works technically)
- It feels like homework: long setup before playing, walls of text, forced sequences.
- Core practice needs a local server running.
- Wrong song data presented as correct. Seed data must be marked unverified until the user confirms it.

## 3. Constraints

- **Hardware:** Yamaha P-515 over USB (USB TO HOST, class-compliant MIDI), USB-C-to-USB-B cable to a MacBook. Bluetooth MIDI is not relied on.
- **Browser:** Chrome on macOS (primary). Safari has no Web MIDI.
- **iPad (secondary, user's decision):** every iPad browser runs on WebKit, which has no Web MIDI. Supported route: Jazz-Soft's **"Web MIDI Browser"** iOS app, which adds Web MIDI to pages (untested; verified at the Task 7 checkpoint). The P-515 connects with a USB-C-to-USB-B cable. Layouts must work on iPad, landscape and portrait (≥ 768 px wide), with controls (buttons, selects) at least 44 px tall. No touch-to-play.
- **Secure context:** Web MIDI requires `https://` or `localhost`, so the app is deployed to GitHub Pages (free plan: public repo; no secrets or personal data go in the repo).
- **Development:** on a Linux desktop with no piano. Every activity must work with the computer-keyboard / mouse fallback that already exists.
- **No build step**, matching the prototype: plain ES modules. Third-party libraries load from a CDN at pinned versions.
- **YouTube:** some official videos block embedding. The UI must handle that (section 5.4).
- **Testing:** the user plans to test all activities together at the end, except for one 5-minute MIDI check once the shared app shell exists (section 8, step 1).

## 4. Approaches considered

| Approach | Summary | Verdict |
|---|---|---|
| A. Browser-only | Static site, YouTube embeds, hand-entered song data | Simple, but no path to auto-detecting chords |
| B. Local app + Python server | Server on the Mac for YouTube audio, chord detection, database | Most powerful, but heavy setup and must be running before practice |
| **C. A now, optional helper later** | All 7 activities browser-only; an optional Mac "Song Importer" later produces draft charts | **Chosen by the user.** 6 of 7 activities need only song data + YouTube + MIDI; detection only speeds up adding songs and needs manual correction anyway |

## 5. Shared foundation

### 5.1 App shell
- Single page with a hash router (`#/`, `#/drill`, `#/studio/:songId`, …).
- **Home screen:** activity tiles, the global genre filter, a small "recent activity" strip (last songs touched, today's practice minutes). No forced daily plan.
- Persistent header: MIDI status, input/output device picker, genre filter.

Sketch:
```
┌ Practice Hub ─────────────── MIDI: P-515 ● ─ Genres: [All ▾] ┐
│                                                                │
│  [Song Studio]  [Name That Progression]  [Melody Echo]         │
│  [Style Lab]    [Lead Sheet Play-Along]  [Chord Drill]         │
│  [Progression Explorer]                  [Song Library]        │
│                                                                │
│  Recent: Let It Be (learning) · Gurenge (new) · 18 min today   │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 MIDI layer (extends `src/input.js`)
- Input: held-note set plus a timestamped note-on/off event stream (rhythm checking needs timing, not only the held set).
- **Output (new):** send notes to the P-515 so prompts play through the piano's own speakers. Setting: "Play prompts through: piano / browser".
- Sustain pedal (CC64): ignored for chord matching (as today), but recorded in the event stream for Style Lab.
- Keep the QWERTY and mouse fallback for every activity.

### 5.3 Sound engine
- Browser piano: a sampled piano (Tone.js `Sampler` with a public piano sample set, pinned CDN version) replaces the triangle-wave synth for prompts. The triangle synth stays as the fallback if samples fail to load.
- Drone generator (tonic drone for ear exercises) and a metronome/click track.
- One scheduling clock for prompts, click, and checking.

### 5.4 YouTube wrapper
- YouTube IFrame Player API: load a video, seek, A–B loop, playback rate (0.5×–1×), current-time polling for chart sync.
- If a video refuses embedding: show "Open on YouTube" (new tab) and let the activity continue with browser-piano prompts where possible.

### 5.5 Song library
**Song record** (JSON):
```json
{
  "id": "let-it-be",
  "title": "Let It Be",
  "artist": "The Beatles",
  "genres": ["Rock", "Pop"],
  "year": 1970,
  "key": { "tonic": "C", "mode": "major" },
  "bpm": 72,
  "timeSignature": [4, 4],
  "youtube": { "id": null, "offset": 0 },
  "verified": false,
  "source": "seed",
  "sections": [
    {
      "name": "Verse",
      "bars": [["C", "G"], ["Am", "F"], ["C", "G"], ["F", "C"]],
      "start": null,
      "chordTimes": null
    }
  ],
  "hooks": [
    { "name": "Chorus hook", "section": "Chorus", "notes": [[67, 0, 1], [64, 1, 1]], "verified": false }
  ],
  "progressions": ["I V vi IV"]
}
```
- `bars`: chords per bar (each bar split evenly between its chords unless a duration is given). This is what lead sheets and Roman-numeral analysis use.
- **Form and sync (Claude's call):** sections are defined once, and a separate `form` list gives the whole song's order with per-occurrence timing:
  `"form": [{ "section": "Intro", "start": null }, { "section": "Verse", "start": null }, { "section": "Chorus", "start": null }, …]`.
  Each occurrence gets its own `start` and `chordTimes` (seconds in the video, filled by tap-sync), so Play-Along and Studio live check can follow the **whole song**. Tap-sync walks the form in order; repeated sections can copy the previous occurrence's relative timing and then be nudged. Activities that need sync show "needs sync" until the occurrence they use has times. (Replaces the per-section `start` / `chordTimes` fields in the example above.)
- **Key per section (Claude's call):** a section may override the song `key` (`"key": {"tonic": "D", "mode": "major"}`) for modulations, which are common in K-pop and J-pop. Roman-numeral analysis uses the section's key.
- `hooks.notes`: `[midi, startBeat, durationBeats]`, short (4–16 notes).
- `progressions`: Roman-numeral strings derived from `bars` + `key` (computed, cached).
- `verified`: false for all seed data until the user ticks "I checked this". Unverified songs show a small badge.

**Seed library:** ~50 songs, ~7 per genre, chosen for famous, clearly heard, pedagogically useful progressions. Written by Claude from memory, so: chords and hooks are best effort and marked unverified, and **YouTube IDs are not guessed**. They are left `null` and filled in by the user (see Song Editor).

**Hooks stay out of the public repo (user's decision, revised).** The public repo ships song charts only (`hooks: []`). Melodies arrive through **content packs**.

**Content packs** (so songs and melodies can keep being added):
- A pack is one JSON file: `{ "app": "practice-hub", "kind": "pack", "version": 1, "id": "<unique>", "title": "...", "createdAt": "...", "songs": [Song...], "hooks": { "<songId>": [Hook...] } }`. Either list may be empty: a pack can add new songs, melodies for existing songs, or both.
- **Layering:** seeds (repo) → packs (in order of `createdAt`) → the user's own edits. Later layers win: a pack song with an existing id replaces the seed version, and pack hooks replace hooks with the same `name` and append the rest. A user-edited song is never changed by a pack.
- **Delivery, Claude's call (the user can switch):** a **private GitHub repo** (`practice-hub-content`, folder `packs/`). In the app's Settings, the user pastes a fine-grained GitHub token with read-only Contents access to that one repo (stored only in IndexedDB). A **Sync** button lists `packs/` via the GitHub API and downloads new or changed files (tracked by blob SHA). **Import file** also accepts a pack, as a fallback that needs no token.
- Packs that fail validation are skipped with a message naming the pack and the problem. Hooks for unknown song ids are skipped with a warning.
- Claude adds content by writing a pack file (or a new seed file for chord-only songs). A short `docs/adding-content.md` documents the format and the steps.

**Song Editor** (needed for user-added songs and for fixing seeds):
- Form for title, artist, genres, key, bpm, sections with chords per bar, hooks (entered by playing them on the piano).
- "Find on YouTube" opens a YouTube search for `artist title` in a new tab; the user pastes the link back.
- **Tap-sync:** the video plays, and the user taps Space at each chord change (or each bar) to record `chordTimes`. Can be re-tapped per section, at 0.75× speed.

**Storage:** IndexedDB for the user's songs, edits to seeds, downloaded packs, and all progress. Seeds ship as JSON files in the repo; packs and user edits overlay them. **Export / Import** buttons save everything to one JSON file, because browser storage can be cleared.

### 5.6 Music theory core (extends `src/chords.js`)
- Already there: chord spelling, chord matching from held notes, slash chords, lenient 5th.
- Add: chord-symbol parser (any symbol the library uses, e.g. `F#m7b5`, `Bb/D`, `Gsus4`, `Cadd9`, `E7`, `Gm9`, `F13`, `C7#9`), Roman-numeral analysis relative to a key (including borrowed ♭VII, ♭VI, iv, and secondary dominants V/x), transposition, scale-degree naming.
- **Roman-numeral convention (user's decision):** minor-key and modal sections are analysed in their own mode: Am–F–C–G in A minor is **i–VI–III–VII**, not vi–IV–I–V. Major keys use the usual I–IV–V. Case shows quality (I major, ii minor, vii° diminished); borrowed chords take ♭ (♭VII, ♭VI).
- **Loop families (user's decision, Claude's proposal):** progressions that are rotations of each other (I–V–vi–IV, vi–IV–I–V, IV–I–V–vi) or the same loop seen from the relative minor (i–VI–III–VII) belong to one **loop family**. The family is the scheduler item for Name That Progression (`prog:<family id>`) and the unit Progression Explorer groups songs by. Each song still displays its own rotation in its own key.
- **Matching extended chords (Claude's call):**
  - Triads, 7ths, sus, add9, dim, m7♭5: the current rule applies (all tones, nothing else, 5th optional in lenient mode).
  - 9th/11th/13th and altered chords: **essential tones** are required (3rd, 7th, and the named extension/alteration). Root and 5th are optional (rootless and shell voicings count). Other chord tones of that chord are allowed; notes outside the chord are not.
  - A **"Strict voicing"** setting (default off) requires every chord tone, for drilling full spellings.
  - Slash chords always need the slash note lowest.

### 5.7 Progress store and scheduler
- Generalise `src/scheduler.js` from chord IDs to any item key (`chord:Ebmaj7`, `prog:I-V-vi-IV`, `hook:let-it-be/0`, `rhythm:pattern-12`).
- **What "weak" means (Claude's call):** every attempt is turned into one **difficulty score from 0 (easy) to 1 (hard)** before it is recorded, so one scale works across all item types:
  - Timed answers (Chord Drill, Name That Progression, Melody Echo): `score = clamp(time / (3 × per-type target))`, where the target is 2 s per chord, 2 s per chord in a progression, and 1 s per note in a hook.
  - Accuracy-scored items (rhythm, Style Lab, Play-Along bars): `score = 1 − accuracy`.
  - Hint used: score at least 0.7. Skip: 1.0.
  - The moving average and weighting work on this score instead of milliseconds. Raw times are still stored for display. This is a data-model change to `scheduler.js`, not just a rename.
- Existing Chord Drill stats live only in the Linux test browser's localStorage. Nothing on the Mac needs migrating, so a one-time import of the old key is optional.
- Note for the builder: the scheduler tests currently live in `tests/chords.test.js` (the comment in `scheduler.js` points to a non-existent `tests/scheduler.test.js`). Split them out.
- Per-song status: `new → learning → can play`, set by the user, with "last practiced".
- Practice-time log per day (for the home screen strip).

## 6. Activities

Every activity: pick from library (with genre filter), or "surprise me" (scheduler-weighted). Hints always available; using one marks the item as weak.

### 6.1 Chord Drill (exists; extend)
- Keep current behaviour.
- **Pool "from my songs":** drill only chords that appear in songs in the library (filtered by genre).
- **Voice-leading mode:** shows a progression, one chord at a time. A correct answer must also move smoothly: total movement of the upper voices from the previous chord ≤ a threshold (default: no voice moves more than 4 semitones; builder may tune).

### 6.2 Song Studio (the main activity)
Goal: work out a real song by ear from its recording.
- Pick a song. The video plays with A–B loop and slow-down. The chart starts **hidden**.
- Guided steps, each optional, each with reveal:
  1. **Find the key:** play the tonic note. Checked against `key.tonic`.
  2. **Find the bass:** for the looped section, play the bass notes in order. Checked against chord roots / slash basses.
  3. **Find the chords:** play each chord. Checked against the section's chords in order.
- If the song is tap-synced, a "live check" mode compares what is held to the chord sounding at that moment in the recording (window ± 0.3 s, builder may tune).
- Reveal one chord at a time, or the whole section.
- End of session: set song status (learning / can play).

### 6.3 Name That Progression
Goal: hear a progression and play it back. Song title revealed after.
- Prompt source:
  - **Recording clip** (tap-synced songs only): loops 2–4 bars of a section from YouTube.
  - **Piano rendition** (any song, any key): the progression is played on the piano/browser piano in a random key, after a tonic drone.
- The tonic is given (drone or "Key: E♭"). The user plays the chords in order.
- Reveal: Roman numerals, chord names, then the song title, artist, and a "listen" button.
- Scheduler items: progression patterns (`I V vi IV`), so a familiar pattern from many songs gets reinforced across genres.

### 6.4 Melody Echo
Goal: hear a melody, play it back. Builds scale-degree hearing.
- **Warm-up:** tonic drone, single notes and 3-note cells played. User plays them back. Levels: degrees 1–5 → diatonic → chromatic.
- **Hooks:** a song's hook played (browser/piano rendition; or the recording clip if synced and the hook has a time). User plays it back.
- Settings: "same key" (exact pitches) or "any key" (intervals must match, start anywhere).
- Checking: pitch sequence only in v1; rhythm not scored. Hint: show the first note, then degree numbers.

### 6.5 Style Lab
Goal: turn a chord chart into something that sounds like the genre.
- A catalogue of accompaniment patterns, ~3 per genre, e.g. ballad arpeggios (Pop), driving 8th-note chords (Rock), syncopated comping with 7ths/9ths (R&B), shell voicings + walking LH (Jazz), four-on-the-floor stabs (K-pop), syncopated rock-piano RH (J-pop/Anime), sustained pads + broken chords (Game/OST).
- Each pattern is a template applied to any chord: LH and RH rhythm + which chord tones.
- Flow: pick a pattern → hear a demo on one chord → watch it on the on-screen keyboard → play it over a short progression (from a library song, filtered to the pattern's genre) with the click.
- Checking: correct notes, and note-on timing within a window of the grid (default ± 60 ms at the pattern's tempo; builder may tune). Score per bar.

### 6.6 Lead Sheet Play-Along (includes rhythm reading)
Goal: read a chart in time without stopping.
- **Chart mode:** a song's chord chart (bars + symbols, slash notation) scrolls in time, synced to the recording (if tap-synced) or to the click at the song's bpm. The user comps; the app marks each bar as hit/missed (right chord present during the bar).
- **Lead-sheet mode:** melody notation + chord symbols rendered with a notation library (VexFlow or abcjs; builder's choice). Material:
  - songs whose hooks/melody exist in the library, and
  - **generated lead sheets:** a pop-style melody generated over a library progression (chord tones on strong beats, stepwise passing notes, common pop rhythms). Unlimited fresh reading material.
- **Rhythm drill:** one-bar or two-bar syncopated rhythms (anticipations, 16th pushes, ties across the beat) shown in notation. The user taps them on any key with the click. Scored on timing.
- Speed control: tempo 50–100% of target. The cursor never waits.

### 6.7 Progression Explorer
Goal: connect a progression to many songs.
- Index of every progression in the library, by Roman numerals, with song count and genres.
- Pick one: list of library songs using it (click → Song Studio or Name That Progression), plus "hear it" in any key.
- **Hooktheory lookup (optional):** "more songs using this" via the Hooktheory Trends API (official endpoint: songs containing a chord progression). Requires the user's Hooktheory account; the token is stored only in the browser. If the API is unreachable from the browser (CORS) or the user has no account, show a link to Hooktheory's search page instead.
- Found songs can be added to the library as stubs (title/artist/progression, unverified).

## 7. What changes in the existing code

| File | Change |
|---|---|
| `src/chords.js` | Add symbol parser, Roman-numeral analysis, transposition, voice-leading distance |
| `src/scheduler.js` | Generic item keys (no logic change needed beyond naming) |
| `src/input.js` | Add event stream with timestamps, MIDI output, device picker |
| `src/synth.js` | Becomes the fallback inside a new sound engine |
| `src/app.js` | Becomes the Chord Drill activity module; a new shell owns routing and header |
| `index.html` / `style.css` | Shell layout; Chord Drill screen moves into its activity view |

The existing tests keep passing; new pure logic (parser, analysis, rhythm scoring, melody generation, matching) gets unit tests in the same style (`node --test`).

## 8. Build order

Chosen so each step reuses the last and the riskiest shared pieces come first:

1. **Shell + MIDI in/out + sound engine.** Then **the user's 5-minute MIDI check on the P-515** (only mid-build test).
2. **Song library**: data model, theory core additions, IndexedDB + export/import, Song Editor with tap-sync, seed data (~50 songs).
3. **Chord Drill** moved into the shell, plus "from my songs" and voice-leading mode.
4. **Song Studio.**
5. **Name That Progression.**
6. **Melody Echo.**
7. **Lead Sheet Play-Along** (includes rhythm drill and generated lead sheets).
8. **Style Lab.**
9. **Progression Explorer** (+ Hooktheory lookup).
10. Deploy to GitHub Pages. User tests everything on the Mac with the piano.

## 9. Later (not in this build)
- **Song Importer helper:** optional local Python tool on the Mac. Takes a YouTube URL, downloads audio, runs a chord-recognition model (e.g. lv-chordia; autochord only does major/minor), estimates beats and key, and produces a draft song JSON for import into the Song Editor.
- Transposition practice (play a learned song in other keys).
- Improvisation / fills.
- Microphone input (singing melodies back).

## 10. Left to the builder
- Exact UI layout and visual style beyond the home sketch (consistent with the prototype's look).
- Notation library choice (VexFlow vs abcjs) and piano sample set.
- Tolerances marked "builder may tune".
- Which ~50 songs to seed, within the 7 genres, ~7 each, favouring famous songs with clear, useful progressions.
- Melody-generation rules for generated lead sheets.
- Module/file layout under `src/`.
