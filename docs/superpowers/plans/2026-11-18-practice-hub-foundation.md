# Practice Hub Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Chord Drill prototype into the Practice Hub foundation: app shell, MIDI in/out, sound engine, theory core, song library (with editor, tap-sync, seeds), and Chord Drill as the first activity. This covers spec §8 steps 1–3.

**Architecture:** A static single-page app with no build step: plain ES modules, a hash router, and one shared context object (`ctx`) passed to every view. Pure logic (theory, scheduler, schema, merge, tap-sync) lives in DOM-free modules covered by `node --test`. Browser-only modules (MIDI, sound, IndexedDB, YouTube, views) are checked in Chrome via the chrome-devtools MCP or by hand.

**Tech Stack:** Vanilla JS ES modules, Web MIDI API, Web Audio + Tone.js (UMD build from jsDelivr, pinned), IndexedDB, YouTube IFrame Player API, `node --test`, Python `http.server` for local dev, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-18-practice-hub-design.md`

**Follow-up plans (not in this one):** Plan 2: Song Studio + Name That Progression. Plan 3: Melody Echo + Lead Sheet Play-Along. Plan 4: Style Lab + Progression Explorer + final deploy.

## Global Constraints

- No build step. Every module is loaded by `<script type="module">`. Third-party code is loaded from a CDN at an exact pinned version.
- Target browser: Chrome on macOS. Web MIDI only works on `https://` or `localhost`.
- Every activity must work with no MIDI device, using the QWERTY + mouse fallback (lower row `z…m` = C3–B3, upper row `q…p` = C4–E5, number row for black keys).
- The sustain pedal (CC64) is ignored for chord matching but recorded in the event stream.
- Genres (exact strings): `Pop`, `Rock`, `R&B/Soul`, `Jazz`, `K-pop`, `J-pop/Anime`, `Game`.
- Seed songs: `verified: false`, YouTube `id: null` (never guessed), `hooks: []`. **Melodies never go in the public repo.** They live in content packs (spec §5.5), in `private/` locally (gitignored) and in the private `keys-n-ears-content` repo. Hooks are 4–16 notes.
- Layering order: seeds → packs (by `createdAt`) → user edits. User-edited songs are never changed by packs.
- iPad: layouts work at ≥ 768 px wide in both orientations; controls ≥ 44 px tall. No touch-to-play (on-screen keys stay mouse-only).
- Roman numerals: minor keys are analysed in minor (Am–F–C–G in A minor = `i–VI–III–VII`). Key modes in v1 are `major` and `minor` only (mixolydian songs are analysed in major with ♭VII).
- Matching: triads/7ths/sus/add9/dim/m7♭5 need all tones (5th optional when lenient). Extended (9/11/13/altered) need only the essential tones (3rd, 7th, extension). "Strict voicing" requires all tones. A slash note must be the lowest note.
- Difficulty score in [0, 1]. Timed: `clamp(ms / (3 × target))` with targets of 2000 ms per chord and 1000 ms per hook note. Accuracy items: `1 − accuracy`. Hint: `max(score, 0.7)`. Skip: `1`.
- Look: keep the prototype's palette, CSS tokens and dark mode (`style.css`).
- Pure modules must not touch `window`, `document`, or `navigator`.

## Review Focus

1. **MIDI device unplugged mid-drill** → notes held from that device are released (no stuck keys), and the status text says it disconnected. Test: Task 5 `releaseSource`.
2. **Song with an unparseable chord symbol** (seed typo or user entry such as `Bbmaj7#11`) → that song loads with a visible error in the library and editor. Other songs and the app keep working. Test: Task 8 `normalizeSong reports unparseable chords`.
3. **Import of a wrong or corrupt JSON file** → import is refused with a message, and existing data is untouched. Test: Task 8 `parseImport rejects…`.
4. **A bad content pack** (malformed JSON, wrong `kind`, hooks for a song id that doesn't exist, a hook with 30 notes) → that pack, or just the bad hooks, is skipped with a message naming the pack. Other packs and the library still load, and user edits are untouched. Tests: Task 8 `parsePack…` and `mergeLibrary packs…`.
5. **YouTube video can't be embedded, or the song has no video ID** → the editor shows "Find on YouTube" and "Open on YouTube", and tap-sync is disabled with a reason. Nothing crashes. Verify: Task 9 steps.

---

### Task 1: Git, folder layout, and moving the prototype into it

**Files:**
- Move: `src/chords.js` → `src/theory/chords.js`; `src/scheduler.js` → `src/core/scheduler.js`; `src/input.js` → `src/core/midi.js`; `src/synth.js` → `src/core/fallback-synth.js`; `src/keyboard.js` → `src/ui/keyboard.js`; `src/app.js` → `src/views/drill.js`
- Split: `tests/chords.test.js` → `tests/theory/chords.test.js` + `tests/core/scheduler.test.js`
- Create: `.gitignore` (`node_modules/`, `.DS_Store`, `private/`)
- Modify: `index.html` (script path), `package.json` (`"test": "node --test tests/"` still finds nested tests), the comment at the top of `src/core/scheduler.js`

Moves use `git mv` after the first commit, so history shows them as renames. No file is deleted.

- [ ] **Step 1:** `git init`, then commit the prototype exactly as it is: `git add -A && git commit -m "chore: chord drill prototype"`.
- [ ] **Step 2:** `git mv` each file listed above and fix the relative imports (e.g. `../theory/chords.js`).
- [ ] **Step 3:** Split the test file. Scheduler tests go to `tests/core/scheduler.test.js`. Fix the scheduler comment to point there.
- [ ] **Step 4:** Run `npm test`. Expected: 12 pass, 0 fail.
- [ ] **Step 5:** `npm run dev`, open `http://localhost:8000`. Expected: the drill works as before (play C–E–G with `q e t` when C is shown, and it turns green).
- [ ] **Step 6:** Commit: `git commit -am "refactor: move prototype into theory/core/ui/views layout"`.

---

### Task 2: Chord vocabulary, symbol parser, extended matching

**Files:**
- Modify: `src/theory/chords.js`
- Create: `src/theory/parse.js`
- Test: `tests/theory/chords.test.js`, `tests/theory/parse.test.js`

**Interfaces:**
- Produces, in `chords.js`:
  - `Chord` shape: `{ id, symbol, root, quality, inversion, tones: [{name, pc, semis}], pcs: Set<number>, essential: Set<number>|null, bassPc: number|null, bassName: string|null }`
  - `makeChord(rootName, quality, inversion = 0) -> Chord` (existing; sets `essential`)
  - `withBass(chord, bassName) -> Chord`: slash chord with any bass note, including non-chord tones (`F/G`). `symbol`/`id` become `F/G`.
  - `matches(chord, heldNotes, { lenient = true, strict = false }) -> boolean`
  - `QUALITIES` gains a `family: 'extended'` group, plus `aug`, `dim7`, `6`, `m6`, `7sus4`, `madd9` (in existing families: `aug`/`dim7` → `diminished`, the others → `color`).
- Produces, in `parse.js`: `parseChordSymbol(str: string) -> Chord | null` (`null` when it can't be parsed. It never throws.)

New qualities (tone = `[semis, letterSteps]`, essential = list of semis):

| key | symbol | tones | essential |
|---|---|---|---|
| `aug` | `aug` | 0/0 4/2 8/4 | – |
| `dim7` | `dim7` | 0/0 3/2 6/4 9/6 | – |
| `6` | `6` | 0/0 4/2 7/4 9/5 | – |
| `m6` | `m6` | 0/0 3/2 7/4 9/5 | – |
| `7sus4` | `7sus4` | 0/0 5/3 7/4 10/6 | – |
| `madd9` | `madd9` | 0/0 3/2 7/4 14/1 | – |
| `9` | `9` | 0/0 4/2 7/4 10/6 14/1 | 4 10 14 |
| `m9` | `m9` | 0/0 3/2 7/4 10/6 14/1 | 3 10 14 |
| `maj9` | `maj9` | 0/0 4/2 7/4 11/6 14/1 | 4 11 14 |
| `m11` | `m11` | 0/0 3/2 7/4 10/6 14/1 17/3 | 3 10 17 |
| `13` | `13` | 0/0 4/2 7/4 10/6 14/1 21/5 | 4 10 21 |
| `7b9` | `7♭9` | 0/0 4/2 7/4 10/6 13/1 | 4 10 13 |
| `7#9` | `7♯9` | 0/0 4/2 7/4 10/6 15/1 | 4 10 15 |

Matching rule: held pitch classes ⊆ `pcs ∪ {bassPc}`. Required = `essential` if set and not strict, otherwise all tones (minus the perfect 5th when lenient and the chord has ≥ 4 tones). If `bassPc !== null`, the lowest note's pitch class must equal `bassPc`.

Parser suffix aliases → quality: `''`; `m`/`min`/`-` → `m`; `maj7`/`M7`/`Δ7`/`Δ` → `maj7`; `m7`/`min7`/`-7` → `m7`; `7`; `dim`/`°` → `dim`; `dim7`/`°7` → `dim7`; `m7b5`/`ø`/`ø7` → `m7b5`; `aug`/`+` → `aug`; `sus2`; `sus4`/`sus` → `sus4`; `7sus4`/`7sus`; `add9`/`add2` → `add9`; `madd9`; `6`; `m6`; `9`; `m9`; `maj9`/`M9`; `m11`; `13`; `7b9`; `7#9`. Accept `#`/`♯` and `b`/`♭` in the root, suffix, and bass. If the bass is a chord tone, use the inversion (so spelling matches `makeChord`). Otherwise use `withBass`.

- [ ] **Step 1: Write failing tests**

```js
// tests/theory/parse.test.js
test('parses common symbols', () => {
  for (const [s, q] of [['C','maj'],['F#m7b5','m7b5'],['Gsus4','sus4'],['Cadd9','add9'],['E7','7'],
                        ['Gm9','m9'],['F13','13'],['C7#9','7#9'],['Bbmaj7','maj7'],['Ebm','m'],['C°7','dim7']])
    assert.equal(parseChordSymbol(s).quality, q, s);
});
test('slash chords: inversion vs foreign bass', () => {
  assert.equal(parseChordSymbol('Bb/D').inversion, 1);
  const fg = parseChordSymbol('F/G');
  assert.equal(fg.bassName, 'G');
  assert.equal(fg.symbol, 'F/G');
});
test('unparseable returns null', () => {
  for (const s of ['', 'H7', 'Cmaj7#11', 'C/', 'xyz']) assert.equal(parseChordSymbol(s), null, s);
});

// tests/theory/chords.test.js (additions)
test('extended chords accept shell/rootless voicings', () => {
  const g9 = parseChordSymbol('G9');                  // G B D F A
  assert.ok(matches(g9, [59, 65, 69]));               // B F A rootless
  assert.ok(!matches(g9, [43, 59, 65]));              // missing the 9th
  assert.ok(!matches(g9, [59, 65, 69], { strict: true }));
  assert.ok(!matches(g9, [59, 65, 69, 72]));          // C is outside the chord
});
test('foreign-bass slash chord', () => {
  const fg = parseChordSymbol('F/G');
  assert.ok(matches(fg, [43, 65, 69, 72]));
  assert.ok(!matches(fg, [53, 65, 69, 72]));          // G missing
  assert.ok(!matches(fg, [65, 67, 69, 72]));          // G not lowest
});
test('every quality spells and reveals validly', () => {
  for (const q of Object.keys(QUALITIES)) {
    const c = makeChord('E♭', q);
    assert.ok(matches(c, revealVoicing(c), { strict: true }), q);
  }
});
```

- [ ] **Step 2:** `npm test`. Expected: the new tests FAIL (`parseChordSymbol` not found).
- [ ] **Step 3:** Implement the qualities, `withBass`, the `matches` options, and `parse.js` as specified. `revealVoicing` must include the foreign bass at octave 3.
- [ ] **Step 4:** `npm test`. Expected: all pass, including the 12 originals.
- [ ] **Step 5:** Commit: `feat(theory): extended chords, symbol parser, essential-tone matching`.

---

### Task 3: Roman numerals, loop families, voice leading

**Files:**
- Create: `src/theory/roman.js`, `src/theory/voicing.js`
- Test: `tests/theory/roman.test.js`, `tests/theory/voicing.test.js`

**Interfaces:**
- Consumes: `Chord` from Task 2.
- Produces:
  - `Key` shape: `{ tonic: string, mode: 'major' | 'minor' }`
  - `toRoman(chord: Chord, key: Key, { suffix = true } = {}) -> string`, e.g. `'vi'`, `'♭VII'`, `'V7/V'`, `'iiø7'`, `'Imaj7'`. With `suffix: false` the result is the bare numeral (`'V/V'`, `'ii'`).
  - `loopOf(chords: Chord[]) -> Chord[]`: collapses consecutive duplicates (same root + triad class), then reduces to the shortest repeating period.
  - `loopFamily(chords: Chord[], key: Key) -> { id: string, label: string } | null`: `null` when the loop has fewer than 2 or more than 8 chords.
  - `upperVoiceMove(prevNotes: number[], nextNotes: number[]) -> number` (in `voicing.js`)

Algorithms (not fixed by the tests alone):
- **toRoman:** the scale is major `[0,2,4,5,7,9,11]` or natural minor `[0,2,3,5,7,8,10]`. Degree = root's interval from the tonic.
  1. If the chord is major-type (`maj`, `7`, `9`, `13`, `7b9`, `7#9`) and not diatonic, and its root is a perfect 5th above a diatonic scale degree whose diatonic triad is not diminished: label it `V` (+ `7` if 7th-type) `/` + the target's bare numeral. If the target is the tonic, drop the `/i` (E major in A minor → `V`).
  2. Otherwise, numeral from the nearest scale degree, with `♭`/`♯` prefix if the root is off-scale (in the major-scale reference for major keys and the minor scale for minor keys). Uppercase when the third is major, lowercase when minor. `°` for dim/dim7, `ø` for m7b5, `+` for aug.
  3. Suffix (when `suffix`): `7`, `maj7`, `9`, `sus4`, etc., from the quality symbol, minus the parts already shown by case/°/ø.
- **loopFamily:** represent each chord as `(rootPc − relMajorTonicPc) mod 12` plus a triad class (`M`/`m`/`d`/`o`), where `relMajorTonicPc` = tonic for major and tonic + 3 for minor. Generate all rotations of the token list. `id` = the lexicographically smallest rotation joined with `-`. `label` = that rotation rendered as major-key numerals (`I-V-vi-IV`).
- **upperVoiceMove:** drop the lowest note of each chord. For each remaining note in `next`, take its smallest distance to any remaining note in `prev`. Return the max (0 if either side has < 1 upper note).

- [ ] **Step 1: Write failing tests**

```js
const C = { tonic: 'C', mode: 'major' }, Am = { tonic: 'A', mode: 'minor' };
const p = (s) => s.split(' ').map(parseChordSymbol);
test('diatonic and borrowed numerals', () => {
  assert.deepEqual(p('C G Am F Bb Ab Fm Bdim').map(c => toRoman(c, C)),
    ['I','V','vi','IV','♭VII','♭VI','iv','vii°']);
});
test('minor keys analysed in minor', () => {
  assert.deepEqual(p('Am F C G E7').map(c => toRoman(c, Am)), ['i','VI','III','VII','V7']);
});
test('secondary dominants', () => {
  assert.equal(toRoman(parseChordSymbol('D7'), C), 'V7/V');
  assert.equal(toRoman(parseChordSymbol('E'), C), 'V/vi');
  assert.equal(toRoman(parseChordSymbol('A7'), C, { suffix: false }), 'V/ii');
});
test('suffixes', () => {
  assert.equal(toRoman(parseChordSymbol('Fmaj7'), C), 'IVmaj7');
  assert.equal(toRoman(parseChordSymbol('Bm7b5'), C), 'viiø7');
  assert.equal(toRoman(parseChordSymbol('Dm9'), C), 'ii9');
});
test('loop families merge rotations and relative minor', () => {
  const a = loopFamily(p('C G Am F'), C);
  const b = loopFamily(p('Am F C G'), Am);
  const c = loopFamily(p('F C G Am'), C);
  assert.equal(a.id, b.id); assert.equal(a.id, c.id);
  assert.equal(a.label.split('-').length, 4);
});
test('loopOf reduces repeats', () => {
  assert.equal(loopOf(p('C C G Am F C G Am F')).length, 4);
});
test('loop family bounds', () => {
  assert.equal(loopFamily(p('C'), C), null);
});
test('voice leading distance', () => {
  assert.equal(upperVoiceMove([48, 64, 67, 72], [53, 65, 69, 72]), 2);   // C → F/A-ish upper voices
  assert.equal(upperVoiceMove([60, 64, 67], [62, 74, 77]), 10);
});
```

- [ ] **Step 2:** `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement `roman.js` and `voicing.js` per the algorithms above.
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(theory): roman numerals, loop families, voice-leading distance`.

---

### Task 4: Score-based scheduler

**Files:**
- Modify: `src/core/scheduler.js`
- Test: `tests/core/scheduler.test.js`

**Interfaces:**
- Produces:
  - `TARGETS = { chord: 2000, progressionChord: 2000, hookNote: 1000 }`
  - `scoreFromTime(ms: number, targetMs: number) -> number` = `clamp(ms / (3 * targetMs), 0, 1)`
  - `scoreFromAccuracy(acc: number) -> number` = `clamp(1 - acc, 0, 1)`
  - `withHint(score) -> number` = `Math.max(score, 0.7)`; `SKIP_SCORE = 1`
  - `record(stats, key: string, score: number, rawMs?: number) -> stats`. Entry: `{ n, ema, lastMs, lastAt }`, EMA alpha 0.35 on score.
  - `weightFor(stats, key) -> number`: unseen = 3, otherwise `0.25 + 7.75 * ema²`
  - `pickNext(items, stats, previous, { keyOf = (i) => i.id, tooSimilar = () => false } = {}, rand = Math.random) -> item`
  - `weakest(stats, { prefix = '', count = 5 } = {}) -> [{ key, n, ema, lastMs }]`
- Item keys are namespaced: `chord:<id>`, `prog:<familyId>`, `hook:<songId>/<i>`, `rhythm:<id>`, `style:<id>`.

- [ ] **Step 1: Rewrite the scheduler tests**

```js
test('score from time', () => {
  assert.equal(scoreFromTime(2000, 2000), 1/3);
  assert.equal(scoreFromTime(99999, 2000), 1);
  assert.equal(scoreFromTime(0, 2000), 0);
});
test('hint floor and skip', () => { assert.equal(withHint(0.1), 0.7); assert.equal(SKIP_SCORE, 1); });
test('weights: unseen 3, hard > easy', () => {
  let s = record({}, 'chord:C', 0.1, 600);
  s = record(s, 'chord:F♯', 0.9, 5400);
  assert.equal(weightFor(s, 'chord:Db'), 3);
  assert.ok(weightFor(s, 'chord:F♯') > weightFor(s, 'chord:C'));
  assert.equal(s['chord:C'].lastMs, 600);
});
test('weakest filters by prefix', () => {
  let s = record({}, 'chord:C', 0.9); s = record(s, 'prog:x', 1);
  assert.deepEqual(weakest(s, { prefix: 'chord:' }).map(e => e.key), ['chord:C']);
});
test('pickNext respects tooSimilar', () => { /* existing 500-iteration test, ported to keyOf/tooSimilar */ });
```

- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Then update `src/views/drill.js` to record `chord:<id>` with `scoreFromTime(ms, TARGETS.chord)`, `withHint`, `SKIP_SCORE`, and show `weakest(..., {prefix:'chord:'})` using `lastMs`/score. Use a new storage key `chord-drill:v2` (old v1 stats are ignored, per spec).
- [ ] **Step 4:** `npm test` passes. In the browser, the drill still records and shows the weakest list.
- [ ] **Step 5:** Commit: `feat(core): score-based scheduler with namespaced items`.

---

### Task 5: MIDI layer (events, output, device choice)

**Files:**
- Modify: `src/core/midi.js` (was `input.js`)
- Test: `tests/core/midi.test.js`

**Interfaces:**
- Produces:
  - Pure, exported for tests: `parseMidiMessage(data: Uint8Array|number[]) -> { type: 'on'|'off'|'pedal', note?, velocity?, value? } | null`, and `releaseSource(held: Map<number, string>, source: string) -> number[]` (notes released).
  - `createMidi({ onStatus }) -> Midi`, where `Midi` = `{ held(): Set<number>, on(type: 'change'|'note'|'pedal'|'devices', fn) -> unsubscribe, toggle(note), clear(), inputs(): [{id,name}], outputs(): [{id,name}], selectInput(id|'all'), selectOutput(id|null), send(bytes: number[], timestampMs?: number) }`
  - `note` event payload: `{ type: 'on'|'off', note, velocity, time: performance.now(), source: 'midi'|'qwerty'|'mouse' }`. `change` payload: `{ held: Set<number>, source }`. `pedal` payload: `{ value, time }`.
- Held notes are tracked as `Map<note, source>`, so a disconnect releases only that device's notes.
- On an input's `statechange` to `disconnected`: call `releaseSource(held, 'midi')`, emit `change`, and update the status text to `MIDI device disconnected.`
- Input and output selections persist via `localStorage` (`hub:midi`), wrapped in try/catch.

- [ ] **Step 1: Write failing tests**

```js
test('parse note on/off/pedal', () => {
  assert.deepEqual(parseMidiMessage([0x90, 60, 100]), { type: 'on', note: 60, velocity: 100 });
  assert.deepEqual(parseMidiMessage([0x91, 60, 0]), { type: 'off', note: 60, velocity: 0 });
  assert.deepEqual(parseMidiMessage([0x80, 60, 64]), { type: 'off', note: 60, velocity: 64 });
  assert.deepEqual(parseMidiMessage([0xB0, 64, 127]), { type: 'pedal', value: 127 });
  assert.equal(parseMidiMessage([0xB0, 7, 100]), null);
  assert.equal(parseMidiMessage([0xF8]), null);
});
test('releaseSource only drops that source', () => {
  const held = new Map([[60, 'midi'], [64, 'qwerty'], [67, 'midi']]);
  assert.deepEqual(releaseSource(held, 'midi').sort(), [60, 67]);
  assert.deepEqual([...held.keys()], [64]);
});
```

- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. `send` is a no-op without a selected output.
- [ ] **Step 4:** `npm test` passes. In the browser, the drill still works via QWERTY. The status shows `MIDI permission denied` or `No MIDI device found` when no device is attached.
- [ ] **Step 5:** Commit: `feat(core): midi event stream, output, device selection, disconnect release`.

---

### Task 6: Sound engine

**Files:**
- Create: `src/core/sound.js`
- Modify: `index.html` (add `<script src="https://cdn.jsdelivr.net/npm/tone@15.0.4/build/Tone.js"></script>` before the module script. If that exact path 404s, use the matching UMD file listed at `https://cdn.jsdelivr.net/npm/tone@15.0.4/build/` and record the URL in the commit message.)

**Interfaces:**
- Consumes: `Midi.send` (Task 5), `fallback-synth.js` (`noteOn`, `noteOff`).
- Produces: `createSound(midi) -> Sound`, where `Sound` = `{ ready: Promise<'sampler'|'fallback'>, setOutput('piano'|'browser'), output(), playNotes(notes: number[], { when = 0, duration = 1, velocity = 0.7 } = {}), playSequence(events: [{ notes, time, duration }]) -> { stop() }, drone: { start(pc: number), stop() }, metronome: { start(bpm, beatsPerBar = 4, onBeat?), stop() }, echo(held: Set<number>) }`
  - `when`/`time` are seconds relative to now.
  - `echo(held)` replaces the prototype's `synth.sync`: it sounds QWERTY/mouse notes in the browser and is never routed to the piano.
  - Output `piano` sends note on/off via `midi.send` with `performance.now()`-based timestamps. It falls back to `browser` when no output is selected.
  - Sampler: `Tone.Sampler` with the Salamander set at `https://tonejs.github.io/audio/salamander/` (notes A0…C8 every minor third, as in the Tone.js docs). If loading fails within 10 s, `ready` resolves `'fallback'` and every sound uses the fallback synth.
  - The drone always uses the browser (a soft sustained low tonic + fifth). The metronome always uses the browser (short click; accent on beat 1).
  - Browsers need a user gesture before audio: start the AudioContext / `Tone.start()` on the first key, click, or MIDI note.

- [ ] **Step 1:** Implement `sound.js`. Wire the drill: QWERTY/mouse notes call `sound.echo(held)` instead of `synth.sync`.
- [ ] **Step 2:** Browser check: in the devtools console, run `ctx.sound.playNotes([60,64,67])` (expose `window.ctx` only when `location.hostname === 'localhost'`). Expected: a piano-sampled C major, and `await ctx.sound.ready` → `'sampler'`.
- [ ] **Step 3 (Review Focus #4):** In devtools, block the request URL pattern `tonejs.github.io` and reload. Expected: `ready` → `'fallback'`, and `playNotes` still sounds (triangle synth).
- [ ] **Step 4:** Check that `metronome.start(90)` clicks with an accented downbeat and `drone.start(0)` sustains until `stop()`.
- [ ] **Step 5:** Commit: `feat(core): sound engine with sampler, midi-out, drone, metronome, fallback`.

---

### Task 7: App shell, router, home, Chord Drill as a view — then MIDI checkpoint

**Files:**
- Create: `src/main.js`, `src/core/router.js`, `src/views/home.js`
- Modify: `index.html` (shell markup only: header + `<main id="view">`), `style.css` (header, tiles), `src/views/drill.js` (becomes a view)

**Interfaces:**
- Consumes: `createMidi`, `createSound`.
- Produces:
  - `View` contract: `export function mount(el: HTMLElement, params: object, ctx: Ctx) -> (() => void)`. It returns an unmount function that must remove every listener and stop every sound or timer it started.
  - `Ctx` = `{ midi, sound, store, library, settings, navigate(hash) }`. `store` and `library` are `null` until Task 8 and Task 9. Views written now must not use them.
  - `createRouter(routes: Array<[pattern: string, loader: () => Promise<{mount}>]>, el, ctx) -> { start(), navigate(hash) }`. Patterns use `:param` (`/song/:id/edit`). An unknown route goes to `#/`.
  - Routes now: `#/` → home, `#/drill` → drill. Tiles for future activities render as disabled with the label "Coming soon".
- Header: app name (link to `#/`), MIDI status, input select, output select ("Prompts: Browser / <device>"), genre filter (multi-select of the 7 genres, stored in `settings.genres`, default all).
- Home sketch from spec §5.1. Tiles: Song Studio, Name That Progression, Melody Echo, Style Lab, Lead Sheet Play-Along, Chord Drill, Progression Explorer, Song Library. The "Recent" strip shows a placeholder until Task 11.

- [ ] **Step 1:** Implement the router, shell, and home. Move the drill DOM from `index.html` into `drill.js`'s `mount`.
- [ ] **Step 2:** Browser check (chrome-devtools): emulate 1180×820 and 820×1180 (iPad Air) with `emulate`/`resize_page`. Expected: no horizontal scroll, header controls ≥ 44 px tall, chord symbol and on-screen keyboard fully visible. Then at desktop size: `#/` shows 8 tiles. Click Chord Drill → it works via QWERTY. Click the app name → home. Then visit `#/drill` again and confirm no duplicate keydown handlers: one Space press reveals the hint once, and `getEventListeners(window).keydown.length` is the same after 3 round-trips.
- [ ] **Step 3:** `npm test` passes. Commit: `feat: app shell, router, home, chord drill view`.
- [ ] **Step 4: Deploy for the MIDI checkpoint. Ask the user first** (it creates a public GitHub repo): `gh repo create chord-drill --public --source=. --push`, then enable Pages from `main` / root (`gh api repos/{owner}/chord-drill/pages -X POST -f "source[branch]=main" -f "source[path]=/"`).
- [ ] **Step 5: User checkpoint (≈5 min):** on the MacBook, connect the P-515 via USB, open the Pages URL in Chrome, and allow MIDI. Expected: the header shows the P-515. In Chord Drill, playing a chord turns it green. Choosing the P-515 as "Prompts" output and pressing Hint plays the hint notes through the piano (wire Hint → `sound.playNotes(revealVoicing(chord))`). Record the result in the commit or notes. **Do not start Task 8 until this works, or the failure is understood.**
  - **iPad part (optional, same session):** install Jazz-Soft's "Web MIDI Browser" from the App Store, connect the P-515 to the iPad by USB-C-to-USB-B, and open the Pages URL inside that app. Expected: same results as on the Mac. If it fails, note the error. The iPad then stays display-only, and the build continues (the user practices with MIDI on the laptop).

---

### Task 8: Song schema, library merge, tap-sync helpers, store, export/import

**Files:**
- Create: `src/library/schema.js`, `src/library/library.js`, `src/library/tapsync.js`, `src/core/store.js`
- Test: `tests/library/schema.test.js`, `tests/library/library.test.js`, `tests/library/tapsync.test.js`

**Interfaces:**
- Consumes: `parseChordSymbol` (Task 2), `loopOf`/`loopFamily`/`toRoman` (Task 3).
- Produces:
  - `GENRES` (the 7 exact strings).
  - Song shape = spec §5.5 with these fixes: sections are `[{ name, bars: string[][], key?: Key }]`; `form: [{ section, start: number|null, chordTimes: number[]|null }]`; `hooks: [{ name, section, notes: [midi, startBeat, durBeats][], verified }]`; `youtube: { id: string|null, offset: number }`; `source: 'seed'|'user'|'seed-edited'`.
  - `normalizeSong(raw) -> { song, errors: string[] }`: fills defaults (`verified:false`, `youtube:{id:null,offset:0}`, `form` = one entry per section in order if missing, `hooks:[]`) and collects errors without throwing. Errors: missing id/title/artist, genre not in `GENRES`, no sections, unparseable chord (`Verse bar 3: "Bbmaj7#11"`), form referencing a missing section, hook outside 4–16 notes.
  - `sectionChords(song, sectionName) -> [{ symbol, chord: Chord|null, bar, beat, beats }]` (bar's beats split evenly unless a symbol is given as `"C:3"` meaning 3 beats).
  - `songProgressions(song) -> [{ section, key, romans: string[], family: {id,label}|null }]`
  - `chordAtTime(song, t: number) -> { formIndex, chordIndex, symbol } | null` (uses `chordTimes`; `null` before the first time or for unsynced occurrences).
  - `Pack` shape: `{ app: 'practice-hub', kind: 'pack', version: 1, id, title, createdAt, songs: Song[], hooks: { [songId]: Hook[] } }`.
  - `parsePack(text: string) -> { ok: true, pack, warnings: string[] } | { ok: false, error: string }`. Rejects bad JSON, wrong `app`/`kind`/`version`, missing `id`. Songs with `normalizeSong` errors are kept but reported in `warnings`. Hooks outside 4–16 notes are dropped with a warning.
  - `mergeLibrary(seeds: Song[], packs: Pack[], userSongs: Song[]) -> { songs: Song[], warnings: string[] }`: apply packs in `createdAt` order. A pack song replaces the same-id song (`source: 'pack'`). Pack hooks replace same-`name` hooks and append the rest; hooks for unknown ids produce a warning (`pack <id>: no song "<songId>"`). Then user songs replace same-id songs (`source: 'seed-edited'` if the id existed, otherwise `'user'`). Sorted by title.
  - `filterByGenre(songs, genres: string[]) -> Song[]` (empty or all-7 = no filter).
  - `buildExport({ songs, kv }) -> { app: 'practice-hub', version: 1, exportedAt, songs, kv }`; `parseImport(text: string) -> { ok: true, data } | { ok: false, error: string }`.
  - `tapsync.js`: `applyTaps(taps: number[], chordCount: number) -> { chordTimes: number[], warning: string|null }` (uses the first `chordCount` taps; warns if fewer or more were given); `shiftOccurrence(prev: {start, chordTimes}, newStart: number) -> { start, chordTimes }` (keeps relative timing).
  - `store.js` (browser only): `openStore() -> Promise<Store>`, `Store = { getSongs(), putSong(song), deleteSong(id), getPacks(), putPack(pack, sha?), deletePack(id), get(key), set(key, value), exportAll() -> object, importAll(data, { mode: 'merge'|'replace' }) }`. IndexedDB database `practice-hub` v1, stores `songs` (keyPath `id`), `packs` (keyPath `id`, record `{ id, sha, pack }`), and `kv`. `importAll` validates via `parseImport` before writing, in a single transaction. Backups include packs.
  - `library.js` (browser part): `loadLibrary(store) -> Promise<{ songs, errorsById: Map<string,string[]>, warnings: string[], reload() }>`, which fetches `data/seeds/index.json` (a list of file names) and each file (an array of raw songs), then calls `mergeLibrary(seeds, await store.getPacks(), await store.getSongs())`.

- [ ] **Step 1: Write failing tests** (selection; implement all listed)

```js
test('normalizeSong fills defaults', () => {
  const { song, errors } = normalizeSong({ id: 'x', title: 'X', artist: 'A', genres: ['Pop'],
    key: { tonic: 'C', mode: 'major' }, bpm: 90, sections: [{ name: 'Verse', bars: [['C','G'],['Am','F']] }] });
  assert.deepEqual(errors, []);
  assert.equal(song.verified, false);
  assert.deepEqual(song.form, [{ section: 'Verse', start: null, chordTimes: null }]);
});
test('normalizeSong reports unparseable chords', () => {   // Review Focus #2
  const { errors } = normalizeSong({ id: 'x', title: 'X', artist: 'A', genres: ['Pop'], key: { tonic: 'C', mode: 'major' },
    sections: [{ name: 'Verse', bars: [['C'], ['Bbmaj7#11']] }] });
  assert.match(errors[0], /Verse bar 2: "Bbmaj7#11"/);
});
test('normalizeSong rejects unknown genre and bad form ref', () => { /* 'Kpop' → error; form section 'Bridge' missing → error */ });
test('sectionChords splits beats', () => {
  // 4/4 bar ['C','G'] → beats 2 + 2; ['C:3','G'] → 3 + 1
});
test('songProgressions uses section key override', () => {
  // section key A minor with Am F C G → romans ['i','VI','III','VII']
});
test('chordAtTime', () => {
  // form[0].chordTimes [10, 12, 14] → t=11 → chordIndex 0; t=14.5 → 2; t=9 → null
});
test('mergeLibrary overlays seeds with user songs', () => {
  const { songs } = mergeLibrary([{ id: 'a', title: 'B' }, { id: 'b', title: 'A' }], [], [{ id: 'a', title: 'B2' }, { id: 'c', title: 'C' }]);
  assert.deepEqual(songs.map(s => [s.id, s.source ?? null]), [['b', null], ['a', 'seed-edited'], ['c', 'user']]);
});
test('mergeLibrary packs: hooks merge by name, later pack wins, user edit wins', () => {
  const seeds = [{ id: 'a', title: 'A', hooks: [{ name: 'Chorus', notes: [] }] }];
  const h = (name, n) => ({ name, notes: Array.from({ length: n }, (_, i) => [60 + i, i, 1]) });
  const p1 = { id: 'p1', createdAt: '2026-11-01', songs: [], hooks: { a: [h('Chorus', 5), h('Riff', 4)], zzz: [h('X', 4)] } };
  const p2 = { id: 'p2', createdAt: '2026-11-02', songs: [], hooks: { a: [h('Chorus', 6)] } };
  const r = mergeLibrary(seeds, [p2, p1], []);
  const a = r.songs[0];
  assert.deepEqual(a.hooks.map(x => [x.name, x.notes.length]), [['Chorus', 6], ['Riff', 4]]);
  assert.match(r.warnings[0], /pack p1: no song "zzz"/);
  const r2 = mergeLibrary(seeds, [p1], [{ id: 'a', title: 'A', hooks: [] }]);
  assert.deepEqual(r2.songs[0].hooks, []);                 // user edit untouched by packs
});
test('parsePack rejects bad packs and drops bad hooks', () => {   // Review Focus #4
  assert.equal(parsePack('{').ok, false);
  assert.equal(parsePack('{"app":"practice-hub","kind":"backup","version":1,"id":"x"}').ok, false);
  const long = { name: 'L', notes: Array.from({ length: 30 }, (_, i) => [60, i, 1]) };
  const r = parsePack(JSON.stringify({ app: 'practice-hub', kind: 'pack', version: 1, id: 'x', createdAt: '2026-11-18', songs: [], hooks: { a: [long] } }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.pack.hooks.a, []);
  assert.equal(r.warnings.length, 1);
});
test('parseImport rejects bad input', () => {            // Review Focus #3
  assert.equal(parseImport('not json').ok, false);
  assert.equal(parseImport('{"app":"other","version":1}').ok, false);
  assert.equal(parseImport('{"app":"practice-hub","version":99,"songs":[],"kv":{}}').ok, false);
  assert.equal(parseImport(JSON.stringify(buildExport({ songs: [], kv: {} }))).ok, true);
});
test('applyTaps / shiftOccurrence', () => {
  assert.deepEqual(applyTaps([1, 2, 3], 3), { chordTimes: [1, 2, 3], warning: null });
  assert.ok(applyTaps([1, 2], 3).warning);
  assert.deepEqual(shiftOccurrence({ start: 10, chordTimes: [10, 12] }, 50), { start: 50, chordTimes: [50, 52] });
});
```

- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the pure modules, then `store.js`.
- [ ] **Step 4:** `npm test` passes. In the browser console: `const s = await openStore(); await s.set('t', 1); await s.get('t')` → `1`. `importAll` with a corrupt object leaves `get('t')` at `1`.
- [ ] **Step 5:** Commit: `feat(library): song schema, merge, tap-sync helpers, indexeddb store, export/import`.

---

### Task 9: Song Library and Song Editor views (with YouTube wrapper and tap-sync)

**Files:**
- Create: `src/core/youtube.js`, `src/core/github-sync.js`, `src/views/library.js`, `src/views/song-editor.js`
- Test: `tests/core/youtube.test.js`, `tests/core/github-sync.test.js`
- Modify: `src/main.js` (open the store, load the library into `ctx`, add routes `#/library`, `#/song/new`, `#/song/:id/edit`), `src/views/home.js` (enable the Library tile)

**Interfaces:**
- Consumes: everything from Task 8; `ctx.midi`, `ctx.sound`.
- Produces:
  - `createYouTube(el) -> Promise<Player>`, `Player = { load(id, start = 0), play(), pause(), seek(t), setRate(r), time(), setLoop(a, b), clearLoop(), on('state'|'error', fn), destroy() }`. Error codes 101/150 → `error` event `'not-embeddable'`. Loads `https://www.youtube.com/iframe_api` once.
  - `parseYouTubeId(input: string) -> string|null` (pure, exported, tested in `tests/core/youtube.test.js`). Handles `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, a bare 11-character id, and a `&t=` suffix.
  - `src/core/github-sync.js`: `syncPacks({ owner, repo, token }, store, fetchFn = fetch) -> Promise<{ added: string[], updated: string[], skipped: string[], errors: string[] }>`. Lists `GET https://api.github.com/repos/{owner}/{repo}/contents/packs` (header `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`). For each `.json` file whose `sha` differs from the stored one, it fetches the file (`Accept: application/vnd.github.raw+json`), runs `parsePack`, and calls `putPack`. Packs deleted from the repo are kept locally (they're only removed with a manual Remove button). 401/403/404 give one clear error (`Token rejected or repo not found`). Tested with an injected fake `fetchFn` in `tests/core/github-sync.test.js`: new pack added, unchanged sha skipped, invalid pack reported and not stored, 401 → error.
- **Library view:** list with title, artist, genres, key, badges (`unverified`, `needs sync`, `has errors` with the messages on hover/expand, `has melody` when hooks exist). Search box + global genre filter. Buttons: New song, Edit, Export (downloads a backup JSON), Import (file picker; a `kind: 'pack'` file → `parsePack` → `putPack`; a backup → `parseImport` → confirm merge/replace → `importAll`; then reload). Library warnings (from `mergeLibrary`/packs) show in a collapsible "Content notes" box.
- **Content settings** (section on the Library view): GitHub owner, repo (default `keys-n-ears-content`), token (password field, stored in kv `contentSync`), a **Sync** button showing the `syncPacks` result, and the list of installed packs (title, date, song/hook counts, Remove).
- **Song Editor:** fields for title, artist, genres (checkboxes), year, key tonic + mode, bpm, time signature. Sections: name, optional key override, and bars as a text area (one bar per line, chords separated by spaces, e.g. `C G` / `Am F`), with live validation from `normalizeSong`. Form: an ordered list of section names (add/remove/reorder). Hooks: "Record hook" captures MIDI/QWERTY note-ons until Stop; timing is quantized to 8th notes at the song bpm; up to 16 notes. "I checked this" sets `verified: true`. Save → `store.putSong` (seed edits become `seed-edited`). Also Cancel and Delete (user songs only, with confirm).
  - YouTube: a paste box (`parseYouTubeId`) and a "Find on YouTube" link (`https://www.youtube.com/results?search_query=<artist title>` in a new tab). With no id: tap-sync is disabled, with the text "Add a YouTube link to sync". When the video can't be embedded: show "Open on YouTube", and tap-sync is disabled with the text "This video can't be embedded; try another upload".
  - Tap-sync panel: choose a form occurrence → play (rate 1× or 0.75×) → Space at each chord change → Stop → `applyTaps` (show the warning if any) → store into `form[i]`. Also "Copy timing from previous <section>" → `shiftOccurrence` at the current video time.

- [ ] **Step 1:** Write the `parseYouTubeId` tests (the 6 forms above + `'hello'` → `null`), run them (FAIL), implement, run (PASS).
- [ ] **Step 2:** Implement `youtube.js` and both views.
- [ ] **Step 3: Browser checks**
  - Create a song with the bars `C G` / `Am F`, then save and reload. Expected: it's still in the list after reload.
  - Type `Bbmaj7#11` in a bar. Expected: an inline error, and Save keeps the song but shows the `has errors` badge.
  - No YouTube id → tap-sync disabled with the reason shown (Review Focus #5).
  - Paste any embeddable video link, tap 4 times in a 4-chord occurrence → `form[0].chordTimes` has 4 numbers (check in the console via `ctx.store.getSongs()`).
  - Export, then import that file in replace mode → same songs. Import a `.txt` file → refused with a message, and data unchanged.
  - Import a small test pack (one hook for `let-it-be` once seeds exist, or for the song created above) → the `has melody` badge appears. Remove the pack → the badge disappears.
  - Sync with an empty token → a clear error, nothing else changes.
- [ ] **Step 4:** `npm test` passes. Commit: `feat: song library and editor with youtube tap-sync`.

---

### Task 10: Seed library (49 songs), private melody pack, content guide

**Files:**
- Create: `data/seeds/index.json`, `data/seeds/pop.json`, `rock.json`, `rnb-soul.json`, `jazz.json`, `kpop.json`, `jpop-anime.json`, `game.json` (public: charts only, `hooks: []`)
- Create: `private/packs/2026-11-18-seed-hooks.json` (gitignored, never committed to the public repo)
- Create: `docs/adding-content.md`
- Test: `tests/library/seeds.test.js`

Songs (7 per genre). Write each from memory as best effort: key, bpm, sections with chords per bar, and form. Use `verified: false`, `youtube.id: null`, and `hooks: []` for all. In the private pack, write 1–2 hooks per song (4–16 notes, chorus or main riff, `verified: false`), pack id `seed-hooks`, title `Seed melodies`. Extra genres may be added to `genres` where honest (e.g. Let It Be: `["Rock","Pop"]`).

| Genre | Songs |
|---|---|
| Pop | Someone Like You (Adele); Perfect (Ed Sheeran); Shape of You (Ed Sheeran); All of Me (John Legend); Viva La Vida (Coldplay); Riptide (Vance Joy); Rolling in the Deep (Adele) |
| Rock | Let It Be (Beatles); Hey Jude (Beatles); Don't Stop Believin' (Journey); Wonderwall (Oasis); Imagine (John Lennon); Africa (Toto); Clocks (Coldplay) |
| R&B/Soul | Stand By Me (Ben E. King); Just the Two of Us (Grover Washington Jr. ft. Bill Withers); Isn't She Lovely (Stevie Wonder); Ain't No Sunshine (Bill Withers); Lean on Me (Bill Withers); Killing Me Softly (Fugees); Georgia on My Mind (Ray Charles) |
| Jazz | Autumn Leaves; Fly Me to the Moon; All the Things You Are; Blue Bossa; Take the "A" Train; Misty; The Girl from Ipanema |
| K-pop | Spring Day (BTS); Dynamite (BTS); Through the Night (IU); Love Scenario (iKON); Ditto (NewJeans); Hype Boy (NewJeans); Eleven (IVE) |
| J-pop/Anime | Gurenge (LiSA); Unravel (TK from Ling tosite sigure); Lemon (Kenshi Yonezu); Yoru ni Kakeru (YOASOBI); Sparkle (RADWIMPS); A Cruel Angel's Thesis (Yoko Takahashi); Silhouette (KANA-BOON) |
| Game | To Zanarkand (FFX); Aerith's Theme (FFVII); Dearly Beloved (Kingdom Hearts); Megalovania (Undertale); Song of Storms (Zelda: OoT); Corridors of Time (Chrono Trigger); Still Alive (Portal) |

Prefer the original recording's key. If unsure of a section, include fewer sections rather than guessing a whole song.

- [ ] **Step 1: Write the seed test (fails, no files yet)**

```js
test('all seeds load cleanly', async () => {
  const files = JSON.parse(await readFile('data/seeds/index.json', 'utf8'));
  const songs = (await Promise.all(files.map(f => readFile(`data/seeds/${f}`, 'utf8').then(JSON.parse)))).flat();
  assert.equal(songs.length, 49);
  assert.equal(new Set(songs.map(s => s.id)).size, 49);
  for (const raw of songs) {
    const { song, errors } = normalizeSong(raw);
    assert.deepEqual(errors, [], raw.id);
    assert.equal(song.verified, false, raw.id);
    assert.equal(song.youtube.id, null, raw.id);
  }
  for (const g of GENRES) assert.ok(songs.filter(s => s.genres[0] === g).length >= 7, g);
});
test('most seed sections yield a loop family', async () => { /* ≥ 60% of songs have ≥1 section with family !== null */ });
test('no melodies in public seeds', async () => { /* every seed song has hooks.length === 0 */ });
test('private seed pack is valid when present', async (t) => {
  let text; try { text = await readFile('private/packs/2026-11-18-seed-hooks.json', 'utf8'); } catch { return t.skip('no private pack'); }
  const r = parsePack(text);
  assert.equal(r.ok, true); assert.deepEqual(r.warnings, []);
  // every hook key is a seed id; ≥ 45 songs have ≥ 1 hook
});
```

- [ ] **Step 2:** `npm test`. Expected: FAIL (`ENOENT`).
- [ ] **Step 3:** Write the 7 genre files + `index.json`, then the private pack.
- [ ] **Step 4:** Write `docs/adding-content.md` (≤ 1 page): pack format with a minimal example, where seed charts go vs. where melodies go, the layering order, how to validate (`npm test` checks every file in `private/packs/`, so generalise the pack test to loop over that folder), and how to publish a pack (push to `keys-n-ears-content/packs/`, then Sync in the app; or Import the file).
- [ ] **Step 5:** `npm test` passes. Check `git status --ignored` shows `private/` as ignored and `git ls-files | grep private` prints nothing. In the browser, `#/library` lists 49 songs, all with the `unverified` badge; the genre filter `K-pop` shows 7. Import the private pack → most songs show `has melody`.
- [ ] **Step 6:** Commit (public files only): `feat(data): 49 seed charts across 7 genres + content guide`.
- [ ] **Step 7: Ask the user first** (creates a private GitHub repo): `gh repo create keys-n-ears-content --private`, then commit `packs/2026-11-18-seed-hooks.json` to it and push. Tell the user how to make the read-only token: GitHub → Settings → Developer settings → Fine-grained tokens → repository access: only `keys-n-ears-content` → Contents: Read-only. They paste it into the app's Content settings and press Sync.

---

### Task 11: Chord Drill upgrades, practice log, song status

**Files:**
- Modify: `src/views/drill.js`, `src/views/home.js`, `src/views/library.js`
- Create: `src/core/practice-log.js`
- Test: `tests/core/practice-log.test.js`, `tests/views/drill-logic.test.js` (pure helpers exported from a new `src/views/drill-logic.js`)

**Interfaces:**
- Consumes: `buildPool`, `parseChordSymbol`, `matches`, `upperVoiceMove`, `sectionChords`, `filterByGenre`, scheduler, `ctx.store`.
- Produces:
  - `practice-log.js`: `addActivity(log: Record<string, number[]>, at: Date) -> log` (records a unique minute index per local date `YYYY-MM-DD`); `minutesOn(log, date: Date) -> number`. Stored in kv under `practiceLog`. Every note-on from `ctx.midi` (any view) calls it, wired once in `main.js`.
  - Song status: kv `songStatus` = `{ [songId]: { status: 'new'|'learning'|'can play', lastPracticed: ISO } }`. The Library view shows it and lets you change it. Home "Recent" shows the 3 most recently practiced songs + today's minutes.
  - `drill-logic.js`: `poolFromSongs(songs: Song[]) -> Chord[]` (unique by `id` across all section chords, skipping unparseable ones); `progressionPrompt(song) -> Chord[]` (the first section's chords, for voice-leading mode); `voiceLeadOk(prevNotes, nextNotes, maxMove = 4) -> boolean`.
- Drill settings additions: family `extended` (label `Extended (9, 11, 13, alt)`), "Strict voicing" toggle (passed as `strict` to `matches`), pool source `All chords | From my songs` (songs filtered by the global genre filter), mode `Single chords | Voice leading`.
  - Voice-leading mode: walks a random song's progression one chord at a time and shows the next chord's symbol smaller to the right. A correct answer must match **and** satisfy `voiceLeadOk` against the notes held for the previous correct chord. If it matches but jumps too far, show "Right chord, smoother move?" and don't advance.

- [ ] **Step 1: Write failing tests**

```js
test('addActivity counts unique minutes per day', () => {
  let log = {};
  log = addActivity(log, new Date(2026, 10, 18, 9, 0, 5));
  log = addActivity(log, new Date(2026, 10, 18, 9, 0, 50));
  log = addActivity(log, new Date(2026, 10, 18, 9, 2, 0));
  assert.equal(minutesOn(log, new Date(2026, 10, 18)), 2);
  assert.equal(minutesOn(log, new Date(2026, 10, 19)), 0);
});
test('poolFromSongs dedupes and skips bad symbols', () => {
  const songs = [{ sections: [{ name: 'V', bars: [['C', 'G'], ['C', 'Bbmaj7#11']] }], timeSignature: [4, 4] }];
  assert.deepEqual(poolFromSongs(songs).map(c => c.id).sort(), ['C', 'G']);
});
test('voiceLeadOk threshold', () => {
  assert.ok(voiceLeadOk([48, 64, 67, 72], [53, 65, 69, 72]));
  assert.ok(!voiceLeadOk([60, 64, 67], [62, 74, 77]));
});
```

- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the modules and wire the views.
- [ ] **Step 4: Browser checks:** play a few chords → home shows today's minutes ≥ 1. With "From my songs" + genre `Jazz`, the drill shows only chords from jazz seeds (e.g. `Cm7`, `F7`, `B♭maj7`). Voice-leading mode with `C G Am F`: playing C (`c e g` area) then a G in a far-away inversion shows "Right chord, smoother move?". Set a song to "learning" in the Library → it appears under home "Recent" after it's practiced.
- [ ] **Step 5:** `npm test` passes. Commit: `feat(drill): song-based pool, extended chords, strict mode, voice leading; practice log and song status`.
- [ ] **Step 6:** Push (`git push`). Pages updates. Tell the user the foundation is live and that Plan 2 (Song Studio + Name That Progression) is next.
