# Keys-n-Ears

A piano practice hub: drill chords against a timer, keep a library of songs, tap-sync chord changes to a YouTube video, and record short melody hooks. No build step and no dependencies: plain HTML and ES modules.

Live site: https://mingu600.github.io/keys-n-ears/ (deployed from the `foundation` branch of mingu600/keys-n-ears; switch Pages to `main` after merging).

## Run locally

```sh
npm run dev        # serves http://localhost:8000
npm test           # runs node --test over tests/
```

## Playing without a piano

- Lower row `Z X C V B N M` = C3-B3 (black keys on `S D G H J`)
- Upper row `Q W E R T Y U I O P` = C4-E5 (black keys on the number row)
- Or click keys on screen to toggle them on and off.

Drill shortcuts: `Space` hint, `Enter` skip, `Esc` release all.

## Yamaha P-515 on a Mac

1. Connect a USB-C-to-USB-B cable to the piano's **USB TO HOST** port.
2. Open the live site in **Chrome** (Safari has no Web MIDI).
3. Allow MIDI access when Chrome asks. The header shows the piano's name.

Web MIDI only works on `https://` or `localhost`.

## iPad

Safari on iPad has no Web MIDI. Install the Jazz-Soft "Web MIDI Browser" app, connect the piano through a USB adapter, and open the live site in it.

## Matching rules

- Every chord tone must be held, and no other notes. Octave doublings are fine.
- Plain chords (C, Am7) accept any inversion.
- Slash chords (D/F#) need the slash note as the lowest note.
- "Allow dropping the 5th" lets 4-note chords skip the perfect 5th.
- "Strict voicing" requires every chord tone.
- The sustain pedal is ignored: only keys you are physically holding count.

## Scoring

Each chord gets a score from 0 to 1 based on how fast you played it. Using a hint raises the score to at least 0.7 (so it counts as slow); a skip scores 1. Higher scores come back more often.

## Storage and backups

Everything lives in your browser: songs, packs, practice log and settings in IndexedDB, and Chord Drill timings in localStorage. Each browser and device keeps its own data. Use **Export** and **Import** on the Library page to move or back it up (the export includes Chord Drill timings and never includes your GitHub token). Import can merge or replace.

## Content

Melody packs live in a private repo and sync into the Library with a GitHub token. See [docs/adding-content.md](docs/adding-content.md).

## Updating

After an update, reload with Cmd-Shift-R.
